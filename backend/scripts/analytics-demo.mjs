/**
 * The Analytics demo dataset from the command line. It writes and deletes analytics_demo_* rows and the institution's
 * "Include demo data" switch (tenants.analyticsDemoEnabled, the same switch as Admin → Analytics → Data health) only:
 * never a portal account, never the real analytics tables, never any other system. Every change is audited.
 *
 *   node scripts/analytics-demo.mjs status   --tenant <slug>
 *   node scripts/analytics-demo.mjs generate --tenant <slug>            (dry run: says what it would do)
 *   node scripts/analytics-demo.mjs generate --tenant <slug> --apply    (create, or rebuild and repair, then include in reports)
 *   node scripts/analytics-demo.mjs reset    --tenant <slug> --apply    (stop including it and delete the demo rows only)
 *
 * Open Analytics pages pick up the change within a few seconds, without a reload.
 */
import { parseArgs } from 'node:util';
import { prisma } from '../src/db/prisma.js';
import { DEMO_HISTORY_DAYS, DEMO_PEOPLE, demoRecordCounts, generateAndIncludeDemo, resetDemoDataset } from '../src/modules/analytics/demoService.js';
import { liveReport } from '../src/modules/analytics/liveReports.js';
import { reportContext, sourceBreakdown } from '../src/modules/analytics/reportService.js';

const { positionals, values } = parseArgs({ allowPositionals: true, options: { tenant: { type: 'string' }, apply: { type: 'boolean', default: false } } });
const [command] = positionals;
const fail = (message) => { console.error(message); process.exitCode = 1; };
const n = (value) => (value == null ? '—' : Number(value).toLocaleString('en-US'));

/** Real, demo and shown figures for the last 30 days, straight from the database (the same code as the reports). */
async function printBreakdown(tenantId) {
  const [live, ctx] = await Promise.all([liveReport(tenantId), reportContext(tenantId, { range: '30d' })]);
  const sources = await sourceBreakdown(ctx);
  const row = (label, real, demo, shown) => console.log(`  ${label.padEnd(20)}${n(real).padStart(10)}${n(demo).padStart(10)}${n(shown).padStart(12)}`);
  console.log(`\n  Last 30 days (${ctx.from} to ${ctx.to})${' '.repeat(2)}REAL      DEMO   DISPLAYED`);
  row('Concurrent users', live.real, live.demo ?? 0, live.total);
  row('Visits', sources.real.visits, sources.demo.visits, sources.displayed.visits);
  row('Active people', sources.real.people, sources.demo.people, sources.displayed.people);
  row('Successful logins', sources.real.logins, sources.demo.logins, sources.displayed.logins);
  console.log(`\n  Demo data included in reports: ${sources.demoIncluded ? 'ON' : 'OFF'}`);
}
const printRecords = (records) => console.log(`  Demo rows: ${Object.entries(records).map(([table, count]) => `${table} ${n(count)}`).join(', ')}`);

try {
  if (!['status', 'generate', 'reset'].includes(command) || !values.tenant) {
    fail('Usage: node scripts/analytics-demo.mjs <status|generate|reset> --tenant <slug> [--apply]');
  } else {
    const tenant = await prisma.tenant.findUnique({ where: { slug: values.tenant }, select: { id: true, name: true, analyticsDemoEnabled: true } });
    if (!tenant) fail(`No institution with slug "${values.tenant}".`);
    else {
      const dataset = await prisma.analyticsDemoDataset.findUnique({ where: { tenantId: tenant.id } });
      const describe = (row) => (row ? `${row.people} people (${row.online} online), ${row.coversFrom.toISOString().slice(0, 10)} to ${row.coversTo.toISOString().slice(0, 10)}, generated ${row.generatedAt.toISOString()}` : 'none');
      console.log(`Institution: ${values.tenant} (${tenant.name})`);
      if (command === 'status') {
        console.log(`  Demo dataset: ${describe(dataset)}`);
        printRecords(await demoRecordCounts(tenant.id));
        await printBreakdown(tenant.id);
      } else if (!values.apply) {
        console.log(command === 'generate'
          ? `  Dry run: would ${dataset ? 'rebuild' : 'create'} the demo dataset (${DEMO_PEOPLE} synthetic people, ${DEMO_HISTORY_DAYS} days) and include it in reports. Current: ${describe(dataset)}. Add --apply.`
          : `  Dry run: would switch demo data off and delete the demo dataset (${describe(dataset)}). Real analytics and portal accounts are not touched. Add --apply.`);
      } else if (command === 'generate') {
        console.log('  Generating (about 20 seconds)…');
        const summary = await generateAndIncludeDemo({ tenantId: tenant.id, via: 'command line', log: { info() {} } });
        console.log(`  Demo generation: successful in ${Math.round(summary.ms / 1000)} s. ${summary.people} people (${summary.online} online), ${summary.coversFrom} to ${summary.coversTo}.`);
        printRecords(summary.records);
        await printBreakdown(tenant.id);
      } else {
        const { removed, remaining, wasIncluded } = await resetDemoDataset(tenant.id, { via: 'command line' });
        console.log(`  Demo data switched off${wasIncluded ? '' : ' (it was already off)'}; deleted ${n(removed.people)} synthetic people and every demo row.`);
        printRecords(remaining);
        const left = Object.values(remaining).reduce((sum, count) => sum + count, 0);
        console.log(`  Demo records remaining: ${left}`);
        await printBreakdown(tenant.id);
      }
    }
  }
} finally {
  await prisma.$disconnect();
}

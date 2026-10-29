/**
 * Development seed for the Moodle site named by MOODLE_BASE_URL.
 *
 *   npm run moodle:seed               # read-only preflight + exact plan (dry run)
 *   npm run moodle:seed -- --apply    # apply the plan, then verify it
 *   npm run moodle:seed -- --verify   # read-only verification of the seeded state
 *   add --scope=math for the Mathematics additions (category MAT_001); default --scope=core
 *
 * Applying requires MOODLE_SEED_ENABLED=true and MOODLE_WRITES_ENABLED=true and a clean
 * preflight (functions, verified role ids, category, quota, 20-account cap, identities).
 * Never runs at startup or during deployment. Never deletes anything. Never prints
 * passwords or tokens.
 */
import 'dotenv/config';

const { preflight, applySeed, verifySeed, seedGuards } = await import('../src/modules/lms/moodleSeed.js');
const { disconnect } = await import('../src/db/prisma.js');

const mode = process.argv.includes('--apply') ? 'apply' : process.argv.includes('--verify') ? 'verify' : 'dry-run';
// --scope=core (the original demo) or --scope=math (Mathematics additions under MAT_001).
const scope = (process.argv.find((a) => a.startsWith('--scope=')) ?? '--scope=core').split('=')[1];
const tenantSlug = process.env.TENANT_FALLBACK_SLUG || 'demo-university';
const out = (line = '') => console.log(line);

function printPlan(check) {
  const { facts, plan } = check;
  out(`Site: ${facts.site.name} (Moodle ${facts.site.release})`);
  out(`Roles reported by Moodle: ${Object.entries(facts.roles ?? {}).map(([s, id]) => `${s}=${id}`).join(', ') || 'none observed'}`);
  out(`Scope: ${facts.scope ?? scope} · Category: ${facts.categoryId ?? 'not resolved'}`);
  if (facts.users) {
    const u = facts.users;
    out(`Users: ${u.total} existing (${u.suspended} suspended), ${u.existingDemo} demo; +${u.newAccounts} new → ${u.afterSeed} of quota ${u.quota ?? '?'}; demo cap ${u.existingDemo + u.newAccounts}/${u.demoCap}`);
  }
  if (!plan) return;
  out('\nCourses');
  for (const c of plan.courses) out(`  ${c.action.padEnd(16)} ${c.key.padEnd(16)} ${c.fullName}${c.moodleCourseId ? ` (id ${c.moodleCourseId})` : ''}`);
  out('\nAccounts');
  for (const p of plan.people) out(`  ${String(p.action).padEnd(16)} ${p.localAction === 'CREATE_LOCAL_IDENTITY' ? '+local ' : '       '}${p.kind.padEnd(10)} ${p.account.username.padEnd(22)} ${p.account.email.padEnd(36)} ↔ EduNexusAI ${p.number} (${p.name})`);
  out('\nEnrolments');
  for (const e of plan.enrolments) out(`  ${e.action.padEnd(16)} ${e.username.padEnd(22)} → ${e.course.padEnd(16)} as ${e.role}`);
}

try {
  if (mode === 'verify') {
    const result = await verifySeed({ tenantSlug, scope });
    for (const c of result.checks) out(`  ${c.ok ? '✓' : '✗'} ${c.check}`);
    out(result.ok ? '\nVerification passed.' : `\nVerification found problems:\n  - ${result.problems.join('\n  - ')}`);
    if (!result.ok) process.exitCode = 1;
  } else {
    const check = await preflight({ tenantSlug, scope });
    printPlan(check);
    for (const w of check.warnings) out(`\n⚠ ${w}`);
    if (check.blockers.length) {
      out('\nBLOCKED. Nothing will be written until these are resolved:');
      for (const b of check.blockers) out(`  - ${b}`);
      process.exitCode = 1;
    } else if (mode === 'dry-run') {
      const guards = seedGuards();
      out(`\nPreflight passed. Dry run only.${guards.ok ? ' Re-run with --apply to make these changes.' : ` To apply: ${guards.problems.join(' ')}`}`);
    } else {
      out('\nApplying…');
      const applied = await applySeed({ tenantSlug, scope, log: (line) => out(`  ${line}`) });
      if (!applied.applied) {
        out(`Refused:\n  - ${applied.blockers.join('\n  - ')}`);
        process.exitCode = 1;
      } else {
        out('\nVerifying…');
        const result = await verifySeed({ tenantSlug, scope, before: applied.before });
        for (const c of result.checks) out(`  ${c.ok ? '✓' : '✗'} ${c.check}`);
        out(result.ok ? '\nSeed applied and verified.' : `\nApplied, but verification found problems:\n  - ${result.problems.join('\n  - ')}`);
        if (!result.ok) process.exitCode = 1;
      }
    }
  }
} catch (error) {
  // AppError messages are already redacted; never print request bodies.
  console.error(`Moodle seed failed: ${error.message}`);
  if (error.details?.operationId) console.error(`  operation ${error.details.operationId} (${error.details.operationStatus}). Re-run the seed to reconcile; it checks Moodle before creating anything.`);
  process.exitCode = 1;
} finally {
  await disconnect();
}

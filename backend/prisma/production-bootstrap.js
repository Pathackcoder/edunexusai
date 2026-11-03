/**
 * Production bootstrap: copies a reviewed subset of one EdunexusAI database into another (instead of the demo seed).
 *
 *   export (source):  node prisma/production-bootstrap.js export --tenant demo-university --out bootstrap.json \
 *                       --issuer https://auth.example.edu/realms/r --campuscore-url https://sis.example.edu
 *   import (target):  node prisma/production-bootstrap.js import --file bootstrap.json            (dry run)
 *                     node prisma/production-bootstrap.js import --file bootstrap.json --apply    (writes)
 *
 * Copied: the tenant and its appearance; roles, widgets, tiers and entitlements; the sign-in provider (moved to the
 * production issuer, https only) and its role mappings; the CampusCore and Moodle integration rows; help, support,
 * campus-safety, communication-category and campus-map reference content; the tenant's people with their roles,
 * profiles and university sign-in links (moved to the production issuer).
 * Never copied: passwords (people sign in with the university sign-in), refresh tokens, sign-in sessions, academic
 * records and caches (CampusCore owns them: courses, enrolments, grades, transcripts, GPA and credits on profiles),
 * mock/demo integrations and their sync logs, SIS identity mappings, notifications, announcements, forms,
 * resources, audit logs and everything else not listed in TABLES.
 *
 * Rows keep their ids, so references between them stay intact. Import is one transaction: inserts never overwrite
 * (an existing row is reported as already present), a dry run rolls back after inserting, so it proves every
 * foreign key, and an apply commits only if everything inserted cleanly.
 */
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { prisma } from '../src/db/prisma.js';

const FORMAT = 'edunexusai-bootstrap/1';
const KEEP_INTEGRATIONS = ['campuscore-sis', 'moodle-lms'];
// Academic values on student profiles come from CampusCore; locally they are demo data.
const STUDENT_ACADEMIC = ['degree', 'department', 'academicStanding', 'admitTerm', 'currentTerm', 'creditsCompleted', 'totalCreditsRequired', 'cumulativeGpa', 'majorGpa', 'semesterGpa', 'honors', 'addressLine1', 'city', 'state', 'postalCode'];

// Import order (parents first). `where` selects the tenant's rows; `T` is the tenant id, `U` the exported user ids.
const TABLES = [
  { table: 'tenants', where: '"id" = $T' },
  { table: 'roles', where: 'true' },
  { table: 'widget_definitions', where: 'true' },
  { table: 'student_tiers', where: '"tenantId" = $T' },
  { table: 'widget_entitlements', where: '"tenantId" = $T' },
  { table: 'role_widget_entitlements', where: '"tenantId" = $T' },
  { table: 'identity_providers', where: '"tenantId" = $T' },
  { table: 'identity_role_mappings', where: '"providerId" IN (SELECT "id" FROM identity_providers WHERE "tenantId" = $T)' },
  { table: 'integrations', where: `"tenantId" = $T AND "key" IN (${KEEP_INTEGRATIONS.map((k) => `'${k}'`).join(', ')})` },
  { table: 'faq_categories', where: '"tenantId" = $T' },
  { table: 'faq_items', where: '"tenantId" = $T' },
  { table: 'support_contacts', where: '"tenantId" = $T' },
  { table: 'security_contacts', where: '"tenantId" = $T' },
  { table: 'emergency_procedures', where: '"tenantId" = $T' },
  { table: 'emergency_procedure_steps', where: '"procedureId" IN (SELECT "id" FROM emergency_procedures WHERE "tenantId" = $T)' },
  { table: 'campus_safety_settings', where: '"tenantId" = $T' },
  { table: 'communication_categories', where: '"tenantId" = $T' },
  { table: 'campus_buildings', where: '"tenantId" = $T' },
  { table: 'classrooms', where: '"buildingId" IN (SELECT "id" FROM campus_buildings WHERE "tenantId" = $T)' },
  { table: 'users', where: '"tenantId" = $T' },
  { table: 'user_roles', where: '"userId" IN (SELECT "id" FROM users WHERE "tenantId" = $T)' },
  { table: 'federated_identities', where: '"tenantId" = $T' },
  { table: 'role_assignment_sources', where: '"tenantId" = $T' },
  { table: 'student_profiles', where: '"tenantId" = $T' },
  { table: 'faculty_profiles', where: '"tenantId" = $T' },
  { table: 'staff_profiles', where: '"tenantId" = $T' },
  { table: 'directory_profiles', where: '"tenantId" = $T' },
  { table: 'dashboard_layouts', where: '"tenantId" = $T' },
];

const { positionals: [mode], values: a } = parseArgs({
  allowPositionals: true,
  options: { tenant: { type: 'string' }, out: { type: 'string' }, file: { type: 'string' }, issuer: { type: 'string' }, 'campuscore-url': { type: 'string' }, apply: { type: 'boolean', default: false } },
});
const fail = (message) => { console.error(message); process.exit(1); };
const https = (value, name) => {
  let url;
  try { url = new URL(value); } catch { fail(`--${name} must be a URL.`); }
  if (url.protocol !== 'https:') fail(`--${name} must use https.`);
  return value.replace(/\/+$/, '');
};

/** Per-table changes on the way out. Return null to drop a row. */
function transform(table, row, { issuer, campuscoreUrl }) {
  switch (table) {
    case 'identity_providers': return { ...row, issuer, allowInsecureHttp: false };
    case 'federated_identities': return { ...row, issuer, lastLoginAt: null, lastEvaluation: null };
    case 'users': return { ...row, passwordHash: null, passwordChangeRequired: false, lastLoginAt: null };
    // Left out entirely, so the target applies its column defaults: the same profile a first sign-in creates.
    case 'student_profiles': return Object.fromEntries(Object.entries(row).filter(([k]) => !STUDENT_ACADEMIC.includes(k)));
    case 'integrations': return row.key === 'campuscore-sis' ? { ...row, baseUrl: campuscoreUrl } : row;
    default: return row;
  }
}

async function exportBootstrap() {
  if (!a.tenant || !a.out || !a.issuer || !a['campuscore-url']) fail('export needs --tenant, --out, --issuer and --campuscore-url.');
  const opts = { issuer: https(a.issuer, 'issuer'), campuscoreUrl: https(a['campuscore-url'], 'campuscore-url') };
  const [tenant] = await prisma.$queryRaw`SELECT "id", "slug" FROM tenants WHERE "slug" = ${a.tenant}`;
  if (!tenant) fail(`No tenant "${a.tenant}".`);
  const tables = {};
  for (const { table, where } of TABLES) {
    const sql = `SELECT row_to_json(x) AS r FROM "${table}" x WHERE ${where.replaceAll('$T', '$1')}`;
    const rows = (await prisma.$queryRawUnsafe(sql, ...(where.includes('$T') ? [tenant.id] : []))).map((r) => r.r);
    tables[table] = rows.map((row) => transform(table, row, opts)).filter(Boolean);
  }
  const bootstrap = { format: FORMAT, source: { tenant: tenant.slug, exportedAt: new Date().toISOString(), issuer: opts.issuer }, tables };
  const text = JSON.stringify(bootstrap, null, 1);
  if (/"passwordHash":"/.test(text)) fail('Refusing to write: a password hash is still present.');
  fs.writeFileSync(a.out, `${text}\n`);
  console.log(`Exported ${tenant.slug} → ${a.out}`);
  for (const [table, rows] of Object.entries(tables)) console.log(`  ${table.padEnd(26)} ${rows.length}`);
}

class DryRun extends Error {}

async function importBootstrap() {
  if (!a.file) fail('import needs --file.');
  const bootstrap = JSON.parse(fs.readFileSync(a.file, 'utf8'));
  if (bootstrap.format !== FORMAT) fail(`Not a ${FORMAT} file.`);
  const known = TABLES.map((t) => t.table);
  const unknown = Object.keys(bootstrap.tables).filter((t) => !known.includes(t));
  if (unknown.length) fail(`Unexpected tables in the file: ${unknown.join(', ')}`);
  const report = [];
  try {
    await prisma.$transaction(async (tx) => {
      for (const table of known) {
        const rows = bootstrap.tables[table] ?? [];
        let inserted = 0;
        for (const row of rows) {
          // Only the columns present in the row: the others get the target's column defaults.
          const cols = Object.keys(row).map((c) => `"${c.replace(/"/g, '')}"`).join(', ');
          const n = await tx.$executeRawUnsafe(`INSERT INTO "${table}" (${cols}) SELECT ${cols} FROM json_populate_record(NULL::"${table}", $1::json) ON CONFLICT DO NOTHING`, JSON.stringify(row));
          inserted += n;
        }
        report.push([table, rows.length, inserted]);
      }
      if (!a.apply) throw new DryRun();
    }, { timeout: 120_000 });
  } catch (error) {
    if (!(error instanceof DryRun)) {
      console.error(`Import failed, nothing was written: ${error.meta?.message ?? error.message}`);
      process.exit(2);
    }
  }
  console.log(`${a.apply ? 'APPLIED' : 'DRY RUN (rolled back; add --apply)'} · ${bootstrap.source.tenant} export ${bootstrap.source.exportedAt}, issuer ${bootstrap.source.issuer}`);
  for (const [table, total, inserted] of report) console.log(`  ${table.padEnd(26)} ${String(inserted).padStart(3)} new · ${total - inserted} already present`);
}

try {
  if (mode === 'export') await exportBootstrap();
  else if (mode === 'import') await importBootstrap();
  else fail('Usage: production-bootstrap.js export|import (see the header of this file).');
} finally {
  await prisma.$disconnect();
}

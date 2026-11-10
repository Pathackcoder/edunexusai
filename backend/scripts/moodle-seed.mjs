/**
 * Development seed for the Moodle site named by MOODLE_BASE_URL.
 *
 *   npm run moodle:seed               # read-only preflight + exact plan (dry run)
 *   npm run moodle:seed -- --apply    # apply the plan, then verify it
 *   npm run moodle:seed -- --verify   # read-only verification of the seeded state
 *   add --scope=math for the Mathematics additions (category MAT_001); default --scope=core
 *   --scope=restore rebuilds the pilot environment of an expired site on a new one (moodleRestore.js)
 *   A second environment sharing that site (production) does not seed; it moves and links:
 *     --scope=restore --move-site [--apply --expect-links=N --expect-mappings=M]   archive + remove old-site links
 *     --scope=restore --link-only [--apply]          link existing accounts/courses; refuses anything needing a write
 *     --scope=restore --provision-student=<number>   one student's account, no enrolments (MOODLE_WRITES_ENABLED=true)
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
  for (const c of plan.courses) out(`  ${c.action.padEnd(16)} ${c.key.padEnd(16)} ${c.fullName}${c.idNumber && c.idNumber !== c.key ? ` [${c.idNumber}]` : ''}${c.category ? ` · ${c.category} (category ${c.categoryId ?? '?'}) · ${c.startDate} – ${c.endDate}` : ''}${c.localCourseCode ? ` · ↔ EduNexusAI ${c.localCourseCode}` : ''}${c.moodleCourseId ? ` (id ${c.moodleCourseId})` : ''}`);
  out('\nAccounts');
  for (const p of plan.people) out(`  ${String(p.action).padEnd(16)} ${p.localAction === 'CREATE_LOCAL_IDENTITY' ? '+local ' : '       '}${p.kind.padEnd(10)} ${p.account.username.padEnd(22)} ${p.account.email.padEnd(36)} ↔ EduNexusAI ${p.number} (${p.name})`);
  out('\nEnrolments');
  for (const e of plan.enrolments) out(`  ${e.action.padEnd(16)} ${e.username.padEnd(22)} → ${e.course.padEnd(16)} as ${e.role}`);
  if (plan.sections) {
    out('\nCampusCore section mappings');
    for (const s of plan.sections) out(`  ${s.action.padEnd(16)} ${s.label.padEnd(22)} → ${s.course}`);
  }
}

const flag = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

/** The restore's second-environment steps (see the header). Returns true when one of them ran. */
async function secondEnvironment() {
  if (scope !== 'restore') return false;
  const restore = await import('../src/modules/lms/moodleRestore.js');
  if (process.argv.includes('--move-site')) {
    const expect = { links: Number(flag('expect-links')), mappings: Number(flag('expect-mappings')) };
    const r = await restore.moveToSite({ tenantSlug, apply: mode === 'apply', expect });
    if (r.alreadyOnSite) return out(`Already on ${r.toSite}; nothing to move.`) || true;
    out(`Integration: ${r.fromSite} → ${r.toSite}. Operation history kept: ${r.operationsKept}.`);
    out(`Old-site links (${r.links.length}):`);
    for (const l of r.links) out(`  ${l.entityType.padEnd(12)} Moodle ${String(l.externalId).padEnd(5)} ${l.linkMethod ?? ''} → ${l.internalId}`);
    out(`Old-site section mappings (${r.mappings.length}):`);
    for (const m of r.mappings) out(`  Moodle course ${m.moodleCourseId} ← section ${m.sisSectionId}`);
    // The archive goes to stdout between markers, for the operator to keep; it holds ids only, no secrets.
    out('==ARCHIVE-BEGIN=='); out(JSON.stringify({ archivedAt: new Date().toISOString(), fromSite: r.fromSite, links: r.links, mappings: r.mappings })); out('==ARCHIVE-END==');
    out(r.moved ? '\nMoved: old-site links removed and the integration now names the new site.' : `\nDry run. Re-run with --apply --expect-links=${r.links.length} --expect-mappings=${r.mappings.length}.`);
    return true;
  }
  if (process.argv.includes('--link-only')) {
    const check = await preflight({ tenantSlug, scope });
    printPlan(check);
    for (const w of check.warnings) out(`\n⚠ ${w}`);
    if (check.blockers.length) { out(`\nBLOCKED:\n  - ${check.blockers.join('\n  - ')}`); process.exitCode = 1; return true; }
    if (mode !== 'apply') return out('\nDry run. Re-run with --link-only --apply.') || true;
    const applied = await restore.applyRestore({ tenantSlug, linkOnly: true, log: (line) => out(`  ${line}`) });
    if (!applied.applied) { out(`Refused:\n  - ${applied.blockers.join('\n  - ')}`); process.exitCode = 1; return true; }
    const result = await restore.verifyRestore({ tenantSlug });
    for (const c of result.checks) out(`  ${c.ok ? '✓' : '✗'} ${c.check}`);
    out(result.ok ? '\nLinked and verified.' : `\nLinked, but verification found problems:\n  - ${result.problems.join('\n  - ')}`);
    if (!result.ok) process.exitCode = 1;
    return true;
  }
  const number = flag('provision-student');
  if (number) {
    const r = await restore.provisionOneStudent({ tenantSlug, studentNumber: number });
    out(`${number}: ${r.action} → Moodle user ${r.moodleUserId}${r.username ? ` (${r.username})` : ''}`);
    return true;
  }
  return false;
}

try {
  if (await secondEnvironment()) {
    // done
  } else if (mode === 'verify') {
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

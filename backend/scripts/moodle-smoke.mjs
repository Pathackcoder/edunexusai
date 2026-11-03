/**
 * Read-only diagnostic against the real Moodle site (MOODLE_BASE_URL / MOODLE_TOKEN).
 *
 *   npm run moodle:smoke
 *   npm run moodle:smoke -- --course 9      # also read one course's contents
 *   npm run moodle:smoke -- --user 3        # also list one Moodle user's courses
 *
 * Calls only read functions. Prints site facts, the enabled-function checklist and
 * counts; never the token, never personal data beyond ids and course names.
 */
import 'dotenv/config';
import { moodleConfig } from '../src/config/env.js';
import { createMoodleClient } from '../src/integrations/moodle/moodleClient.js';
import { capabilityChecklist } from '../src/integrations/moodle/moodleFunctions.js';
import { mapContents, mapCourse, isSiteCourse } from '../src/integrations/mappers/moodleMapper.js';

const arg = (name) => {
  const index = process.argv.indexOf(name);
  const value = index > -1 ? Number(process.argv[index + 1]) : null;
  return Number.isInteger(value) && value > 0 ? value : null;
};

const config = moodleConfig();
if (!config.valid) {
  console.error('Moodle is not configured:', config.problems.join(' '));
  process.exit(1);
}
const client = createMoodleClient({ baseUrl: config.baseUrl, token: process.env.MOODLE_TOKEN, timeoutMs: config.timeoutMs, maxRetries: config.maxRetries });
const read = async (fn, params) => (await client.call(fn, params, { idempotent: true })).payload;

try {
  const site = await read('core_webservice_get_site_info');
  const enabled = new Set((site.functions ?? []).map((f) => f.name));
  console.log(`Site:     ${site.sitename} — Moodle ${site.release}`);
  console.log(`Token:    user "${site.username}" (id ${site.userid})${site.userissiteadmin ? '  ⚠ site administrator: use a dedicated integration user' : ''}`);
  console.log(`Writes:   ${config.writesEnabled ? 'enabled' : 'disabled'} (MOODLE_WRITES_ENABLED)`);
  console.log('\nFunctions:');
  for (const row of capabilityChecklist(enabled)) {
    console.log(`  ${row.enabled ? '✓' : '·'} ${row.name.padEnd(48)} ${row.group}`);
  }
  if (enabled.has('core_course_get_courses')) {
    const courses = (await read('core_course_get_courses')).filter((c) => !isSiteCourse(c)).map((c) => mapCourse(c, config.baseUrl));
    console.log(`\nCourses (${courses.length}):`);
    for (const c of courses) console.log(`  ${String(c.moodleCourseId).padStart(4)}  ${c.shortName}  [${c.idNumber ?? 'no ID number'}]  ${c.visible ? 'visible' : 'hidden'}`);
  }
  const courseId = arg('--course');
  if (courseId && enabled.has('core_course_get_contents')) {
    const sections = mapContents(await read('core_course_get_contents', { courseid: courseId }), config.baseUrl);
    console.log(`\nCourse ${courseId}: ${sections.length} student-visible section(s), ${sections.reduce((n, s) => n + s.activities.length, 0)} activity(ies)`);
  }
  const userId = arg('--user');
  if (userId && enabled.has('core_enrol_get_users_courses')) {
    const courses = await read('core_enrol_get_users_courses', { userid: userId });
    console.log(`\nMoodle user ${userId}: enrolled in ${courses.length} course(s): ${courses.map((c) => c.shortname).join(', ') || '—'}`);
  }
  console.log('\nRead-only smoke test passed.');
} catch (error) {
  console.error(`Smoke test failed: ${error.message} [${error.details?.kind ?? error.code}]`);
  process.exitCode = 1;
}

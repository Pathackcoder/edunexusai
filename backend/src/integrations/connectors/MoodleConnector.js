import { BaseConnector } from './BaseConnector.js';
import { moodleConfig } from '../../config/env.js';
import { createMoodleClient, moodleError, MoodleErrorKind } from '../moodle/moodleClient.js';
import { capabilityChecklist, MOODLE_FUNCTIONS } from '../moodle/moodleFunctions.js';
import { isSiteCourse } from '../mappers/moodleMapper.js';

/**
 * Moodle LMS connector (REST web services).
 *
 * The only code that speaks Moodle's dialect. Every call is checked against the
 * functions the token is actually allowed to use (from core_webservice_get_site_info)
 * before it is sent, so a missing function produces a precise "enable X" message instead
 * of a generic access exception. Write calls are refused unless MOODLE_WRITES_ENABLED is
 * on, and are never retried automatically.
 *
 * This connector covers LMS concerns only (Moodle accounts, course shells, enrolments,
 * content, assignments, LMS grades). Official student records stay with the SIS side of
 * the registry; nothing here writes to EduNexusAI academic tables.
 */

const CAPABILITY_TTL_MS = 5 * 60 * 1000;
const capabilityCache = new Map(); // integrationId -> { at, info }

/** Tests and the admin "Test connection" action clear this to re-read the function list. */
export function clearMoodleCapabilityCache() {
  capabilityCache.clear();
}

const expectArray = (payload, wsfunction) => {
  if (!Array.isArray(payload)) {
    throw moodleError(MoodleErrorKind.MALFORMED_RESPONSE, `Moodle returned an unexpected response for ${wsfunction}.`, { wsfunction });
  }
  return payload;
};

const expectObject = (payload, wsfunction) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw moodleError(MoodleErrorKind.MALFORMED_RESPONSE, `Moodle returned an unexpected response for ${wsfunction}.`, { wsfunction });
  }
  return payload;
};

/** Moodle "warnings" arrays on otherwise successful writes mean the change did not apply. */
const failOnWarnings = (payload, wsfunction) => {
  const warnings = payload?.warnings ?? [];
  if (warnings.length) {
    const first = warnings[0];
    throw moodleError(MoodleErrorKind.MOODLE_EXCEPTION, `Moodle did not apply ${wsfunction}: ${String(first.message ?? first.warningcode).slice(0, 200)}`, {
      wsfunction,
      moodleErrorCode: first.warningcode ?? null,
    });
  }
};

export class MoodleConnector extends BaseConnector {
  constructor(options) {
    super(options);
    this.config = moodleConfig();
    this.timeoutMs = this.config.timeoutMs;
    this.client = createMoodleClient({
      baseUrl: this.baseUrl,
      token: this.credential,
      timeoutMs: this.config.timeoutMs,
      maxRetries: this.config.maxRetries,
    });
  }

  assertConfigured() {
    if (!this.config.baseUrl) {
      throw moodleError(MoodleErrorKind.NOT_CONFIGURED, `Moodle is not configured: ${this.config.problems.join(' ')}`);
    }
    if (!this.credential) {
      throw moodleError(MoodleErrorKind.NOT_CONFIGURED, `No Moodle token: set ${this.integration.credentialRef ?? 'MOODLE_TOKEN'} in the backend environment.`);
    }
    // The token is only ever sent to the site named in the server environment, even if
    // the integration row's base URL is edited through the admin API.
    if (this.baseUrl !== this.config.baseUrl) {
      throw moodleError(
        MoodleErrorKind.NOT_CONFIGURED,
        'The integration base URL does not match MOODLE_BASE_URL. Update the integration so both name the same Moodle site.',
      );
    }
  }

  /** Site info with the token's function list, cached briefly per integration. */
  async siteInfo({ refresh = false } = {}) {
    this.assertConfigured();
    const cached = capabilityCache.get(this.integration.id);
    if (!refresh && cached && Date.now() - cached.at < CAPABILITY_TTL_MS && cached.baseUrl === this.baseUrl) {
      return cached.info;
    }
    const { payload, durationMs } = await this.client.call('core_webservice_get_site_info', {}, { idempotent: true });
    const site = expectObject(payload, 'core_webservice_get_site_info');
    const info = {
      siteName: site.sitename ?? null,
      release: site.release ?? null,
      version: site.version ?? null,
      siteUrl: site.siteurl ?? null,
      tokenUserId: site.userid ?? null,
      tokenUsername: site.username ?? null,
      tokenUserIsSiteAdmin: Boolean(site.userissiteadmin),
      functions: new Set((site.functions ?? []).map((fn) => fn.name)),
      durationMs,
    };
    capabilityCache.set(this.integration.id, { at: Date.now(), info, baseUrl: this.baseUrl });
    return info;
  }

  async has(wsfunction) {
    return (await this.siteInfo()).functions.has(wsfunction);
  }

  async requireFunction(wsfunction) {
    if (!(await this.has(wsfunction))) {
      throw moodleError(
        MoodleErrorKind.FUNCTION_NOT_ENABLED,
        `The Moodle function ${wsfunction} is not enabled for this web service. Add it under Site administration → Server → Web services → External services → (your service) → Functions.`,
        { wsfunction, purpose: MOODLE_FUNCTIONS[wsfunction]?.purpose ?? null },
      );
    }
  }

  async call(wsfunction, params = {}, { write = false } = {}) {
    this.assertConfigured();
    if (write && !this.config.writesEnabled) {
      throw moodleError(MoodleErrorKind.NOT_CONFIGURED, 'Changes to Moodle are switched off on this server (MOODLE_WRITES_ENABLED is not true).', {
        wsfunction,
        reason: 'WRITES_DISABLED',
      });
    }
    await this.requireFunction(wsfunction);
    const { payload } = await this.client.call(wsfunction, params, { idempotent: !write });
    return payload;
  }

  /* ---------- connection ---------- */

  async testConnection() {
    const startedAt = Date.now();
    const info = await this.siteInfo({ refresh: true });
    const courses = info.functions.has('core_course_get_courses') ? await this.listCourses() : [];
    const checklist = capabilityChecklist(info.functions);
    const warnings = [];
    if (info.tokenUserIsSiteAdmin) {
      warnings.push('The token belongs to a site administrator. Use a dedicated integration user with only the capabilities listed in the checklist.');
    }
    if (info.siteUrl && new URL(info.siteUrl).origin !== new URL(this.baseUrl).origin) {
      warnings.push('Moodle reports a different site URL than MOODLE_BASE_URL.');
    }
    if (!this.config.writesEnabled) warnings.push('Changes to Moodle are switched off (MOODLE_WRITES_ENABLED=false).');
    return {
      healthy: true,
      durationMs: Date.now() - startedAt,
      recordCount: courses.length,
      details: {
        siteName: info.siteName,
        release: info.release,
        tokenUsername: info.tokenUsername,
        tokenUserIsSiteAdmin: info.tokenUserIsSiteAdmin,
        enabledFunctions: [...info.functions].sort(),
        missingForMvp: checklist.filter((f) => !f.enabled && ['LINKING', 'ADMIN_WRITE', 'LEARNER_DETAIL', 'FACULTY_GRADING'].includes(f.group)).map((f) => f.name),
        courseCount: courses.length,
        writesEnabled: this.config.writesEnabled,
        warnings,
      },
    };
  }

  /* ---------- reads ---------- */

  async listCourses({ ids } = {}) {
    const params = ids?.length ? { options: { ids } } : {};
    const payload = await this.call('core_course_get_courses', params);
    return expectArray(payload, 'core_course_get_courses').filter((course) => !isSiteCourse(course));
  }

  async fetchCourses() {
    const startedAt = Date.now();
    const records = await this.listCourses();
    return { records, durationMs: Date.now() - startedAt };
  }

  async getUserCourses(moodleUserId) {
    const payload = await this.call('core_enrol_get_users_courses', { userid: moodleUserId });
    return expectArray(payload, 'core_enrol_get_users_courses').filter((course) => !isSiteCourse(course));
  }

  async getCourseContents(moodleCourseId) {
    return expectArray(await this.call('core_course_get_contents', { courseid: moodleCourseId }), 'core_course_get_contents');
  }

  async getUsersByField(field, values) {
    const payload = await this.call('core_user_get_users_by_field', { field, values });
    return expectArray(payload, 'core_user_get_users_by_field');
  }

  async getCategories() {
    return expectArray(await this.call('core_course_get_categories', {}), 'core_course_get_categories');
  }

  async getEnrolledUsers(moodleCourseId) {
    return expectArray(await this.call('core_enrol_get_enrolled_users', { courseid: moodleCourseId }), 'core_enrol_get_enrolled_users');
  }

  /** Active participants only (Moodle option onlyactive=1). */
  async getActiveEnrolledUsers(moodleCourseId) {
    const payload = await this.call('core_enrol_get_enrolled_users', { courseid: moodleCourseId, options: [{ name: 'onlyactive', value: 1 }] });
    return expectArray(payload, 'core_enrol_get_enrolled_users');
  }

  /**
   * Connector contract: enrolments for ONE course, read from Moodle. Unlike the SIS
   * connectors, the result is LMS participation (with roles), never official
   * registration; the SIS enrolment sync refuses Moodle before it gets here.
   * An empty course is a valid, empty result.
   */
  async fetchEnrollments({ externalCourseId } = {}) {
    if (!externalCourseId) {
      throw moodleError(MoodleErrorKind.INVALID_PARAMETER, 'Moodle enrolment lookup needs a Moodle course id.');
    }
    const startedAt = Date.now();
    const [all, active] = await Promise.all([this.getEnrolledUsers(externalCourseId), this.getActiveEnrolledUsers(externalCourseId)]);
    return { records: all, activeIds: new Set(active.map((u) => Number(u.id))), durationMs: Date.now() - startedAt };
  }

  /**
   * Assignments in the given courses. includenotenrolledcourses=1 is required: by default
   * Moodle only returns courses the token's own user is enrolled in, which would silently
   * hide every course the integration account is not a participant of.
   */
  async getAssignments(moodleCourseIds) {
    const payload = expectObject(await this.call('mod_assign_get_assignments', { courseids: moodleCourseIds, includenotenrolledcourses: 1 }), 'mod_assign_get_assignments');
    return (payload.courses ?? []).flatMap((course) => course.assignments ?? []);
  }

  /** Grader view: every submission for the assignments (all attempts' latest status). */
  async getSubmissions(assignmentIds) {
    const payload = expectObject(await this.call('mod_assign_get_submissions', { assignmentids: assignmentIds }), 'mod_assign_get_submissions');
    return payload.assignments ?? [];
  }

  /** Grader view: grades as stored in the assignment (released or not). */
  async getAssignGrades(assignmentIds) {
    const payload = expectObject(await this.call('mod_assign_get_grades', { assignmentids: assignmentIds }), 'mod_assign_get_grades');
    return payload.assignments ?? [];
  }

  /**
   * Save a grade and written feedback for one student. Moodle records the service
   * account as the grader; EduNexusAI authorises and audits the actual faculty member.
   */
  async saveGrade({ assignmentId, moodleUserId, grade, feedback }) {
    const payload = await this.call(
      'mod_assign_save_grade',
      {
        assignmentid: assignmentId,
        userid: moodleUserId,
        grade,
        attemptnumber: -1,
        addattempt: 0,
        workflowstate: '',
        applytoall: 1,
        plugindata: { assignfeedbackcomments_editor: { text: feedback ?? '', format: 1 } },
      },
      { write: true },
    );
    failOnWarnings(payload, 'mod_assign_save_grade');
  }

  async getSubmissionStatus(assignmentId, moodleUserId) {
    return expectObject(await this.call('mod_assign_get_submission_status', { assignid: assignmentId, userid: moodleUserId }), 'mod_assign_get_submission_status');
  }

  async getGradeItems(moodleCourseId, moodleUserId) {
    return expectObject(await this.call('gradereport_user_get_grade_items', { courseid: moodleCourseId, userid: moodleUserId }), 'gradereport_user_get_grade_items');
  }

  /* ---------- writes (single attempt each; callers own idempotency) ---------- */

  async createUser(user) {
    const payload = expectArray(await this.call('core_user_create_users', { users: [user] }, { write: true }), 'core_user_create_users');
    const created = payload[0];
    if (!created?.id) {
      throw moodleError(MoodleErrorKind.MALFORMED_RESPONSE, 'Moodle did not return the id of the new user.', { wsfunction: 'core_user_create_users' });
    }
    return { id: Number(created.id), username: created.username };
  }

  async updateUser(fields) {
    const payload = await this.call('core_user_update_users', { users: [fields] }, { write: true });
    failOnWarnings(payload, 'core_user_update_users');
  }

  async createCourse(course) {
    const payload = expectArray(await this.call('core_course_create_courses', { courses: [course] }, { write: true }), 'core_course_create_courses');
    const created = payload[0];
    if (!created?.id) {
      throw moodleError(MoodleErrorKind.MALFORMED_RESPONSE, 'Moodle did not return the id of the new course.', { wsfunction: 'core_course_create_courses' });
    }
    return { id: Number(created.id), shortname: created.shortname };
  }

  async updateCourse(fields) {
    const payload = await this.call('core_course_update_courses', { courses: [fields] }, { write: true });
    failOnWarnings(payload, 'core_course_update_courses');
  }

  async deleteCourse(moodleCourseId) {
    const payload = await this.call('core_course_delete_courses', { courseids: [moodleCourseId] }, { write: true });
    failOnWarnings(payload, 'core_course_delete_courses');
  }

  async enrol({ roleid, userid, courseid, suspend }) {
    await this.call('enrol_manual_enrol_users', { enrolments: [{ roleid, userid, courseid, ...(suspend === undefined ? {} : { suspend: suspend ? 1 : 0 }) }] }, { write: true });
  }

  async unenrol({ userid, courseid }) {
    await this.call('enrol_manual_unenrol_users', { enrolments: [{ userid, courseid }] }, { write: true });
  }
}

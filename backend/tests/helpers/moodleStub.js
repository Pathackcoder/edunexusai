import http from 'node:http';

/**
 * In-process stand-in for a Moodle site's REST endpoint, used so the automated suite never
 * calls a real Moodle. It speaks the same wire format (form-encoded POST to
 * /webservice/rest/server.php, JSON replies, exceptions inside HTTP 200) and keeps users,
 * courses and enrolments in memory. Failures are injected one call at a time.
 */

const ALL_FUNCTIONS = [
  'core_webservice_get_site_info',
  'core_course_get_courses',
  'core_enrol_get_users_courses',
  'core_course_get_contents',
  'core_course_get_course_module_by_instance',
  'core_user_get_users_by_field',
  'core_user_create_users',
  'core_user_update_users',
  'core_course_get_categories',
  'core_course_create_courses',
  'core_course_update_courses',
  'core_course_delete_courses',
  'enrol_manual_enrol_users',
  'enrol_manual_unenrol_users',
  'core_enrol_get_enrolled_users',
  'mod_assign_get_assignments',
  'mod_assign_get_submission_status',
  'gradereport_user_get_grade_items',
  'mod_assign_get_submissions',
  'mod_assign_get_grades',
  'mod_assign_save_grade',
];

/** Rebuild PHP-style keys (users[0][email]) into nested objects/arrays. */
export function parseForm(text) {
  const out = {};
  for (const [key, value] of new URLSearchParams(text)) {
    const parts = key.replace(/\]/g, '').split('[');
    let node = out;
    parts.forEach((part, index) => {
      if (index === parts.length - 1) node[part] = value;
      else node = node[part] ??= /^\d+$/.test(parts[index + 1]) ? [] : {};
    });
  }
  return out;
}

/** Default Moodle role ids, as on the real site (verified there through enrolments). */
const ROLE_SHORTNAMES = { 3: 'editingteacher', 5: 'student' };

const exception = (errorcode, message, type = 'moodle_exception') => ({ exception: type, errorcode, message });

export async function startMoodleStub({ token }) {
  const state = {
    functions: new Set(ALL_FUNCTIONS),
    users: new Map(),
    courses: new Map(),
    categories: [{ id: 1, name: 'Miscellaneous', idnumber: '', parent: 0, coursecount: 0, visible: 1 }, { id: 4, name: 'Mathematics', idnumber: 'MAT_001', parent: 0, coursecount: 0, visible: 1 }],
    enrolments: [],
    contents: {},
    assignments: {},
    grades: {},
    noManualInstance: new Set(),
    // assignmentId -> { userid -> { status, timemodified } } and { userid -> { grade, feedback } }
    submissions: {},
    assignGrades: {},
    inject: {},
    calls: [],
    receivedPasswords: 0,
    credentials: new Map(), // moodle user id -> { password, emailed, forceChange } (test-only)
    nextUserId: 100,
    nextCourseId: 200,
  };

  const userOut = (u) => ({ ...u, fullname: `${u.firstname} ${u.lastname}` });
  const courseOut = (c) => ({ format: 'topics', summary: '', startdate: 0, enddate: 0, ...c });

  const handlers = {
    core_webservice_get_site_info: () => ({
      sitename: 'Stub Moodle',
      release: '5.3 (Build: 20261005)',
      version: '2026100500',
      siteurl: state.url,
      userid: 2,
      username: 'integration',
      userissiteadmin: false,
      functions: [...state.functions].map((name) => ({ name, version: '2026100500' })),
    }),
    core_course_get_courses: (p) => {
      const ids = (p.options?.ids ?? []).map(Number);
      const list = [...state.courses.values()].filter((c) => !ids.length || ids.includes(c.id)).map(courseOut);
      return ids.length ? list : [{ id: 1, shortname: 'Stub', fullname: 'Stub', format: 'site', categoryid: 0, visible: 1 }, ...list];
    },
    core_enrol_get_users_courses: (p) =>
      state.enrolments
        .filter((e) => e.userid === Number(p.userid) && !e.suspended)
        .map((e) => state.courses.get(e.courseid))
        .filter(Boolean)
        .map(courseOut),
    core_course_get_contents: (p) => state.contents[Number(p.courseid)] ?? (state.courses.has(Number(p.courseid)) ? [] : exception('invalidrecordunknown', "Can't find data record in database.", 'dml_missing_record_exception')),
    core_user_get_users_by_field: (p) => {
      const values = (p.values ?? []).map(String);
      return [...state.users.values()]
        .filter((u) => values.some((v) => (p.field === 'email' ? String(u.email).toLowerCase() === v.toLowerCase() : String(u[p.field]) === v)))
        .map(userOut);
    },
    core_user_create_users: (p) =>
      p.users.map((input) => {
        if ([...state.users.values()].some((u) => u.username === input.username)) {
          throw exception('invalidparameter', `Invalid parameter value detected (Username already exists: ${input.username})`, 'invalid_parameter_exception');
        }
        if (input.password) state.receivedPasswords += 1;
        const id = state.nextUserId++;
        state.users.set(id, { id, username: input.username, email: input.email, idnumber: input.idnumber ?? '', firstname: input.firstname, lastname: input.lastname, auth: input.auth ?? 'manual', suspended: 0 });
        // Test-only record of how the first password was set (a real Moodle hashes it).
        state.credentials.set(id, { password: input.password ?? null, emailed: Number(input.createpassword ?? 0) === 1, forceChange: (input.preferences ?? []).some((p) => p.type === 'auth_forcepasswordchange' && String(p.value) === '1') || Number(input.createpassword ?? 0) === 1 });
        return { id, username: input.username };
      }),
    core_user_update_users: (p) => {
      for (const input of p.users) {
        const user = state.users.get(Number(input.id));
        if (!user) return { warnings: [{ item: 'user', itemid: Number(input.id), warningcode: 'invaliduserid', message: 'Invalid user id' }] };
        if (input.suspended !== undefined) user.suspended = Number(input.suspended);
        if (input.password !== undefined) state.credentials.set(user.id, { password: input.password, emailed: false, forceChange: (input.preferences ?? []).some((p) => p.type === 'auth_forcepasswordchange' && String(p.value) === '1') });
      }
      return { warnings: [] };
    },
    core_course_get_categories: () => state.categories,
    core_course_create_courses: (p) =>
      p.courses.map((input) => {
        if ([...state.courses.values()].some((c) => c.shortname === input.shortname)) throw exception('shortnametaken', `Short name is already used for another course (${input.shortname})`);
        const id = state.nextCourseId++;
        state.courses.set(id, { id, shortname: input.shortname, fullname: input.fullname, idnumber: input.idnumber ?? '', categoryid: Number(input.categoryid), visible: Number(input.visible ?? 1) });
        return { id, shortname: input.shortname };
      }),
    core_course_update_courses: (p) => {
      for (const input of p.courses) {
        const course = state.courses.get(Number(input.id));
        if (!course) return { warnings: [{ item: 'course', itemid: Number(input.id), warningcode: 'errorcourseupdate', message: 'Course not found' }] };
        if (input.visible !== undefined) course.visible = Number(input.visible);
        if (input.fullname) course.fullname = input.fullname;
      }
      return { warnings: [] };
    },
    core_course_delete_courses: (p) => {
      for (const id of p.courseids) state.courses.delete(Number(id));
      return { warnings: [] };
    },
    enrol_manual_enrol_users: (p) => {
      for (const input of p.enrolments) {
        const courseid = Number(input.courseid);
        if (state.noManualInstance.has(courseid)) throw exception('wsnoinstance', 'Manual enrolment plugin instance doesn’t exist or is disabled for the course');
        const existing = state.enrolments.find((e) => e.userid === Number(input.userid) && e.courseid === courseid);
        if (existing) existing.suspended = Number(input.suspend ?? 0) === 1;
        else state.enrolments.push({ userid: Number(input.userid), courseid, roleid: Number(input.roleid), suspended: Number(input.suspend ?? 0) === 1 });
      }
      return null;
    },
    enrol_manual_unenrol_users: (p) => {
      for (const input of p.enrolments) {
        state.enrolments = state.enrolments.filter((e) => !(e.userid === Number(input.userid) && e.courseid === Number(input.courseid)));
      }
      return null;
    },
    core_enrol_get_enrolled_users: (p) =>
      state.enrolments
        .filter((e) => e.courseid === Number(p.courseid))
        .filter((e) => !(p.options ?? []).some((o) => o.name === 'onlyactive' && Number(o.value) === 1) || !e.suspended)
        .map((e) => ({ ...userOut(state.users.get(e.userid)), roles: [{ roleid: e.roleid, shortname: ROLE_SHORTNAMES[e.roleid] ?? `role${e.roleid}`, name: '' }] })),
    // Like Moodle: without includenotenrolledcourses=1 only courses the TOKEN user (id 2)
    // is enrolled in are returned.
    mod_assign_get_assignments: (p) => ({
      courses: (p.courseids ?? [])
        .map(Number)
        .filter((id) => String(p.includenotenrolledcourses) === '1' || state.enrolments.some((e) => e.userid === 2 && e.courseid === id))
        .map((id) => ({ id, assignments: state.assignments[id] ?? [] })),
      warnings: [],
    }),
    mod_assign_get_submissions: (p) => ({
      assignments: (p.assignmentids ?? []).map(Number).map((id) => ({
        assignmentid: id,
        submissions: Object.entries(state.submissions[id] ?? {}).map(([userid, sub]) => ({ userid: Number(userid), status: sub.status, timemodified: sub.timemodified, gradingstatus: state.assignGrades[id]?.[userid] ? 'graded' : 'notgraded' })),
      })),
      warnings: [],
    }),
    mod_assign_get_grades: (p) => ({
      assignments: (p.assignmentids ?? []).map(Number).map((id) => ({
        assignmentid: id,
        grades: Object.entries(state.assignGrades[id] ?? {}).map(([userid, g]) => ({ userid: Number(userid), grade: g.grade.toFixed(5), timemodified: 1791800000 })),
      })),
      warnings: [],
    }),
    mod_assign_save_grade: (p) => {
      const id = Number(p.assignmentid);
      const userid = Number(p.userid);
      (state.assignGrades[id] ??= {})[userid] = { grade: Number(p.grade), feedback: p.plugindata?.assignfeedbackcomments_editor?.text ?? '' };
      // Mirror it into the user's grade report, as Moodle does (released unless hidden).
      const assignment = Object.values(state.assignments).flat().find((a) => Number(a.id) === id);
      if (assignment) {
        const key = `${assignment.course}:${userid}`;
        const items = (state.grades[key] ??= []).filter((i) => Number(i.cmid) !== Number(assignment.cmid));
        items.push({ itemname: assignment.name, itemtype: 'mod', itemmodule: 'assign', cmid: assignment.cmid, gradeformatted: Number(p.grade).toFixed(2), grademin: 0, grademax: assignment.grade, gradeishidden: false, feedback: p.plugindata?.assignfeedbackcomments_editor?.text ?? '' });
        state.grades[key] = items;
      }
      return null;
    },
    mod_assign_get_submission_status: (p) => state.submissions[Number(p.assignid)] ? {
      lastattempt: {
        submission: { status: state.submissions[Number(p.assignid)][Number(p.userid)]?.status ?? 'new', timemodified: state.submissions[Number(p.assignid)][Number(p.userid)]?.timemodified ?? 0 },
        gradingstatus: state.assignGrades[Number(p.assignid)]?.[Number(p.userid)] ? 'graded' : 'notgraded',
        locked: false,
      },
      warnings: [],
    } : ({
      lastattempt: { submission: { status: 'submitted', timemodified: 1791700000 }, gradingstatus: 'notgraded', locked: false },
      // An unreleased grade, which the integration must not pass to the student.
      feedback: { grade: { grade: '99.00' }, gradefordisplay: '99.00' },
      warnings: [],
    }),
    gradereport_user_get_grade_items: (p) => ({
      usergrades: [{ courseid: Number(p.courseid), userid: Number(p.userid), gradeitems: state.grades[`${p.courseid}:${p.userid}`] ?? [] }],
      warnings: [],
    }),
  };

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      const send = (status, text) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(text);
      };
      if (req.method !== 'POST' || req.url !== '/webservice/rest/server.php') return send(404, '{"error":"not found"}');
      const params = parseForm(body);
      const fn = params.wsfunction;
      state.calls.push(fn);
      if (params.wstoken !== token) return send(200, JSON.stringify(exception('invalidtoken', 'Invalid token - token not found')));
      if (!state.functions.has(fn)) return send(200, JSON.stringify(exception('accessexception', 'Access control exception', 'webservice_access_exception')));

      const injected = state.inject[fn];
      if (injected) {
        delete state.inject[fn];
        if (injected === 'timeout') return undefined; // never answer
        if (injected === 'garbage') return send(200, '<html>Oops</html>');
        if (injected === 'http503') return send(503, 'Service Unavailable');
        if (injected === 'applyThenWelcomeError') {
          // As seen on MoodleCloud: the enrolment is saved, then sending the course
          // welcome message fails and the call reports an exception anyway.
          handlers[fn](params);
          return send(200, JSON.stringify(exception('Message was not sent.', 'error/Message was not sent.')));
        }
        if (injected === 'applyThenGarbage') {
          try {
            handlers[fn](params);
          } catch {
            /* the caller cannot tell either way, which is the point */
          }
          return send(200, '<html>proxy error</html>');
        }
        return send(200, JSON.stringify(injected));
      }
      try {
        return send(200, JSON.stringify(handlers[fn](params)));
      } catch (error) {
        return send(200, JSON.stringify(error));
      }
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  state.url = `http://127.0.0.1:${server.address().port}`;

  return {
    url: state.url,
    state,
    callsOf: (fn) => state.calls.filter((c) => c === fn).length,
    close: () => new Promise((resolve) => {
      server.closeAllConnections?.();
      server.close(resolve);
    }),
  };
}

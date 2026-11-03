import http from 'node:http';

/**
 * In-process stand-in for the CampusCore SIS integration API (/api/v1), following
 * docs/INTEGRATION_CONTRACT.md: OAuth client credentials with expiring/revocable tokens,
 * paginated reads, ETags, Idempotency-Key, policy-gated writes and identity links.
 * The automated suite talks only to this, never to a real SIS.
 */
export async function startCampusCoreStub({ clientId, clientSecret }) {
  const S = {
    institution: { id: 'inst-feddrick', slug: 'feddrick', name: 'Feddrick University', shortName: 'FU' },
    scopes: ['institution:read', 'terms:read', 'calendar:read', 'programs:read', 'sections:read', 'students:read', 'students:create', 'students:update', 'students:deactivate', 'identity:read', 'identity:write', 'audit:read', 'integration:configure', 'faculty:read', 'registrations:read', 'schedules:read', 'grades:read', 'people:read'],
    policies: { 'student.create': true, 'student.update': true, 'student.contact': true, 'student.academic': false, 'student.deactivate': true, 'registration.write': false, 'attendance.write': false, 'grade.write': false, 'identity.link': true },
    disabled: [],
    expiresIn: 900,
    tokens: new Map(),
    tokenRequests: 0,
    down: false,
    seq: 1,
    students: new Map(),
    faculty: new Map(),
    links: [],
    idempotency: new Map(),
    writes: [],
    failLinks: 0, // > 0: the next N link requests fail with 503 (outage mid-provisioning)
    linkIdempotency: new Map(),
    terms: [{ id: 'term-fa', code: '2026FA', name: 'Fall 2026', startDate: '2026-08-24', endDate: '2026-12-18', isCurrent: true, status: 'IN_PROGRESS' }],
    sections: [
      { id: 'sec-1', termCode: '2026FA', course: { id: 'c1', code: 'CS 301', title: 'Algorithms', credits: 3 }, sectionNumber: '01', status: 'OPEN', capacity: 30, meetings: [{ day: 'MON', dayOfWeek: 1, startTime: '10:00', endTime: '10:50', room: 'Hall 1' }], instructors: [{ facultyId: 'fac-1', name: 'Elena Vasquez', isPrimary: true }], facultyId: 'fac-1' },
      { id: 'sec-2', termCode: '2026FA', course: { id: 'c2', code: 'MATH 201', title: 'Linear Algebra', credits: 4 }, sectionNumber: '01', status: 'OPEN', capacity: 30, meetings: [], instructors: [{ facultyId: 'fac-2', name: 'Other Teacher', isPrimary: true }], facultyId: 'fac-2' },
    ],
    registrations: [],
  };
  const addStudent = (s) => {
    const id = s.id ?? `stu-${S.seq++}`;
    const rec = { id, studentNumber: s.studentNumber ?? `S${String(2600000 + S.seq).slice(0, 7)}`, firstName: s.firstName, lastName: s.lastName, preferredName: null, email: s.email, phone: null, status: s.status ?? 'ACTIVE', classLevel: 'JUNIOR', academicStanding: 'GOOD_STANDING', program: { id: 'prog-cs', code: 'BS-CS', name: 'Computer Science', degreeType: 'BS' }, hasRegistrationHold: false, version: 1 };
    S.students.set(id, rec);
    return rec;
  };
  addStudent({ id: 'stu-maya', studentNumber: 'S2400001', firstName: 'Maya', lastName: 'Chen', email: 'maya.chen@students.feddrick.edu' });
  addStudent({ id: 'stu-jordan', studentNumber: 'S2400002', firstName: 'Jordan', lastName: 'Rivera', email: 'jordan.rivera@students.feddrick.edu' });
  addStudent({ id: 'stu-dup-a', studentNumber: 'S2400003', firstName: 'Dup', lastName: 'A', email: 'shared@example.org' });
  addStudent({ id: 'stu-dup-b', studentNumber: 'S2400004', firstName: 'Dup', lastName: 'B', email: 'Shared@Example.org' });
  S.faculty.set('fac-1', { id: 'fac-1', employeeNumber: 'F1001', firstName: 'Elena', lastName: 'Vasquez', email: 'e.vasquez@feddrick.edu', status: 'ACTIVE', title: 'Associate Professor', department: { id: 'dep-cs', code: 'CS', name: 'Computer Science' } });
  S.faculty.set('fac-2', { id: 'fac-2', employeeNumber: 'F1002', firstName: 'Other', lastName: 'Teacher', email: 'other.teacher@feddrick.edu', status: 'ACTIVE', title: 'Lecturer', department: { id: 'dep-math', code: 'MATH', name: 'Mathematics' } });
  S.registrations.push({ id: 'reg-1', studentId: 'stu-maya', sectionId: 'sec-1', status: 'REGISTERED', credits: 3, waitlistPosition: null });
  S.registrations.push({ id: 'reg-2', studentId: 'stu-jordan', sectionId: 'sec-2', status: 'REGISTERED', credits: 4, waitlistPosition: null });

  const OPS = { 'student.create': 'students:create', 'student.update': 'students:update', 'student.contact': 'students:write', 'student.academic': 'students:academic', 'student.deactivate': 'students:deactivate', 'registration.write': 'registrations:write', 'attendance.write': 'attendance:write', 'grade.write': 'grades:write', 'identity.link': 'identity:write' };
  // As CampusCore: a token keeps the scopes it was issued with (effective = token ∩ client).
  let currentTokenScopes = null;
  const capabilities = () => Object.entries(OPS).map(([operation, scope]) => {
    const scopeGranted = S.scopes.includes(scope) && (!currentTokenScopes || currentTokenScopes.includes(scope));
    const policyEnabled = Boolean(S.policies[operation]);
    const clientEnabled = !S.disabled.includes(operation);
    const effective = scopeGranted && policyEnabled && clientEnabled;
    return { operation, label: operation, scope, scopeGranted, policyEnabled, clientEnabled, effective, reason: !scopeGranted ? `Scope ${scope} is not granted to this client.` : !policyEnabled ? 'Disabled by institutional policy.' : !clientEnabled ? "Disabled by this client's write preferences." : null };
  });
  const effective = (op) => capabilities().find((c) => c.operation === op).effective;
  const studentDto = (s) => { const { version, ...rest } = s; return rest; };
  const summary = (type, r) => (type === 'STUDENT'
    ? { recordType: 'STUDENT', sisId: r.id, institutionalId: r.studentNumber, displayName: `${r.firstName} ${r.lastName}`, email: r.email, status: r.status }
    : { recordType: 'FACULTY', sisId: r.id, institutionalId: r.employeeNumber, displayName: `${r.firstName} ${r.lastName}`, email: r.email, status: r.status });
  const recordOf = (type, id) => (type === 'STUDENT' ? S.students : S.faculty).get(id);
  const linkDto = (l) => ({ ...l, sisRecord: summary(l.recordType, recordOf(l.recordType, l.sisId)) });
  const norm = (e) => String(e ?? '').trim().toLowerCase();
  const paged = (rows, q) => {
    const page = Number(q.get('page') ?? 1);
    const pageSize = Number(q.get('pageSize') ?? 25);
    return { data: rows.slice((page - 1) * pageSize, page * pageSize), pagination: { page, pageSize, total: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / pageSize)) } };
  };
  const err = (status, code, message, extra = {}) => ({ status, body: { error: { code, message, requestId: `req-${S.seq++}`, ...extra } } });
  const sectionDto = (sec) => ({ ...sec, enrolled: S.registrations.filter((r) => r.sectionId === sec.id).length });

  // The person registry, as CampusCore derives it: records sharing a personId are one person.
  const personOf = (r) => r.personId ?? `per-${r.id}`;
  const CURRENT = { STUDENT: ['ACTIVE', 'ADMITTED', 'LEAVE_OF_ABSENCE'], FACULTY: ['ACTIVE'] };
  const people = () => {
    const by = new Map();
    for (const [type, map] of [['FACULTY', S.faculty], ['STUDENT', S.students]]) {
      for (const r of map.values()) {
        const id = personOf(r);
        const p = by.get(id) ?? { id, personNumber: `P${String(by.size + 1).padStart(7, '0')}`, records: [] };
        p.records.push({ type, r });
        by.set(id, p);
      }
    }
    return [...by.values()].map(({ id, personNumber, records }) => ({ ...personView(id, personNumber, records), identityExcluded: records.some(({ r }) => r.identityExcluded) }));
  };
  const personView = (id, personNumber, records) => {
    {
      const relationships = records.map(({ type, r }) => ({ type, sisId: r.id, number: type === 'STUDENT' ? r.studentNumber : r.employeeNumber, email: r.email, status: r.status, current: CURRENT[type].includes(r.status), ...(type === 'FACULTY' ? { title: r.title ?? null, department: r.department?.name ?? null } : { program: r.program?.name ?? null }) }));
      const named = (records.find((x) => x.type === 'FACULTY') ?? records[0]).r;
      const primary = relationships.find((x) => x.type === 'FACULTY' && x.current) ?? relationships.find((x) => x.current) ?? relationships[0];
      return { id, personNumber: named.personNumber ?? personNumber, firstName: named.firstName, lastName: named.lastName, preferredName: null, primaryEmail: norm(primary.email), emails: [...new Set(relationships.map((x) => norm(x.email)))], status: relationships.some((x) => x.current) ? 'ACTIVE' : 'INACTIVE', relationships };
    }
  };

  function route(method, path, q, body, headers) {
    let m;
    if (method === 'GET' && path === '/people') {
      if (!S.scopes.includes('people:read') || (currentTokenScopes && !currentTokenScopes.includes('people:read'))) return err(403, 'insufficient_scope', 'This operation requires the scope(s): people:read.');
      return { body: paged(people().filter((p) => !p.identityExcluded).filter((p) => (!q.get('studentNumber') || p.relationships.some((x) => x.type === 'STUDENT' && x.number === q.get('studentNumber'))) && (!q.get('employeeNumber') || p.relationships.some((x) => x.type === 'FACULTY' && x.number === q.get('employeeNumber')))), q) };
    }
    if (method === 'GET' && path === '/me') return { body: { clientId, name: 'Stub client', institution: S.institution, scopes: S.scopes } };
    if (method === 'GET' && path === '/capabilities') return { body: { data: { institution: S.institution, scopes: S.scopes, operations: capabilities() } } };
    if (method === 'PUT' && path === '/integration/write-preferences') {
      S.disabled = body.disabledOperations ?? [];
      return { body: { data: { preferences: body, operations: capabilities() } } };
    }
    if (method === 'GET' && path === '/institution') return { body: { data: S.institution } };
    if (method === 'GET' && path === '/terms') return { body: { data: q.get('current') ? S.terms.filter((t) => t.isCurrent) : S.terms } };
    if (method === 'GET' && path === '/programs') return { body: { data: [{ id: 'prog-cs', code: 'BS-CS', name: 'Computer Science', degreeType: 'BS', requiredCredits: 120, active: true }] } };
    if (method === 'GET' && path === '/calendar') return { body: { data: [{ id: 'cal-1', title: 'Last day to add', date: '2026-09-04', category: 'REGISTRATION' }] } };
    if (method === 'GET' && path === '/sections') return { body: paged(S.sections.map(sectionDto), q) };
    if (method === 'GET' && path === '/students') {
      const search = norm(q.get('search'));
      const email = norm(q.get('email'));
      const rows = [...S.students.values()].filter((s) => (!search || norm(`${s.firstName} ${s.lastName} ${s.email} ${s.studentNumber}`).includes(search)) && (!email || norm(s.email) === email) && (!q.get('studentNumber') || s.studentNumber === q.get('studentNumber')));
      return { body: paged(rows.map(studentDto), q) };
    }
    if (method === 'POST' && path === '/students') {
      if (!S.scopes.includes('students:create')) return err(403, 'insufficient_scope', 'This operation requires the scope(s): students:create.');
      if (!effective('student.create')) return err(422, 'policy_disabled', 'Student creation is disabled.');
      const key = headers['idempotency-key'];
      if (!key) return err(400, 'idempotency_key_required', 'Idempotency-Key required.');
      const prior = S.idempotency.get(key);
      if (prior) return prior.body === JSON.stringify(body) ? { ...prior.res, replayed: true } : err(422, 'idempotency_key_reused', 'Key reused with a different body.');
      if ([...S.students.values()].some((s) => norm(s.email) === norm(body.email))) return err(409, 'duplicate_student', 'A student with this email already exists.');
      S.writes.push({ op: 'create', actingUser: headers['x-acting-user'] });
      const rec = addStudent({ ...body, status: body.status ?? 'ADMITTED' });
      const res = { status: 201, body: { data: studentDto(rec) }, etag: `"v${rec.version}"` };
      S.idempotency.set(key, { body: JSON.stringify(body), res });
      return res;
    }
    if ((m = path.match(/^\/students\/([^/]+)$/))) {
      const s = S.students.get(m[1]);
      if (!s) return err(404, 'not_found', 'Not found.');
      if (method === 'GET') return { body: { data: studentDto(s) }, etag: `"v${s.version}"` };
      if (method === 'PATCH') {
        if (headers['if-match'] && headers['if-match'] !== `"v${s.version}"`) return err(412, 'precondition_failed', 'The record changed since you loaded it.');
        if ('programId' in body) return err(403, 'field_not_permitted', 'Some fields are not writable.', { details: [{ field: 'programId', message: 'Disabled by institutional policy.' }] });
        S.writes.push({ op: 'update', actingUser: headers['x-acting-user'] });
        Object.assign(s, body);
        s.version += 1;
        return { body: { data: studentDto(s), meta: { changedFields: Object.keys(body) } }, etag: `"v${s.version}"` };
      }
    }
    if ((m = path.match(/^\/students\/([^/]+)\/deactivate$/)) && method === 'POST') {
      const s = S.students.get(m[1]);
      if (!s) return err(404, 'not_found', 'Not found.');
      if (!effective('student.deactivate')) return err(422, 'policy_disabled', 'Deactivation is disabled.');
      S.writes.push({ op: 'deactivate', actingUser: headers['x-acting-user'] });
      s.status = 'WITHDRAWN';
      return { body: { data: studentDto(s), meta: { changed: true } } };
    }
    if ((m = path.match(/^\/students\/([^/]+)\/(schedule|academic-record|grades|registrations|audit)$/))) {
      const s = S.students.get(m[1]);
      if (!s) return err(404, 'not_found', 'Not found.');
      const regs = S.registrations.filter((r) => r.studentId === s.id);
      if (m[2] === 'schedule') {
        // As CampusCore: the requested term, or the current one; only that term's sections.
        const term = q.get('termId') ? S.terms.find((t) => t.id === q.get('termId')) : S.terms.find((t) => t.isCurrent);
        if (!term) return err(404, 'not_found', 'Term not found.');
        const inTerm = regs.filter((r) => ['REGISTERED', 'WAITLISTED', 'COMPLETED'].includes(r.status) && S.sections.find((x) => x.id === r.sectionId)?.termCode === term.code);
        return { body: { data: { term, classes: inTerm.map((r) => ({ ...sectionDto(S.sections.find((x) => x.id === r.sectionId)), registrationId: r.id, registrationStatus: r.status, waitlistPosition: r.waitlistPosition ?? null })) } } };
      }
      if (m[2] === 'academic-record') return { body: { data: { studentId: s.id, cumulativeGpa: s.id === 'stu-maya' ? 3.62 : 2.91, creditsEarned: 64, creditsInProgress: 3, academicStanding: 'GOOD_STANDING', classLevel: 'JUNIOR', terms: [{ term: '2026SP', termGpa: 3.7 }] } } };
      if (m[2] === 'grades') return { body: { data: [{ term: '2026SP', termName: 'Spring 2026', termGpa: 3.7, courses: [{ courseCode: 'CS 201', courseTitle: 'Data Structures', credits: 3, grade: s.id === 'stu-maya' ? 'A-' : 'C+', state: 'COMPLETED' }] }] } };
      // As CampusCore's registrationDto: a compact section summary.
      if (m[2] === 'registrations') return { body: { data: regs.map((r) => { const sec = S.sections.find((x) => x.id === r.sectionId); return { ...r, section: { id: sec.id, termCode: sec.termCode, courseCode: sec.course.code, courseTitle: sec.course.title, sectionNumber: sec.sectionNumber } }; }) } };
      return { body: paged([{ id: 'aud-1', action: 'student.updated' }], q) };
    }
    if (method === 'GET' && path === '/faculty') {
      const search = norm(q.get('search'));
      const rows = [...S.faculty.values()].filter((f) => !search || norm(`${f.firstName} ${f.lastName} ${f.email} ${f.employeeNumber}`).includes(search));
      return { body: paged(rows, q) };
    }
    if (method === 'GET' && (m = path.match(/^\/faculty\/([^/]+)$/))) {
      const f = S.faculty.get(m[1]);
      return f ? { body: { data: f } } : err(404, 'not_found', 'Faculty member not found.');
    }
    if ((m = path.match(/^\/faculty\/([^/]+)\/(sections|schedule)$/))) {
      const mine = S.sections.filter((x) => x.facultyId === m[1]).map(sectionDto);
      return m[2] === 'sections' ? { body: { data: mine } } : { body: { data: { term: S.terms[0], classes: mine } } };
    }
    if (method === 'GET' && (m = path.match(/^\/sections\/([^/]+)$/))) {
      const sec = S.sections.find((x) => x.id === m[1]);
      return sec ? { body: { data: { ...sectionDto(sec), termId: S.terms.find((t) => t.code === sec.termCode)?.id ?? null } } } : err(404, 'not_found', 'Section not found.');
    }
    if ((m = path.match(/^\/sections\/([^/]+)\/roster$/))) {
      return { body: { data: S.registrations.filter((r) => r.sectionId === m[1]).map((r) => ({ ...r, student: { id: r.studentId, studentNumber: S.students.get(r.studentId).studentNumber, name: `${S.students.get(r.studentId).firstName} ${S.students.get(r.studentId).lastName}`, email: S.students.get(r.studentId).email } })) } };
    }
    if (method === 'GET' && path === '/identity/resolve') {
      // As CampusCore does: per record type when asked, LINKED_MULTIPLE when several and no type; the record's own
      // status is returned as recordStatus.
      const wanted = q.get('recordType');
      const rows = S.links.filter((x) => x.externalUserId === q.get('externalUserId') && x.status === 'ACTIVE' && (!wanted || x.recordType === wanted));
      const resolved = rows.map((l) => {
        const { status: recordStatus, ...r } = summary(l.recordType, recordOf(l.recordType, l.sisId));
        return { linkId: l.id, ...r, recordStatus };
      });
      if (!rows.length) return { body: { data: { externalUserId: q.get('externalUserId'), status: 'UNMAPPED', links: [] } } };
      if (rows.length > 1) return { body: { data: { externalUserId: q.get('externalUserId'), status: 'LINKED_MULTIPLE', links: resolved } } };
      return { body: { data: { externalUserId: q.get('externalUserId'), status: 'LINKED', ...resolved[0], links: resolved } } };
    }
    if (method === 'POST' && path === '/identity/reconcile') {
      const results = body.candidates.map((c) => {
        const existing = S.links.find((x) => x.externalUserId === c.externalUserId && x.recordType === c.recordType && x.status === 'ACTIVE');
        if (existing) return { externalUserId: c.externalUserId, recordType: c.recordType, status: 'LINKED', linkId: existing.id, sisRecord: summary(existing.recordType, recordOf(existing.recordType, existing.sisId)), warnings: [] };
        const pool = c.recordType === 'STUDENT' ? [...S.students.values()] : [...S.faculty.values()];
        const matches = c.email ? pool.filter((r) => norm(r.email) === norm(c.email)) : [];
        if (!matches.length) return { externalUserId: c.externalUserId, recordType: c.recordType, status: 'UNMATCHED', candidates: [], reason: 'No CampusCore record has this email or institutional ID.' };
        if (matches.length > 1) return { externalUserId: c.externalUserId, recordType: c.recordType, status: 'AMBIGUOUS', candidates: matches.map((r) => summary(c.recordType, r)), reason: 'Several records match.' };
        return { externalUserId: c.externalUserId, recordType: c.recordType, status: 'CANDIDATE', candidates: [{ ...summary(c.recordType, matches[0]), evidence: { emailMatch: true } }] };
      });
      return { body: { data: results, summary: results.reduce((a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {}) } };
    }
    if (method === 'GET' && path === '/identity/links') {
      const rows = S.links.filter((l) => (!q.get('status') || l.status === q.get('status')) && (!q.get('sisRecordId') || l.sisId === q.get('sisRecordId')) && (!q.get('externalUserId') || l.externalUserId === q.get('externalUserId')));
      return { body: paged(rows.map(linkDto), q) };
    }
    if (method === 'POST' && path === '/identity/links') {
      if (S.failLinks > 0) {
        S.failLinks -= 1;
        return err(503, 'internal_error', 'Temporarily unavailable.');
      }
      const key = headers['idempotency-key'];
      if (key && S.linkIdempotency.has(key)) return { ...S.linkIdempotency.get(key), replayed: true };
      if (!effective('identity.link')) return err(422, 'policy_disabled', 'Link and unlink external accounts via the API is disabled by institutional policy.');
      if (!body.confirm) return err(400, 'validation_error', 'confirm must be true.');
      const record = recordOf(body.recordType, body.sisRecordId);
      if (!record) return err(404, 'not_found', 'Not found.');
      if (record.identityExcluded) return err(422, 'person_identity_excluded', 'This person is excluded from identity provisioning in CampusCore.');
      if (S.links.some((l) => l.status === 'ACTIVE' && l.externalUserId === body.externalUserId && l.recordType === body.recordType)) return err(409, 'identity_already_linked', 'This account is already linked to a record of this type.');
      // A second relationship must belong to the same CampusCore person (the person registry; every record has one).
      const other = S.links.find((l) => l.status === 'ACTIVE' && l.externalUserId === body.externalUserId && l.recordType !== body.recordType);
      let samePerson = null;
      if (other) {
        if (personOf(recordOf(other.recordType, other.sisId)) !== personOf(record)) return err(422, 'identity_different_person', 'This record belongs to a different CampusCore person.');
        samePerson = 'CAMPUSCORE_PERSON';
      }
      if (S.links.some((l) => l.status === 'ACTIVE' && l.sisId === body.sisRecordId)) return err(409, 'record_already_linked', 'This record is already linked.');
      const otherEmailMatches = samePerson === 'CAMPUSCORE_PERSON' && norm(body.externalEmail) === norm(recordOf(other.recordType, other.sisId).email);
      if (norm(body.externalEmail) !== norm(record.email) && !otherEmailMatches && !body.evidenceMismatchReason) return err(422, 'identity_evidence_mismatch', 'The external email does not match the SIS record. Give a verification reason to link anyway.');
      const link = { id: `link-${S.seq++}`, externalSystem: body.externalSystem, externalUserId: body.externalUserId, externalEmail: body.externalEmail, recordType: body.recordType, sisId: body.sisRecordId, status: 'ACTIVE', evidence: { mismatchReason: body.evidenceMismatchReason ?? null, ...(samePerson ? { samePerson } : {}) }, actingUser: headers['x-acting-user'] };
      S.links.push(link);
      const res = { status: 201, body: { data: linkDto(link) } };
      if (key) S.linkIdempotency.set(key, res);
      return res;
    }
    if ((m = path.match(/^\/identity\/links\/([^/]+)\/revoke$/)) && method === 'POST') {
      const l = S.links.find((x) => x.id === m[1]);
      if (!l) return err(404, 'not_found', 'Not found.');
      l.status = 'REVOKED';
      l.revokedReason = body.reason;
      return { body: { data: linkDto(l) } };
    }
    return err(404, 'route_not_found', `No route ${method} ${path}`);
  }

  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const send = (status, body, extra = {}) => {
        res.writeHead(status, { 'Content-Type': 'application/json', ...extra });
        res.end(body === null ? '' : JSON.stringify(body));
      };
      if (S.down) return send(503, { error: { code: 'internal_error', message: 'down' } });
      const url = new URL(req.url, 'http://stub');
      if (url.pathname === '/api/v1/oauth/token') {
        S.tokenRequests += 1;
        const [id, secret] = Buffer.from((req.headers.authorization ?? '').replace(/^Basic /, ''), 'base64').toString().split(':').map(decodeURIComponent);
        if (id !== clientId || secret !== clientSecret) return send(401, { error: 'invalid_client', error_description: 'Client authentication failed.' });
        const token = `tok-${S.seq++}`;
        S.tokens.set(token, { expiresAt: Date.now() + S.expiresIn * 1000, revoked: false, scopes: [...S.scopes] });
        return send(200, { access_token: token, token_type: 'Bearer', expires_in: S.expiresIn, scope: S.scopes.join(' ') }, { 'Cache-Control': 'no-store' });
      }
      const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
      const t = S.tokens.get(token);
      if (!t || t.revoked || t.expiresAt < Date.now()) return send(401, { error: { code: 'invalid_token', message: 'The access token is invalid, expired or revoked.' } });
      currentTokenScopes = t.scopes;
      const body = raw ? JSON.parse(raw) : {};
      const out = route(req.method, url.pathname.replace(/^\/api\/v1/, ''), url.searchParams, body, req.headers);
      return send(out.status ?? 200, out.body, { ...(out.etag ? { ETag: out.etag } : {}), ...(out.replayed ? { 'Idempotent-Replayed': 'true' } : {}) });
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    url,
    state: S,
    link: (externalUserId, recordType, sisId) => S.links.push({ id: `link-${S.seq++}`, externalSystem: 'edunexusai', externalUserId, recordType, sisId, status: 'ACTIVE' }),
    revokeAllTokens: () => S.tokens.forEach((t) => { t.revoked = true; }),
    close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }),
  };
}

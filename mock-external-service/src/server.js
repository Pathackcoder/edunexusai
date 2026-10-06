/**
 * Mock University API — stands in for a real external institutional system.
 *
 * This process is NOT part of EdunexusAI. It exists to give the integration layer a real
 * network boundary to cross: the EdunexusAI backend reaches it over HTTP through a
 * connector, maps the payloads into the canonical model, and only then answers React.
 * The React app never talks to this service and never sees its field names.
 *
 * Two surfaces are exposed:
 *   /external/...            SIS-style resources (snake_case, registrar vocabulary)
 *   /canvas/api/v1/...       Canvas-LMS-compatible resources, matching the public
 *                            Canvas REST shapes so CanvasConnector can run in mock mode
 *
 * Run:  npm start            (default http://localhost:5002)
 */
import express from 'express';
import cors from 'cors';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(here, '..', 'data');

const PORT = Number.parseInt(process.env.MOCK_PORT ?? '5002', 10);
const API_KEY = process.env.MOCK_API_KEY ?? 'mock-local-api-key';
const REQUIRE_KEY = process.env.MOCK_REQUIRE_KEY !== 'false';
/** Artificial latency so loading states in the UI are real, not theoretical. */
const LATENCY_MS = Number.parseInt(process.env.MOCK_LATENCY_MS ?? '120', 10);
/** Flip to 'true' to make every endpoint fail, to demonstrate integration health/errors. */
const FORCE_FAILURE = process.env.MOCK_FORCE_FAILURE === 'true';

const load = async (file) => JSON.parse(await readFile(resolve(DATA_DIR, file), 'utf8'));

const db = {
  terms: await load('terms.json'),
  students: await load('students.json'),
  courses: await load('courses.json'),
  enrollments: await load('enrollments.json'),
  assignments: await load('assignments.json'),
  academicHistory: await load('academic-history.json'),
  financialAid: await load('financial-aid.json'),
  canvasCourses: await load('canvas-courses.json'),
  canvasAssignments: await load('canvas-assignments.json'),
  canvasEnrollments: await load('canvas-enrollments.json'),
};

const app = express();
app.use(cors());
app.use(express.json());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.use(async (_req, _res, next) => {
  if (LATENCY_MS > 0) await sleep(LATENCY_MS);
  next();
});

app.use((req, res, next) => {
  if (FORCE_FAILURE && req.path !== '/external/health') {
    return res.status(503).json({
      error: 'SERVICE_UNAVAILABLE',
      message: 'Upstream student information system is unavailable (simulated failure).',
    });
  }
  next();
});

/** Every protected route requires the provider API key, as a real SIS would. */
function requireApiKey(req, res, next) {
  if (!REQUIRE_KEY) return next();
  const presented = req.get('x-api-key') ?? req.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (presented !== API_KEY) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing or invalid API key.' });
  }
  return next();
}

// ---------------------------------------------------------------------------
// Health (unauthenticated, as most vendor status endpoints are)
// ---------------------------------------------------------------------------
app.get('/external/health', (_req, res) => {
  res.json({
    status: FORCE_FAILURE ? 'degraded' : 'ok',
    service: 'mock-university-api',
    version: '1.0.0',
    api_version: 'v1',
    record_counts: {
      students: db.students.length,
      courses: db.courses.length,
      registrations: db.enrollments.length,
      coursework: db.assignments.length,
    },
    server_time: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// SIS surface
// ---------------------------------------------------------------------------
app.get('/external/terms', requireApiKey, (_req, res) => res.json({ data: db.terms }));

app.get('/external/students', requireApiKey, (_req, res) => res.json({ data: db.students }));

app.get('/external/students/:sisStudentId', requireApiKey, (req, res) => {
  const student = db.students.find((s) => s.sis_student_id === req.params.sisStudentId);
  if (!student) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'No such SIS student id.' });
  }
  return res.json({ data: student });
});

app.get('/external/courses', requireApiKey, (req, res) => {
  const { term, subject } = req.query;
  let rows = db.courses;
  if (term) rows = rows.filter((c) => c.term_code === term);
  if (subject) rows = rows.filter((c) => c.subject_code === subject);
  res.json({ data: rows, meta: { count: rows.length, term_code: term ?? null } });
});

app.get('/external/courses/:sisCourseId', requireApiKey, (req, res) => {
  const course = db.courses.find((c) => c.sis_course_id === req.params.sisCourseId);
  if (!course) return res.status(404).json({ error: 'NOT_FOUND', message: 'No such SIS course id.' });
  return res.json({ data: course });
});

app.get('/external/enrollments', requireApiKey, (req, res) => {
  const { studentId, courseId, term } = req.query;
  let rows = db.enrollments;
  if (studentId) rows = rows.filter((e) => e.sis_student_id === studentId);
  if (courseId) rows = rows.filter((e) => e.sis_course_id === courseId);
  if (term) rows = rows.filter((e) => e.term_code === term);
  res.json({ data: rows, meta: { count: rows.length } });
});

/** The registrar's published timetable for one student. */
app.get('/external/schedule', requireApiKey, (req, res) => {
  const { studentId } = req.query;
  if (!studentId) {
    return res.status(400).json({ error: 'BAD_REQUEST', message: 'studentId is required.' });
  }
  const registered = db.enrollments
    .filter((e) => e.sis_student_id === studentId)
    .map((e) => e.sis_course_id);
  const rows = db.courses
    .filter((c) => registered.includes(c.sis_course_id))
    .map((c) => ({
      sis_course_id: c.sis_course_id,
      crn: c.crn,
      subject_code: c.subject_code,
      catalog_number: c.catalog_number,
      course_title: c.course_title,
      credit_hours: c.credit_hours,
      meeting_pattern: c.meeting_pattern,
      instructor_of_record: c.instructor_of_record,
      publication_attributes: c.publication_attributes,
      catalog_description: c.catalog_description,
      term_code: c.term_code,
    }));
  return res.json({ data: rows, meta: { count: rows.length, sis_student_id: studentId } });
});

app.get('/external/assignments', requireApiKey, (req, res) => {
  const { courseId, studentId } = req.query;
  let rows = db.assignments;
  if (courseId) rows = rows.filter((a) => a.sis_course_id === courseId);
  if (studentId) {
    const registered = db.enrollments
      .filter((e) => e.sis_student_id === studentId)
      .map((e) => e.sis_course_id);
    rows = rows.filter((a) => registered.includes(a.sis_course_id));
  }
  res.json({ data: rows, meta: { count: rows.length } });
});

app.get('/external/grades', requireApiKey, (req, res) => {
  const { studentId } = req.query;
  if (studentId && studentId !== db.academicHistory.sis_student_id) {
    return res.json({ data: { sis_student_id: studentId, prior_terms: [] } });
  }
  return res.json({ data: db.academicHistory });
});

app.get('/external/financial-aid', requireApiKey, (req, res) => {
  const { studentId } = req.query;
  if (studentId && studentId !== db.financialAid.sis_student_id) {
    return res.status(404).json({ error: 'NOT_FOUND', message: 'No aid record for that student.' });
  }
  return res.json({ data: db.financialAid });
});

// ---------------------------------------------------------------------------
// Canvas-compatible surface (public Canvas REST shapes)
// ---------------------------------------------------------------------------
const canvasAuth = (req, res, next) => {
  const token = req.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({ errors: [{ message: 'Invalid access token.' }] });
  }
  return next();
};

app.get('/canvas/api/v1/users/self', canvasAuth, (_req, res) =>
  res.json({ id: 3001, name: 'Amit Pathak', sis_user_id: '0098421', login_id: 'student@edunexus.ai' }),
);

app.get('/canvas/api/v1/courses', canvasAuth, (_req, res) => res.json(db.canvasCourses));

app.get('/canvas/api/v1/courses/:courseId', canvasAuth, (req, res) => {
  const course = db.canvasCourses.find((c) => String(c.id) === req.params.courseId);
  if (!course) return res.status(404).json({ errors: [{ message: 'The specified resource does not exist.' }] });
  return res.json(course);
});

app.get('/canvas/api/v1/courses/:courseId/assignments', canvasAuth, (req, res) => {
  res.json(db.canvasAssignments.filter((a) => String(a.course_id) === req.params.courseId));
});

app.get('/canvas/api/v1/courses/:courseId/enrollments', canvasAuth, (req, res) => {
  res.json(db.canvasEnrollments.filter((e) => String(e.course_id) === req.params.courseId));
});

app.use((req, res) =>
  res.status(404).json({ error: 'NOT_FOUND', message: `No such endpoint: ${req.method} ${req.originalUrl}` }),
);

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[mock-university-api] listening on http://localhost:${PORT}`);
    console.log(`[mock-university-api] SIS surface    : http://localhost:${PORT}/external`);
    console.log(`[mock-university-api] Canvas surface : http://localhost:${PORT}/canvas/api/v1`);
    console.log(`[mock-university-api] health         : http://localhost:${PORT}/external/health`);
  });
}

export { app };

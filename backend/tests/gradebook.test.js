import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, closeTestServer, login } from './helpers/testEnv.js';
import { courseResult } from '../src/modules/gradebook/gradeMath.js';

after(closeTestServer);

const OTHER_UUID = '00000000-0000-4000-8000-000000000000';

async function facultyCourse() {
  const token = await login('faculty');
  const { body } = await api('/faculty/gradebook/courses', { token });
  const course = body.data.find((c) => c.assignmentCount > 0) ?? body.data[0];
  const book = (await api(`/faculty/courses/${course.id}/gradebook`, { token })).body.data;
  return { token, course, book };
}

describe('gradebook calculations', () => {
  const assignments = [
    { id: 'a', maxPoints: 100, weight: 25, dueDate: '2020-01-01' },
    { id: 'b', maxPoints: 50, weight: 75, dueDate: '2020-02-01' },
    { id: 'c', maxPoints: 20, weight: 0, dueDate: '2999-01-01' },
  ];
  const scores = { a: 80, b: 25, c: null };

  it('computes points-based totals and excludes missing work by default', () => {
    const r = courseResult({ assignments, scoreOf: (id) => scores[id], method: 'POINTS' });
    assert.equal(r.earned, 105);
    assert.equal(r.possible, 150);
    assert.equal(r.percentage, 70);
    assert.equal(r.graded, 2);
  });

  it('computes weighted totals from assignment weights', () => {
    const r = courseResult({ assignments, scoreOf: (id) => scores[id], method: 'WEIGHTED' });
    assert.equal(r.percentage, 57.5); // (25×0.8 + 75×0.5) / 100
  });

  it('counts missing work as zero only when the policy says so, and only once past due', () => {
    const missingPast = { a: null, b: 50, c: null };
    const excluded = courseResult({ assignments, scoreOf: (id) => missingPast[id] });
    const zeroed = courseResult({ assignments, scoreOf: (id) => missingPast[id], missingPolicy: 'ZERO' });
    assert.equal(excluded.percentage, 100);
    assert.equal(zeroed.percentage, 33.3); // c is not yet due, so it is never zeroed
    assert.equal(zeroed.missing, 1);
  });

  it('never flags a student at risk without enough graded work', () => {
    const one = courseResult({ assignments, scoreOf: (id) => (id === 'a' ? 10 : null) });
    assert.equal(one.risk, 'INSUFFICIENT_DATA');
    const two = courseResult({ assignments, scoreOf: (id) => ({ a: 10, b: 10 })[id] ?? null, threshold: 70 });
    assert.equal(two.risk, 'AT_RISK');
  });
});

describe('faculty gradebook', () => {
  it('drafts are private until published, then the student sees them', async () => {
    const { token, course, book } = await facultyCourse();
    const assignment = book.assignments[0];
    const amit = book.students.find((s) => s.email === 'student@edunexus.ai');
    assert.ok(amit, 'the demo student is enrolled in the faculty course');
    // A value that differs from what is published now, so the test is repeatable.
    const current = amit.cells[assignment.id].published;
    const score = Math.min(assignment.maxPoints, current === 42.5 ? 37.5 : 42.5);

    const saved = await api(`/faculty/courses/${course.id}/gradebook/scores`, { method: 'PUT', token, body: { scores: [{ assignmentId: assignment.id, studentProfileId: amit.studentProfileId, score }] } });
    assert.equal(saved.status, 200);
    const cell = saved.body.data.students.find((s) => s.studentProfileId === amit.studentProfileId).cells[assignment.id];
    assert.equal(cell.hasDraft, true);
    assert.equal(cell.draft, score);

    // The student's assignment and grade routes still show only the published value.
    const studentToken = await login('student');
    const before = (await api('/academics/assignments', { token: studentToken })).body.data;
    const seen = (Array.isArray(before) ? before : before.assignments).find((a) => a.id === assignment.id);
    assert.notEqual(seen?.score, score, 'a draft score must not reach the student');

    const published = await api(`/faculty/courses/${course.id}/gradebook/publish`, { method: 'POST', token, body: { assignmentId: assignment.id } });
    assert.equal(published.status, 200);
    assert.ok(published.body.data.published >= 1);

    const after = (await api('/academics/assignments', { token: studentToken })).body.data;
    assert.equal((Array.isArray(after) ? after : after.assignments).find((a) => a.id === assignment.id).score, score);
    const grades = (await api('/academics/grades', { token: studentToken })).body.data;
    const courseGrade = grades.currentCourses.find((c) => c.courseCode === course.code);
    assert.ok(courseGrade.coursework && courseGrade.coursework.graded >= 1, 'published coursework totals reach the student');
    const notes = (await api('/notifications', { token: studentToken })).body.data;
    assert.ok((notes.notifications ?? notes).some((n) => n.title === `New grades posted in ${course.code}`));
  });

  it('rejects invalid scores without saving any of the batch', async () => {
    const { token, course, book } = await facultyCourse();
    const [a] = book.assignments;
    const [s1, s2] = book.students;
    const tooHigh = await api(`/faculty/courses/${course.id}/gradebook/scores`, { method: 'PUT', token, body: { scores: [{ assignmentId: a.id, studentProfileId: s1.studentProfileId, score: 1 }, { assignmentId: a.id, studentProfileId: s2.studentProfileId, score: a.maxPoints + 1 }] } });
    assert.equal(tooHigh.status, 400);
    const negative = await api(`/faculty/courses/${course.id}/gradebook/scores`, { method: 'PUT', token, body: { scores: [{ assignmentId: a.id, studentProfileId: s1.studentProfileId, score: -2 }] } });
    assert.equal(negative.status, 400);
    const text = await api(`/faculty/courses/${course.id}/gradebook/scores`, { method: 'PUT', token, body: { scores: [{ assignmentId: a.id, studentProfileId: s1.studentProfileId, score: 'ninety' }] } });
    assert.equal(text.status, 400);
    const notEnrolled = await api(`/faculty/courses/${course.id}/gradebook/scores`, { method: 'PUT', token, body: { scores: [{ assignmentId: a.id, studentProfileId: OTHER_UUID, score: 1 }] } });
    assert.equal(notEnrolled.status, 400);
    const unchanged = (await api(`/faculty/courses/${course.id}/gradebook`, { token })).body.data.students.find((s) => s.studentProfileId === s1.studentProfileId).cells[a.id];
    assert.equal(unchanged.hasDraft && unchanged.draft === 1, false, 'the valid entry in a rejected batch was not saved');
  });

  it('enforces instructor-of-record and role boundaries', async () => {
    const { course } = await facultyCourse();
    const student = await api(`/faculty/courses/${course.id}/gradebook`, { token: await login('student') });
    assert.equal(student.status, 403);
    const admin = await api(`/faculty/courses/${course.id}/gradebook`, { token: await login('admin') });
    assert.equal(admin.status, 403, 'administrators do not grade another instructor’s course');

    const facultyToken = await login('faculty');
    const allCourses = (await api('/academics/courses', { token: await login('student') })).body.data;
    const notTaught = (allCourses.courses ?? allCourses).find((c) => c.code !== course.code);
    if (notTaught?.id) {
      const other = await api(`/faculty/courses/${notTaught.id}/gradebook`, { token: facultyToken });
      assert.equal(other.status, 403);
    }
  });

  it('saves grading settings and recalculates with weights', async () => {
    const { token, course, book } = await facultyCourse();
    const weights = book.assignments.map((a, i) => ({ assignmentId: a.id, weight: i === 0 ? 100 : 0 }));
    const res = await api(`/faculty/courses/${course.id}/gradebook/settings`, { method: 'PUT', token, body: { gradingMethod: 'WEIGHTED', missingWorkPolicy: 'EXCLUDE', atRiskThreshold: 65, weights } });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.course.gradingMethod, 'WEIGHTED');
    assert.equal(res.body.data.course.atRiskThreshold, 65);
    const bad = await api(`/faculty/courses/${course.id}/gradebook/settings`, { method: 'PUT', token, body: { gradingMethod: 'CURVE', missingWorkPolicy: 'EXCLUDE', atRiskThreshold: 65 } });
    assert.equal(bad.status, 400);
  });
});

describe('portal appearance', () => {
  it('lets only administrators change the institution appearance, with validated presets', async () => {
    const pub = await api('/appearance');
    assert.equal(pub.status, 200);
    assert.ok(pub.body.data.themeKey);
    const student = await api('/appearance', { method: 'PUT', token: await login('student'), body: { themeKey: 'black-gold', fontKey: 'modern-campus' } });
    assert.equal(student.status, 403);
    const adminToken = await login('admin');
    const invalid = await api('/appearance', { method: 'PUT', token: adminToken, body: { themeKey: 'neon', fontKey: 'modern-campus' } });
    assert.equal(invalid.status, 400);
    const ok = await api('/appearance', { method: 'PUT', token: adminToken, body: { themeKey: 'teal-white', fontKey: 'collegiate-serif' } });
    assert.equal(ok.status, 200);
    const me = await api('/auth/me', { token: await login('faculty') });
    assert.deepEqual(me.body.data.user.appearance, { themeKey: 'teal-white', fontKey: 'collegiate-serif' });
  });
});

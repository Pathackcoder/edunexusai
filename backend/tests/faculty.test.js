import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { api, closeTestServer, login } from './helpers/testEnv.js';

after(closeTestServer);

describe('faculty experience', () => {
  it('lists only the courses this faculty member teaches', async () => {
    const token = await login('faculty');
    const { status, body } = await api('/faculty/courses', { token });

    assert.equal(status, 200);
    assert.ok(body.data.length > 0, 'the faculty account teaches at least one course');
    for (const course of body.data) {
      assert.ok(course.enrolledCount >= 0);
      assert.ok(course.code);
    }
    assert.ok(body.data.some((course) => course.code === 'CS 501'));
  });

  it('returns the enrolled roster for a taught course', async () => {
    const token = await login('faculty');
    const { body: courses } = await api('/faculty/courses', { token });
    const course = courses.data.find((item) => item.code === 'CS 501');

    const { status, body } = await api(`/faculty/courses/${course.id}/students`, { token });
    assert.equal(status, 200);
    assert.equal(body.data.course.code, 'CS 501');
    assert.equal(body.data.enrolledCount, body.data.students.length);
    assert.ok(body.data.students.length > 1, 'the roster has more than one student');
    assert.ok(body.data.students[0].email);
    assert.ok(body.data.students[0].studentNumber);
  });

  it('sends a class notification that reaches every enrolled student', async () => {
    const facultyToken = await login('faculty');
    const studentToken = await login('student');

    const { body: courses } = await api('/faculty/courses', { token: facultyToken });
    const course = courses.data.find((item) => item.code === 'CS 501');

    const before = await api('/notifications', { token: studentToken });
    const beforeCount = before.body.data.length;

    const sent = await api(`/faculty/courses/${course.id}/notifications`, {
      method: 'POST',
      token: facultyToken,
      body: {
        title: 'Test suite review session',
        message: 'This notification was created by the automated test suite.',
        priority: 'high',
      },
    });

    assert.equal(sent.status, 201);
    assert.equal(sent.body.data.recipientCount, course.enrolledCount);
    assert.ok(sent.body.data.notificationsCreated > 0);

    // The student actually receives it — this is the end-to-end claim being proven.
    const after = await api('/notifications', { token: studentToken });
    assert.equal(after.body.data.length, beforeCount + 1);
    assert.equal(after.body.data[0].title, 'Test suite review session');
    assert.equal(after.body.data[0].isRead, false);
    assert.equal(after.body.data[0].priority, 'high');
  });

  it('validates the notification body', async () => {
    const token = await login('faculty');
    const { body: courses } = await api('/faculty/courses', { token });
    const { status, body } = await api(`/faculty/courses/${courses.data[0].id}/notifications`, {
      method: 'POST',
      token,
      body: { title: 'x', message: '' },
    });
    assert.equal(status, 400);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
  });

  it('posts a course announcement that students then see', async () => {
    const facultyToken = await login('faculty');
    const studentToken = await login('student');

    const { body: courses } = await api('/faculty/courses', { token: facultyToken });
    const course = courses.data.find((item) => item.code === 'CS 501');

    const posted = await api(`/faculty/courses/${course.id}/announcements`, {
      method: 'POST',
      token: facultyToken,
      body: { title: 'Test suite announcement', content: 'Posted by the test suite.', tags: ['Test'] },
    });
    assert.equal(posted.status, 201);

    const { body: announcements } = await api('/announcements', { token: studentToken });
    assert.ok(announcements.data.some((item) => item.title === 'Test suite announcement'));
  });

  it('refuses a roster for a course the faculty member does not teach', async () => {
    const facultyToken = await login('faculty');
    const adminToken = await login('admin');

    // Find a course this faculty member is not the instructor of record for.
    const { body: mine } = await api('/faculty/courses', { token: facultyToken });
    const taught = new Set(mine.data.map((course) => course.id));
    const { body: studentCourses } = await api('/courses', { token: await login('student') });
    const other = studentCourses.data.find((course) => !taught.has(course.id));
    assert.ok(other, 'there is a course taught by someone else');

    const { status, body } = await api(`/faculty/courses/${other.id}/students`, { token: facultyToken });
    assert.equal(status, 403);
    assert.equal(body.error.code, 'FORBIDDEN');

    // An admin may still inspect it, for support purposes.
    const asAdmin = await api(`/faculty/courses/${other.id}/students`, { token: adminToken });
    assert.equal(asAdmin.status, 200);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nextCommitment, studyingSnapshot, teachingSnapshot, todayCommitments, upcomingItems, weeklyMeetings } from '../src/pages/dashboard/overviewData.js';

/** The multi-role Overview: real values per context, each item labelled, nothing invented. */
const ok = (data) => ({ state: 'OK', data });
const studentOverview = {
  state: 'OK',
  identity: { institutionalId: 'S2600187' },
  profile: ok({ program: { credential: 'MS', name: 'Computer Science' }, standing: 'good' }),
  academic: ok({ gpa: null, creditsEarned: 0, creditsInProgress: 6, standing: 'good' }),
  schedule: ok({ term: { name: 'Fall 2026' }, items: [{ courseCode: 'CS 650', sectionCode: '01', courseTitle: 'Deep Learning', meetings: [{ day: 'TUE', start: '14:00', end: '15:15', location: 'Turing Hall 340' }] }] }),
  registrations: ok([{ status: 'enrolled', section: { courseCode: 'CS 310', sectionNumber: '01', termCode: '2027SP' } }, { status: 'dropped', section: { courseCode: 'CS 999' } }]),
};
const teaching = {
  state: 'OK',
  identity: { institutionalId: 'F01024' },
  schedule: ok({ term: { name: 'Fall 2026' }, items: [{ courseCode: 'CS 101', sectionCode: 'D1', courseTitle: 'Introduction to Programming', meetings: [{ day: 'TUE', start: '09:00', end: '10:15' }] }] }),
  sections: ok([{ courseCode: 'CS 101', sectionCode: 'D1', seats: { enrolled: 12, capacity: 25 } }]),
};
const tuesday = new Date(2026, 9, 27, 8, 0); // Tue 08:00
const friday = new Date(2026, 9, 23, 12, 0);

describe('Overview data', () => {
  it('today lists classes taken and taught, each labelled with its own context, in time order', () => {
    const meetings = weeklyMeetings({ studentOverview, teaching });
    const today = todayCommitments(meetings, tuesday);
    assert.deepEqual(today.map((m) => `${m.start} ${m.code} ${m.context}`), ['09:00 CS 101-D1 faculty', '14:00 CS 650-01 student']);
  });

  it('with nothing today, the next commitment is named (never a made-up one)', () => {
    const meetings = weeklyMeetings({ studentOverview, teaching });
    assert.deepEqual(todayCommitments(meetings, friday), []);
    const next = nextCommitment(meetings, friday);
    assert.equal(next.code, 'CS 101-D1');
    assert.equal(next.dayName, 'Tuesday');
    assert.equal(nextCommitment([], friday), null);
  });

  it('a context the account does not have contributes nothing', () => {
    assert.deepEqual(weeklyMeetings({ studentOverview, teaching: null }).map((m) => m.context), ['student']);
    assert.deepEqual(weeklyMeetings({ studentOverview: { state: 'NOT_A_STUDENT' }, teaching }).map((m) => m.context), ['faculty']);
  });

  it('coming up: calendar and the student’s own Moodle due dates, sorted, past dropped', () => {
    const items = upcomingItems({
      today: '2026-10-23',
      calendar: [{ id: 'a', title: 'Career Fair', startDate: '2026-10-28', category: 'EVENT' }, { id: 'b', title: 'Old', startDate: '2026-10-01' }, { id: 'c', title: 'Withdraw', startDate: '2026-10-30', category: 'DEADLINE' }],
      studentAssignments: [{ assignmentId: 7, name: 'ER design', dueDate: '2026-10-25T12:00:00', course: { shortName: 'ADBMS' } }, { assignmentId: 8, name: 'No due date' }],
    });
    assert.deepEqual(items.map((i) => `${i.date} ${i.title} ${i.context ?? '-'}`), ['2026-10-25 ER design student', '2026-10-28 Career Fair -', '2026-10-30 Withdraw -']);
    assert.equal(items[0].source, 'Moodle · ADBMS');
    assert.equal(items[2].important, true);
  });

  it('studying snapshot reads the student record; a missing GPA stays missing', () => {
    const s = studyingSnapshot(studentOverview, { status: 'CONNECTED', courses: [{}] });
    assert.equal(s.program, 'MS Computer Science');
    assert.equal(s.gpa, null);
    assert.equal(s.creditsInProgress, 6);
    assert.equal(s.moodleCourses, 1);
    assert.deepEqual(s.registrations.map((r) => r.code), ['CS 310-01'], 'only enrolled registrations');
    assert.equal(studyingSnapshot(studentOverview, { status: 'NOT_LINKED' }).moodleCourses, null, 'no Moodle link is not "0 courses"');
    assert.deepEqual(studyingSnapshot({ state: 'UNAVAILABLE', message: 'down' }), { state: 'UNAVAILABLE', message: 'down' });
  });

  it('teaching snapshot reads the faculty record and the courses taught in Moodle', () => {
    const t = teachingSnapshot(teaching, { status: 'CONNECTED', courses: [{ fullName: 'Introduction to Programming', enrolledUserCount: 5 }] });
    assert.equal(t.employeeNumber, 'F01024');
    assert.equal(t.enrolled, 12);
    assert.equal(t.capacity, 25);
    assert.deepEqual(t.moodleCourses.map((c) => c.name), ['Introduction to Programming']);
    assert.equal(teachingSnapshot({ ...teaching, sections: ok([]) }).enrolled, null, 'no sections: no enrolment figure');
  });

  it('the Overview requests a context’s data only when the account has that context', () => {
    const src = readFileSync(new URL('../src/pages/dashboard/OverviewDashboard.jsx', import.meta.url), 'utf8');
    assert.match(src, /useApiQuery\(\(\) => sisApi\.myOverview\(\), \[\], \{ enabled: isStudent \}\)/);
    assert.match(src, /useApiQuery\(\(\) => lmsApi\.myMoodleAssignments\(\), \[\], \{ enabled: isStudent \}\)/);
    assert.match(src, /useApiQuery\(\(\) => sisApi\.facultyTeaching\(\), \[\], \{ enabled: isFaculty \}\)/);
    assert.match(src, /useApiQuery\(\(\) => facultyMoodleApi\.courses\(\), \[\], \{ enabled: isFaculty \}\)/);
  });
});

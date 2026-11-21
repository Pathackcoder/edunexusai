import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ANNOUNCEMENT_LIMITS, announcementView, composerSections, ownerText, sectionLabel, teachingNotice } from '../src/pages/faculty/teachingState.js';

/**
 * Faculty teaching views (Phase 1 of one announcement owner per section): official sections come from CampusCore,
 * every empty or failed state says why, and no screen offers an action that would publish where students never read.
 */
const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

describe('teaching states never pass an outage or a missing link off as "you teach nothing"', () => {
  it('OK has no notice; every other state explains itself', () => {
    assert.equal(teachingNotice('OK'), null);
    assert.equal(teachingNotice('UNMAPPED').severity, 'info');
    assert.match(teachingNotice('UNMAPPED').text, /not linked/);
    assert.equal(teachingNotice('UNMAPPED', 'Ask the registrar.').text, 'Ask the registrar.');
    assert.match(teachingNotice('NOT_FACULTY').text, /not a faculty record/);
    assert.match(teachingNotice('SIS_NOT_CONFIGURED').text, /not connected/);
    for (const state of ['UNAVAILABLE', 'SOMETHING_NEW']) {
      assert.equal(teachingNotice(state).severity, 'warning');
      assert.match(teachingNotice(state).text, /unavailable/);
    }
  });

  it('names the owner of each section’s announcements', () => {
    assert.equal(ownerText({ announcementOwner: 'CAMPUSCORE', moodleCourse: null }), 'Announcements: CampusCore');
    assert.equal(ownerText({ announcementOwner: 'MOODLE', moodleCourse: { moodleCourseId: 10, shortName: 'ItP' } }), 'Announcements: Moodle (ItP)');
    assert.equal(ownerText({ announcementOwner: 'MOODLE', moodleCourse: { moodleCourseId: 10, shortName: null } }), 'Announcements: Moodle (course 10)');
    assert.equal(sectionLabel({ courseCode: 'CS 101', sectionCode: '01' }), 'CS 101-01');
  });

  it('shows a CampusCore announcement with its section, term, state and source', () => {
    const view = announcementView({ id: 'a1', source: 'campuscore', title: 'Lab', content: 'Bring a laptop', author: 'Marcus Whitfield', pinned: true, status: 'SCHEDULED', publishedAt: '2026-11-09T12:00:00Z', section: { label: 'CS 101-01', termCode: '2026FA' }, sectionOwner: 'MOODLE' });
    assert.deepEqual([view.label, view.term, view.badges, view.sourceLabel, view.movedToMoodle], ['CS 101-01', '2026FA', ['Pinned', 'Scheduled'], 'CampusCore', true]);
    const published = announcementView({ id: 'a2', source: 'campuscore', pinned: false, status: 'PUBLISHED', section: { label: 'CS 310-01', termCode: '2027SP' }, sectionOwner: 'CAMPUSCORE' });
    assert.deepEqual([published.badges, published.movedToMoodle], [[], false]);
    const local = announcementView({ id: 'l1', source: 'local', courseCode: 'CS 501', tags: ['Exam'], postedAt: '2026-11-01T00:00:00Z' });
    assert.deepEqual([local.label, local.badges, local.sourceLabel], ['CS 501', ['Exam'], 'Local demo course']);
  });
});

describe('My Courses shows CampusCore sections whatever the local demo records hold', () => {
  const page = read('pages/faculty/FacultyCoursesPage.jsx');

  it('renders the CampusCore panel outside any empty state (regression: "No assigned courses" hid it)', () => {
    assert.doesNotMatch(page, /isEmpty=/, 'no page-wide empty state that could replace the official sections');
    assert.doesNotMatch(page, /No assigned courses/);
    assert.match(page, /<SisTeachingPanel \/>\s*<LocalDemoCourses \/>/, 'official sections first, demo records after');
    assert.match(page, /if \(courses\.length === 0\) return null;/, 'no demo section at all when there are no demo records');
    assert.match(page, /Demo courses \(local EduNexusAI records\)/);
  });

  it('the panel reads /faculty/sections and states each section’s announcement owner', () => {
    const panel = read('components/sis/SisTeachingPanel.jsx');
    assert.match(panel, /facultyApi\.getSections\(\)/);
    assert.match(panel, /teachingNotice\(data\.state, data\.message\)/);
    assert.match(panel, /ownerText\(s\)/);
    assert.match(read('services/api/facultyApi.js'), /getSections: \(\) => apiClient\.get\('\/faculty\/sections'\)/);
  });
});

describe('no dead-end announcement publishing', () => {
  it('the local course page no longer offers "Post announcement", and the API client cannot post one', () => {
    const detail = read('pages/faculty/FacultyCourseDetailPage.jsx');
    assert.doesNotMatch(detail, /postAnnouncement|Post announcement|isAnnounceOpen/);
    assert.match(detail, /local EduNexusAI demo course, not a CampusCore section/);
    assert.doesNotMatch(read('services/api/facultyApi.js'), /postAnnouncement/);
  });

  it('My Announcements shows each source’s state: CampusCore failure and Moodle not connected are said, not hidden', () => {
    const page = read('pages/faculty/FacultyAnnouncementsPage.jsx');
    assert.match(page, /facultyApi\.getAnnouncements\(\)/);
    assert.match(page, /This is not an empty list\./);
    assert.match(page, /\['NOT_CONNECTED', 'UNAVAILABLE'\]\.includes\(sources\.moodle\?\.state\) && <MoodleNotice/);
    assert.match(page, /!notice && !campuscoreDown && items\.length === 0/, 'the empty state only when every source answered');
    assert.doesNotMatch(page, /Open a course and use “Post announcement”/);
  });
});

describe('faculty dashboard follows the SIS relationships', () => {
  const dashboard = read('pages/faculty/FacultyDashboardPage.jsx');

  it('links CampusCore sections to My Courses and never to a local course page', () => {
    assert.match(dashboard, /const courseLink = \(course\) => course\.href \?\? `\/faculty\/courses\/\$\{course\.id\}`;/);
    assert.doesNotMatch(dashboard, /to=\{`\/faculty\/courses\/\$\{course\.id\}`\}/);
    const widgets = read('components/faculty/FacultyWorkspaceWidgets.jsx');
    assert.doesNotMatch(widgets, /to=\{`\/faculty\/courses\/\$\{course\.id\}`\}/);
  });

  it('explains missing teaching data and points coursework to Moodle Teaching', () => {
    assert.match(dashboard, /teachingNotice\(sources\.courses\.state, sources\.courses\.message\)/);
    assert.match(dashboard, /title="Coursework is in Moodle"/);
    assert.match(dashboard, /Sections delivered in Moodle have their announcements in Moodle/);
  });

  it('follow-ups keep using local course ids', () => {
    assert.match(dashboard, /<FollowUpsWidget courses=\{data\?\.localCourses \?\? courses\} \/>/);
  });
});

describe('Phase 2: composing a class announcement for a CampusCore-owned section', () => {
  const section = (id, allowed, reason = null) => ({ source: { id }, courseCode: 'CS 101', sectionCode: id, courseTitle: 'Intro', termCode: '2026FA', publish: { allowed, reason } });

  it('offers only the sections the server allows, and keeps the reason for the rest', () => {
    const { postable, blocked } = composerSections({ state: 'OK', sections: [section('01', true), section('02', false, 'Publishing to Moodle from EduNexusAI is not available yet.'), { ...section('03', true), publish: undefined }] });
    assert.deepEqual(postable.map((s) => s.source.id), ['01']);
    assert.deepEqual(blocked.map((b) => [b.section.source.id, b.reason]), [['02', 'Publishing to Moodle from EduNexusAI is not available yet.'], ['03', 'Publishing is not available for this section.']]);
    assert.deepEqual(composerSections({ state: 'UNMAPPED', sections: [] }), { postable: [], blocked: [] });
    assert.deepEqual(composerSections(null), { postable: [], blocked: [] });
    assert.deepEqual(ANNOUNCEMENT_LIMITS, { title: 150, body: 5000 }, 'as CampusCore');
  });

  it('the composer publishes through the API with a fresh idempotency key per content, read-only under View-As', () => {
    const composer = read('components/faculty/AnnouncementComposer.jsx');
    assert.match(composer, /facultyApi\.publishAnnouncement\(target\.source\.id, \{ title: form\.title, body: form\.body, pinned: form\.pinned, idempotencyKey: key \}\)/);
    assert.match(composer, /const change = \(patch\) => \{\s*setForm\(\(current\) => \(\{ \.\.\.current, \.\.\.patch \}\)\);\s*setKey\(crypto\.randomUUID\(\)\);/, 'new content, new key; a plain retry keeps it');
    assert.match(composer, /const target = postable\.find/, 'only a postable section can be submitted');
    assert.match(composer, /<MenuItem key=\{section\.source\.id\} value=\{section\.source\.id\} disabled>/, 'blocked sections are shown, not selectable');
    assert.match(composer, /disabled=\{!target\} mutates/);
    assert.match(composer, /<ReadOnlyNotice \/>/);
    assert.doesNotMatch(composer, /Editing and deleting are done in CampusCore/, 'no promise the faculty portal cannot keep');
    assert.match(read('services/api/facultyApi.js'), /publishAnnouncement: \(sectionId, payload\) =>\s*apiClient\.post\(`\/faculty\/sections\/\$\{encodeURIComponent\(sectionId\)\}\/announcements`, payload\)/);
  });

  it('entry points appear only where publishing is allowed, and say why when it is not', () => {
    const page = read('pages/faculty/FacultyAnnouncementsPage.jsx');
    assert.match(page, /actions=\{postable\.length > 0 \? \(/);
    assert.match(page, /onPublished=\{refetch\}/, 'the list shows the new announcement');
    assert.match(page, /Publishing class announcements from EduNexusAI is not available: \{data\.publishing\.campuscore\.reason\}/);
    const panel = read('components/sis/SisTeachingPanel.jsx');
    assert.match(panel, /\{s\.publish\?\.allowed && <Button variant="ghost" size="sm" onClick=\{\(\) => setComposeFor\(s\.source\.id\)\} mutates>Post announcement<\/Button>\}/);
  });
});

describe('Phase 3: Moodle course announcements', () => {
  it('shows a Moodle announcement with its section, Moodle as the source and a link to it', () => {
    const view = announcementView({ id: 'moodle:901', source: 'moodle', title: 'Lab', content: 'Text. Posted by Marcus Whitfield via EduNexusAI.', author: 'EduNexus Integration', pinned: false, status: 'PUBLISHED', publishedAt: '2026-11-20T10:00:00Z', section: { label: 'CS 310-01', termCode: '2027SP' }, url: 'https://moodle.example/mod/forum/discuss.php?d=901' });
    assert.deepEqual([view.label, view.term, view.sourceLabel, view.author, view.url, view.movedToMoodle], ['CS 310-01', '2027SP', 'Moodle', 'EduNexus Integration', 'https://moodle.example/mod/forum/discuss.php?d=901', false]);
  });

  it('the composer is honest about Moodle: the integration account is the author, delivery and edits stay in Moodle', () => {
    const composer = read('components/faculty/AnnouncementComposer.jsx');
    assert.match(composer, /target\.announcementOwner === 'MOODLE' && \(/);
    assert.match(composer, /Moodle will\s+show the author as <strong>\{data\?\.publishing\?\.moodle\?\.postsAs/);
    assert.match(composer, /To edit or delete it, use the\s+Moodle course\./);
    assert.match(composer, /published to \$\{sectionLabel\(target\)\} in \$\{OWNER_LABEL\[target\.announcementOwner\]/);
    assert.match(composer, /const target = postable\.find/, 'still only sections the server allows');
  });

  it('My Announcements explains why Moodle announcements cannot be read and links Moodle items', () => {
    const page = read('pages/faculty/FacultyAnnouncementsPage.jsx');
    assert.match(page, /\['NOT_CONNECTED', 'UNAVAILABLE'\]\.includes\(sources\.moodle\?\.state\) && <MoodleNotice/);
    assert.match(page, /\{moodle\.reason && /);
    assert.match(page, /Open in Moodle/);
  });

  it('students never try to store a local read mark for CampusCore or Moodle announcements', () => {
    const page = read('pages/academics/AnnouncementsPage.jsx');
    assert.match(page, /const hasLocalReadState = \(a\) => a && a\.source !== 'campuscore' && a\.source !== 'moodle';/);
    assert.match(page, /if \(!hasLocalReadState\(announcements\.find\(\(a\) => a\.id === id\)\)\) return;/);
    assert.match(page, /announcements\.filter\(\(a\) => !a\.isRead && hasLocalReadState\(a\)\)/);
    assert.match(read('pages/dashboard/StudentDashboard.jsx'), /if \(item\?\.source === 'campuscore' \|\| item\?\.source === 'moodle'\) return;/);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * SIS-owned data (institutional ID, program, standing, GPA, credits, current term, schedule,
 * academic calendar) must come from CampusCore through /sis/*. These checks fail if a migrated
 * page goes back to the deprecated local fields or endpoints.
 */
const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

const DEPRECATED_SESSION_FIELDS = /\b(?:user|profile)\??\.(?:studentNumber|degree|academicStanding|currentTerm|admitTerm|cumulativeGpa|majorGpa|semesterGpa|creditsCompleted|totalCreditsRequired|honors)\b/;

const MIGRATED = {
  'layouts/Header.jsx': [/useSisProfile/],
  'pages/ProfilePage.jsx': [/useSisProfile/],
  'pages/profile/PersonalInfoPage.jsx': [/useSisProfile/],
  'pages/AcademicsPage.jsx': [/sisApi\.myOverview/],
  'pages/dashboard/StudentDashboard.jsx': [/sisApi\.myOverview/],
  'pages/academics/InsightsPage.jsx': [/sisApi\.myOverview/],
  'pages/academics/GradesGpaPage.jsx': [/sisApi\.myOverview/],
  'pages/academics/CourseSchedulePage.jsx': [/sisApi\.myOverview/],
  'pages/academics/DegreeProgressPage.jsx': [/sisApi\.myOverview/],
  'pages/academics/CalendarPage.jsx': [/sisApi\.calendar/],
  'pages/faculty/FacultySchedulePage.jsx': [/sisApi\.facultyTeaching/],
  'components/transcripts/OfficialTranscriptRequestModal.jsx': [/useSisProfile/],
};

describe('SIS-owned pages read CampusCore', () => {
  for (const [file, required] of Object.entries(MIGRATED)) {
    it(`${file} uses the live SIS source and no deprecated local academic field`, () => {
      const source = read(file);
      for (const pattern of required) assert.match(source, pattern);
      const hit = source.match(DEPRECATED_SESSION_FIELDS);
      assert.equal(hit, null, `reads deprecated local field ${hit?.[0]}`);
    });
  }

  it('no migrated page calls the local grades, transcript-history, calendar, insights or faculty-schedule endpoints', () => {
    const local = /academicApi\.(?:getGrades|getTranscript|getCalendar|getSchedule)\b|planningApi\.(?:insights|degreeProgress)\b|facultyApi\.getSchedule\b/;
    for (const file of Object.keys(MIGRATED)) assert.equal(read(file).match(local), null, file);
  });

  it('caches the SIS profile per signed-in user and clears it when the session changes', () => {
    const hook = read('hooks/useSisProfile.js');
    assert.match(hook, /cache\.get\(userId\)/);
    const auth = read('context/AuthContext.jsx');
    assert.equal((auth.match(/clearSisProfile\(\)/g) ?? []).length >= 3, true, 'cleared on login, logout and session expiry');
  });
});

describe('Timetable', () => {
  it('uses the real weekday, supports weekend meetings, and is not limited to the current term', () => {
    const grid = read('components/schedule/TimetableGrid.jsx');
    assert.doesNotMatch(grid, /isToday = day\.name === 'Monday'/, 'no hardcoded "today"');
    assert.match(grid, /Saturday/);
    assert.match(grid, /showToday/);
    const page = read('pages/academics/CourseSchedulePage.jsx');
    assert.match(page, /sisApi\.myOverview\(termId/);
    assert.match(page, /classTermIds/);
    assert.match(read('components/sis/sisData.js'), /SAT: 'Saturday'/);
  });
});

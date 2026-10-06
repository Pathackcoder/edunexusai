import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mockUniversityMapper } from '../src/integrations/mappers/mockUniversityMapper.js';
import { canvasMapper } from '../src/integrations/mappers/canvasMapper.js';
import { parseNextLink } from '../src/integrations/connectors/CanvasConnector.js';

/**
 * The canonical mappers are the boundary that keeps provider vocabulary out of the
 * product, so they are tested directly as well as through the API.
 */
describe('mock SIS canonical mapper', () => {
  const sisCourse = {
    sis_course_id: 'SIS-CRS-1000',
    subject_code: 'CS',
    catalog_number: '501',
    course_title: 'Advanced Database Systems',
    credit_hours: 4,
    term_code: 'FALL2026',
    catalog_description: 'Query processing and storage engines.',
    meeting_pattern: {
      meeting_days: ['M', 'W'],
      meeting_days_long: ['Monday', 'Wednesday'],
      begin_time: '10:00',
      end_time: '11:30',
      time_display: '10:00 AM - 11:30 AM',
      building_room: 'Science Building 204',
    },
    instructor_of_record: {
      display_name: 'Dr. Sarah Mitchell',
      institution_email: 's.mitchell@demouniversity.edu',
      scheduled_office_hours: 'Wed 2:00 PM - 4:00 PM',
    },
    publication_attributes: { accent_color: '#2563eb' },
  };

  it('builds the course code from the subject and catalogue number', () => {
    const mapped = mockUniversityMapper.mapCourse(sisCourse);
    assert.equal(mapped.code, 'CS 501');
    assert.equal(mapped.name, 'Advanced Database Systems');
    assert.equal(mapped.credits, 4);
    assert.equal(mapped.room, 'Science Building 204');
    assert.deepEqual(mapped.meetingDays, ['Monday', 'Wednesday']);
    assert.equal(mapped.instructorName, 'Dr. Sarah Mitchell');
    assert.equal(mapped.sourceSystem, 'MOCK_UNIVERSITY');
    assert.equal(mapped.externalId, 'SIS-CRS-1000');
  });

  it('leaves no provider field name on the canonical object', () => {
    const mapped = mockUniversityMapper.mapCourse(sisCourse);
    for (const field of ['sis_course_id', 'subject_code', 'catalog_number', 'credit_hours', 'meeting_pattern']) {
      assert.ok(!Object.hasOwn(mapped, field), `${field} must not survive mapping`);
    }
  });

  it('turns a grade component key into a readable label', () => {
    const mapped = mockUniversityMapper.mapEnrollment({
      sis_registration_id: 'SIS-REG-1',
      sis_course_id: 'SIS-CRS-1000',
      sis_student_id: '0098421',
      registration_status_desc: 'Registered',
      current_grade_code: 'A',
      current_percent_score: 95.2,
      quality_points: 4,
      grade_components: [{ component_key: 'projectMilestones', component_score: '91%', display_sequence: 0 }],
    });
    assert.equal(mapped.letterGrade, 'A');
    assert.equal(mapped.gradeComponents[0].label, 'Project Milestones');
    assert.equal(mapped.gradeComponents[0].displayKey, 'projectMilestones');
  });

  it('maps a financial aid package', () => {
    const mapped = mockUniversityMapper.mapFinancialAid({
      sis_student_id: '0098421',
      aid_year: '2026-2027',
      packaging_status_desc: 'Approved',
      application_status_desc: 'Complete',
      total_offered_amount: 7220,
      total_disbursed_amount: 3610,
      total_scheduled_amount: 3610,
      fund_awards: [{ fund_code: 'AID-1', fund_title: 'Merit Scholarship', fund_type_desc: 'Scholarship', offered_amount: 3500 }],
      disbursement_schedule: [],
      tracking_requirements: [],
    });
    assert.equal(mapped.totalAwarded, 7220);
    assert.equal(mapped.awards[0].name, 'Merit Scholarship');
    assert.equal(mapped.awards[0].amount, 3500);
  });
});

describe('Canvas canonical mapper', () => {
  it('maps a Canvas course onto the same canonical shape', () => {
    const mapped = canvasMapper.mapCourse({
      id: 1100,
      course_code: 'CS 501',
      name: 'Advanced Database Systems',
      workflow_state: 'available',
      total_students: 12,
      teachers: [{ display_name: 'Dr. Sarah Mitchell' }],
    });
    assert.equal(mapped.code, 'CS 501');
    assert.equal(mapped.externalId, '1100');
    assert.equal(mapped.sourceSystem, 'CANVAS');
    // Canvas does not publish credit hours; the field is null rather than invented.
    assert.equal(mapped.credits, null);
  });

  it('strips HTML out of a Canvas assignment description', () => {
    assert.equal(canvasMapper.stripHtml('<p>Design a <b>3NF</b> schema.</p>'), 'Design a 3NF schema.');
    assert.equal(canvasMapper.stripHtml(''), null);
  });

  it('reads the next page from a Canvas Link header', () => {
    const header = '<https://canvas.example.edu/api/v1/courses?page=1>; rel="current",<https://canvas.example.edu/api/v1/courses?page=2>; rel="next"';
    assert.equal(parseNextLink(header), 'https://canvas.example.edu/api/v1/courses?page=2');
    assert.equal(parseNextLink(null), null);
    assert.equal(parseNextLink('<https://x/?page=1>; rel="current"'), null);
  });
});

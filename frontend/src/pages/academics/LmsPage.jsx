import React from 'react';
import Box from '@mui/material/Box';
import { PageHeader } from '../../components/common/PageHeader';
import { MoodleCoursesPanel } from '../../components/lms/MoodleCoursesPanel';

/**
 * Learning Management System: live Moodle data only.
 *
 * Every course here comes from Moodle for the signed-in student's verified Moodle
 * account. Registered courses from the academic record (SIS) live on Course Schedule and
 * are never shown here as LMS courses, and there is no fallback to them when Moodle is
 * empty or unavailable.
 */
export const LmsPage = () => (
  <Box>
    <PageHeader
      title="Learning Management System (LMS)"
      description="Your Moodle courses, activities and released grades, read live from Moodle, with links that open each course in Moodle."
    />
    <MoodleCoursesPanel />
  </Box>
);

export default LmsPage;

import React, { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { WidgetCard } from '../common/WidgetCard';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { adminOpsApi } from '../../services/api';

export const AdminAudienceSegmentationWidget = ({ onSelectSegment }) => {
  // Each segment maps to an audience the API resolves against real users; counts are live.
  const segments = [
    { id: 'ALL_STUDENTS', name: 'All enrolled students', detail: 'Standard & Advanced tiers', icon: SchoolOutlinedIcon, tone: 'primary', badge: 'Students', audience: { audienceType: 'ALL_STUDENTS' }, prefill: { audience: 'ALL_STUDENTS' } },
    { id: 'PROGRAM', name: 'Data Science students', detail: 'Program: M.S. in Data Science', icon: ScienceOutlinedIcon, tone: 'purple', badge: 'Program', audience: { audienceType: 'PROGRAM', audienceValue: 'Data Science' }, prefill: { audience: 'PROGRAM', program: 'Data Science' } },
    { id: 'ALL_FACULTY', name: 'Teaching faculty', detail: 'Professors, adjuncts & lecturers', icon: AdminPanelSettingsOutlinedIcon, tone: 'warning', badge: 'All depts', audience: { audienceType: 'ALL_FACULTY' }, prefill: { audience: 'ALL_FACULTY' } },
    { id: 'DEPARTMENT', name: 'Computer Science & Eng', detail: 'Students and faculty in the department', icon: ScienceOutlinedIcon, tone: 'info', badge: 'Department', audience: { audienceType: 'DEPARTMENT', audienceValue: 'Computer Science' }, prefill: { audience: 'DEPARTMENT', department: 'Computer Science' } },
    { id: 'COURSE', name: 'CS 501 roster', detail: 'Advanced Database Systems', icon: BusinessOutlinedIcon, tone: 'success', badge: 'Course', audience: { audienceType: 'COURSE', audienceValue: 'CS 501' }, prefill: { audience: 'COURSE' } },
    { id: 'STATUS', name: 'Academic intervention', detail: 'Students with an open follow-up flag', icon: WarningAmberOutlinedIcon, tone: 'error', badge: 'Action needed', audience: { audienceType: 'STATUS', audienceValue: 'Follow-up required' }, prefill: { audience: 'STATUS' } },
  ];
  const [counts, setCounts] = useState({});
  useEffect(() => {
    let active = true;
    Promise.all(segments.map((seg) => adminOpsApi.previewAudience(seg.audience).then((result) => [seg.id, result.recipients]).catch(() => [seg.id, null]))).then((rows) => {
      if (active) setCounts(Object.fromEntries(rows));
    });
    return () => {
      active = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <WidgetCard
      title="Audience Segmentation & Targeting"
      subtitle="Live audience sizes · select a group to prefill the communication composer"
      icon={PeopleAltOutlinedIcon}
      tone="primary"
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, gap: 1.5 }}>
        {segments.map((seg) => {
          const Icon = seg.icon;
          return (
            <Box
              key={seg.id}
              sx={{
                p: 2,
                borderRadius: 2.5,
                border: 1,
                borderColor: 'divider',
                bgcolor: 'background.subtle',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'transform 200ms ease, border-color 200ms ease, box-shadow 200ms ease',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  borderColor: 'primary.light',
                  boxShadow: 2,
                },
              }}
            >
              <Box>
                <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mb: 1 }}>
                  <Icon sx={{ fontSize: 20, color: 'text.secondary' }} />
                  <Badge variant={seg.tone}>{seg.badge}</Badge>
                </Stack>
                <Typography variant="h6" component="h3" sx={{ fontWeight: 700, fontSize: '1.25rem', lineHeight: 1.2 }}>
                  {counts[seg.id] ?? '…'}
                </Typography>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mt: 0.25 }}>
                  {seg.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {seg.detail}
                </Typography>
              </Box>

              <Button
                size="sm"
                variant="outline"
                endIcon={<ArrowForwardRoundedIcon />}
                onClick={() => onSelectSegment && onSelectSegment(seg.prefill)}
                sx={{ mt: 2, alignSelf: 'flex-start', minHeight: 28, fontSize: '0.75rem', px: 1 }}
              >
                Target Group
              </Button>
            </Box>
          );
        })}
      </Box>
    </WidgetCard>
  );
};

export default AdminAudienceSegmentationWidget;

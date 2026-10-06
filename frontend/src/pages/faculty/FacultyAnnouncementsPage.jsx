import React from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import { useApiQuery } from '../../hooks/useApiQuery';
import { facultyApi } from '../../services/api';
import { Badge } from '../../components/common/Badge';
import { IconTile } from '../../components/common/IconTile';
import { PageHeader } from '../../components/common/PageHeader';
import { DataState } from '../../components/common/DataState';

/** Announcements this faculty member has authored. */
export const FacultyAnnouncementsPage = () => {
  const { data, loading, error, refetch } = useApiQuery(() => facultyApi.getAnnouncements());
  const announcements = data ?? [];

  return (
    <DataState
      loading={loading}
      error={error}
      onRetry={refetch}
      loadingLabel="Loading your announcements…"
      isEmpty={announcements.length === 0}
      emptyTitle="No announcements yet"
      emptyMessage="Open a course and use “Post announcement” to publish one to your class."
    >
      {() => (
        <Box>
          <PageHeader
            title="My Announcements"
            description="Everything you have posted to your sections, most recent first."
          />

          <Stack spacing={1.5}>
            {announcements.map((announcement) => (
              <Card key={announcement.id} sx={{ p: { xs: 2, sm: 2.5 } }}>
                <Stack direction="row" spacing={2} alignItems="flex-start">
                  <IconTile icon={CampaignOutlinedIcon} tone="warning" size={38} sx={{ display: { xs: 'none', sm: 'inline-flex' } }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" alignItems="center" useFlexGap flexWrap="wrap" spacing={1}>
                      <Typography variant="subtitle2" color="primary.main">{announcement.courseCode ?? 'Institution'}</Typography>
                      {(announcement.tags ?? []).map((tag) => (
                        <Badge key={tag} variant="neutral">{tag}</Badge>
                      ))}
                      <Typography variant="caption" sx={{ ml: 'auto !important' }}>
                        {new Date(announcement.postedAt).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </Typography>
                    </Stack>
                    <Typography variant="h6" component="h3" sx={{ mt: 0.75 }}>{announcement.title}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{announcement.content}</Typography>
                  </Box>
                </Stack>
              </Card>
            ))}
          </Stack>
        </Box>
      )}
    </DataState>
  );
};

export default FacultyAnnouncementsPage;

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import MuiButton from '@mui/material/Button';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import { useApiQuery } from '../../hooks/useApiQuery';
import { facultyApi } from '../../services/api';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { IconTile } from '../../components/common/IconTile';
import { PageHeader } from '../../components/common/PageHeader';
import { DataState } from '../../components/common/DataState';
import { EmptyState } from '../../components/common/EmptyState';
import { AnnouncementComposer } from '../../components/faculty/AnnouncementComposer';
import { announcementView, composerSections, teachingNotice } from './teachingState';

/** Sections whose announcements live in Moodle that cannot be read right now: said plainly, why, and a way there. */
function MoodleNotice({ moodle }) {
  return (
    <Alert severity={moodle.state === 'UNAVAILABLE' ? 'warning' : 'info'}>
      <Typography variant="body2">{moodle.message}</Typography>
      {moodle.reason && <Typography variant="caption" component="p" sx={{ mt: 0.5 }}>{moodle.reason}</Typography>}
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
        {moodle.sections.map((s) => (s.moodleCourse?.url ? (
          <MuiButton key={s.sisSectionId} size="small" variant="outlined" href={s.moodleCourse.url} target="_blank" rel="noopener noreferrer">
            {s.label} ({s.termCode}) in Moodle
          </MuiButton>
        ) : (
          <Badge key={s.sisSectionId} variant="neutral">{s.label} ({s.termCode}) · Moodle course {s.moodleCourse?.moodleCourseId}</Badge>
        )))}
      </Stack>
    </Alert>
  );
}

/**
 * Class announcements on the sections this faculty member teaches, read from the system that owns each section:
 * CampusCore class announcements now; sections delivered in Moodle are listed with a link, since Moodle
 * announcements cannot be read yet. Each source shows its own state, so an outage is never "no announcements".
 * "New announcement" publishes to a CampusCore-owned section, in CampusCore, as the faculty member.
 */
export const FacultyAnnouncementsPage = () => {
  const navigate = useNavigate();
  const { data, loading, error, refetch } = useApiQuery(() => facultyApi.getAnnouncements());
  const notice = data && data.state !== 'SIS_NOT_CONFIGURED' ? teachingNotice(data.state, data.message) : null;
  const sources = data?.sources ?? {};
  const items = (data?.items ?? []).map(announcementView);
  const campuscoreDown = sources.campuscore && sources.campuscore.state !== 'OK';
  const { postable } = composerSections(data);
  const publishingOff = data?.publishing?.campuscore && !data.publishing.campuscore.enabled;
  const [composerOpen, setComposerOpen] = useState(false);

  return (
    <DataState loading={loading} error={error} onRetry={refetch} loadingLabel="Loading your announcements…">
      {() => (
        <Box>
          <PageHeader
            title="My Announcements"
            description="Class announcements on the sections you teach, read from the system that owns each section. Most recent first."
            actions={postable.length > 0 ? (
              <Button variant="primary" size="sm" icon={CampaignOutlinedIcon} onClick={() => setComposerOpen(true)} mutates>
                New announcement
              </Button>
            ) : null}
          />
          <AnnouncementComposer open={composerOpen} onClose={() => setComposerOpen(false)} data={data} onPublished={refetch} />

          <Stack spacing={1.5}>
            {notice && (
              <Alert severity={notice.severity} action={notice.severity === 'warning' ? <Button variant="ghost" size="sm" onClick={refetch}>Try again</Button> : null}>
                {notice.text}
              </Alert>
            )}
            {campuscoreDown && (
              <Alert severity="warning" action={<Button variant="ghost" size="sm" onClick={refetch}>Try again</Button>}>
                CampusCore class announcements could not be loaded{sources.campuscore.message ? ` (${sources.campuscore.message})` : ''}. This is not an empty list.
              </Alert>
            )}
            {publishingOff && (
              <Alert severity="info">Publishing class announcements from EduNexusAI is not available: {data.publishing.campuscore.reason}</Alert>
            )}
            {['NOT_CONNECTED', 'UNAVAILABLE'].includes(sources.moodle?.state) && <MoodleNotice moodle={sources.moodle} />}
            {(sources.moodle?.warnings ?? []).map((warning) => <Alert key={warning} severity="warning">{warning}</Alert>)}

            {!notice && !campuscoreDown && items.length === 0 && (
              <Card>
                <EmptyState
                  compact
                  title={sources.local ? 'No announcements yet' : 'No CampusCore class announcements on your sections'}
                  description={sources.local
                    ? 'Announcements posted to your local demo courses appear here.'
                    : postable.length > 0
                      ? 'Use “New announcement” to publish one to a section whose announcements are in CampusCore.'
                      : 'Class announcements posted in CampusCore for your sections appear here.'}
                  actionLabel="My Courses"
                  onActionClick={() => navigate('/faculty/courses')}
                />
              </Card>
            )}

            {items.map((announcement) => (
              <Card key={announcement.id} sx={{ p: { xs: 2, sm: 2.5 } }}>
                <Stack direction="row" spacing={2} alignItems="flex-start">
                  <IconTile icon={CampaignOutlinedIcon} tone="warning" size={38} sx={{ display: { xs: 'none', sm: 'inline-flex' } }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" alignItems="center" useFlexGap flexWrap="wrap" spacing={1}>
                      <Typography variant="subtitle2" color="primary.main">{announcement.label}</Typography>
                      {announcement.term && <Badge variant="neutral">{announcement.term}</Badge>}
                      {announcement.badges.map((badge) => (
                        <Badge key={badge} variant="neutral">{badge}</Badge>
                      ))}
                      <Typography variant="caption" sx={{ ml: 'auto !important' }}>
                        {new Date(announcement.date).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </Typography>
                    </Stack>
                    <Typography variant="h6" component="h3" sx={{ mt: 0.75 }}>{announcement.title}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, whiteSpace: 'pre-line' }}>{announcement.content}</Typography>
                    <Typography variant="caption" component="p" sx={{ mt: 1 }}>
                      Source: {announcement.sourceLabel}{announcement.author ? ` · ${announcement.author}` : ''}
                      {announcement.movedToMoodle ? ' · this section’s announcements are now published in Moodle' : ''}
                    </Typography>
                    {announcement.url && (
                      <MuiButton size="small" href={announcement.url} target="_blank" rel="noopener noreferrer" sx={{ mt: 0.5, ml: -1 }}>Open in Moodle</MuiButton>
                    )}
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

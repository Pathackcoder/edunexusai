import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import MuiButton from '@mui/material/Button';
import { Modal } from '../common/Modal';
import { DataState } from '../common/DataState';
import { Button } from '../common/Button';
import { useApiQuery } from '../../hooks/useApiQuery';
import { facultyApi, facultyMoodleApi, sisApi } from '../../services/api';
import { pretty } from './sisData';
import { ownerText, sectionLabel, teachingNotice } from '../../pages/faculty/teachingState';
import { AnnouncementComposer } from '../faculty/AnnouncementComposer';

function Roster({ sectionId }) {
  const { data, loading, error, refetch } = useApiQuery(() => sisApi.facultyRoster(sectionId), [sectionId]);
  return (
    <DataState loading={loading} error={error} onRetry={refetch} isEmpty={!data?.length} emptyTitle="No students" emptyMessage="Nobody is registered in this section." minHeight={120}>
      {() => (
        <Stack spacing={0.75}>
          {data.map((r) => (
            <Stack key={r.source.id} direction="row" justifyContent="space-between" spacing={1} sx={{ py: 0.5, borderBottom: 1, borderColor: 'divider' }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{r.student.displayName}</Typography>
                <Typography variant="caption">{r.student.institutionalId} · {r.student.email}</Typography>
              </Box>
              <Chip size="small" variant="outlined" label={`${pretty(r.status)}${r.waitlistPosition ? ` #${r.waitlistPosition}` : ''}`} />
            </Stack>
          ))}
        </Stack>
      )}
    </DataState>
  );
}

const MOODLE_ROLE = { TEACHING: ' · you teach it', TO_ENROL: ' · teacher role pending', OTHER_ROLE: ' · you are not a teacher there', NEEDS_MOODLE_ACCOUNT: ' · no linked Moodle account' };

/**
 * Official teaching assignments from CampusCore SIS for the signed-in faculty member (current and upcoming terms),
 * with the system that owns each section's announcements. Rosters open only for sections CampusCore says they teach
 * (checked on the server). "Post announcement" appears only on sections the server says can take one (CampusCore-
 * owned, publishing enabled).
 */
export function SisTeachingPanel() {
  const { data, loading, error, refetch } = useApiQuery(() => facultyApi.getSections());
  const [open, setOpen] = useState(null);
  const [composeFor, setComposeFor] = useState(null);
  const sections = data?.state === 'OK' ? data.sections : null;
  const notice = data ? teachingNotice(data.state, data.message) : null;
  // The Moodle teacher role per mapped section (Moodle LMS → CampusCore classes).
  const lms = useApiQuery(() => facultyMoodleApi.sisClasses());
  const moodleRole = new Map((lms.data?.classes ?? []).map((c) => [c.sisSectionId, c.status]));
  return (
    <Card sx={{ p: 2.5, mb: 2.5 }}>
      <Typography variant="h6" component="h2">Teaching assignments (CampusCore SIS)</Typography>
      <Typography variant="caption" component="p" sx={{ mb: 1.5 }}>Official sections and rosters from the student information system, for current and upcoming terms.</Typography>
      <DataState loading={loading} error={error} onRetry={refetch} loadingLabel="Loading from CampusCore…" minHeight={100}>
        {() => (
          <Stack spacing={1.5}>
            {notice && (
              <Alert severity={notice.severity} action={notice.severity === 'warning' ? <Button variant="ghost" size="sm" onClick={refetch}>Try again</Button> : null}>
                {notice.text}
              </Alert>
            )}
            {sections && (sections.length === 0 ? (
              <Alert severity="info">CampusCore lists no sections for you in the current or upcoming terms.</Alert>
            ) : (
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 1.5 }}>
                {sections.map((s) => (
                  <Box key={s.source.id} sx={{ p: 1.75, border: 1, borderColor: 'divider', borderRadius: 2 }}>
                    <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                      <Chip size="small" label={sectionLabel(s)} />
                      <Chip size="small" variant="outlined" label={s.termCode} />
                    </Stack>
                    <Typography variant="subtitle2" sx={{ mt: 0.75 }}>{s.courseTitle}</Typography>
                    <Typography variant="caption" component="p">{s.meetings.map((m) => `${m.day} ${m.start}–${m.end}`).join(' · ') || 'No scheduled meetings'}</Typography>
                    <Typography variant="caption" component="p">{s.seats.enrolled ?? '—'} enrolled of {s.seats.capacity}</Typography>
                    <Typography variant="caption" component="p" color="text.secondary">
                      {s.moodleCourse ? `Moodle: ${s.moodleCourse.shortName ?? `course ${s.moodleCourse.moodleCourseId}`}${MOODLE_ROLE[moodleRole.get(s.source.id)] ?? ''}` : 'Moodle: no Moodle course mapped'}
                    </Typography>
                    <Typography variant="caption" component="p" color="text.secondary">{ownerText(s)}</Typography>
                    <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
                      <MuiButton size="small" onClick={() => setOpen(s)}>Roster</MuiButton>
                      {s.publish?.allowed && <Button variant="ghost" size="sm" onClick={() => setComposeFor(s.source.id)} mutates>Post announcement</Button>}
                    </Stack>
                  </Box>
                ))}
              </Box>
            ))}
          </Stack>
        )}
      </DataState>
      <AnnouncementComposer open={Boolean(composeFor)} onClose={() => setComposeFor(null)} data={data} initialSectionId={composeFor ?? ''} />
      <Modal isOpen={Boolean(open)} onClose={() => setOpen(null)} title={open ? `${sectionLabel(open)} roster` : ''} subtitle="CampusCore SIS">
        {open && <Roster sectionId={open.source.id} />}
      </Modal>
    </Card>
  );
}

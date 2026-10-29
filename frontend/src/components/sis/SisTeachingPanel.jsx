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
import { useApiQuery } from '../../hooks/useApiQuery';
import { facultyMoodleApi, sisApi } from '../../services/api';
import { SisNotice } from './SisNotice';
import { pretty } from './sisData';

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

/**
 * Official teaching assignments from CampusCore SIS for the signed-in faculty member.
 * Rosters open only for sections CampusCore says they teach (checked on the server).
 */
export function SisTeachingPanel() {
  const { data, loading, error, refetch } = useApiQuery(() => sisApi.facultyTeaching());
  const [open, setOpen] = useState(null);
  const sections = data?.state === 'OK' && data.sections.state === 'OK' ? data.sections.data : null;
  // Which Moodle course (if any) delivers each section (Moodle LMS → CampusCore classes).
  const lms = useApiQuery(() => facultyMoodleApi.sisClasses());
  const lmsBySection = new Map((lms.data?.classes ?? []).map((c) => [c.sisSectionId, c]));
  return (
    <Card sx={{ p: 2.5, mb: 2.5 }}>
      <Typography variant="h6" component="h2">Teaching assignments (CampusCore SIS)</Typography>
      <Typography variant="caption" component="p" sx={{ mb: 1.5 }}>Official sections and rosters from the student information system.</Typography>
      <DataState loading={loading} error={error} onRetry={refetch} loadingLabel="Loading from CampusCore…" minHeight={100}>
        {() => (
          <Stack spacing={1.5}>
            <SisNotice overview={data} section={data?.sections} what="Your teaching assignments" onRetry={refetch} />
            {sections && (sections.length === 0 ? (
              <Alert severity="info">CampusCore lists no sections for you this term.</Alert>
            ) : (
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 1.5 }}>
                {sections.map((s) => (
                  <Box key={s.source.id} sx={{ p: 1.75, border: 1, borderColor: 'divider', borderRadius: 2 }}>
                    <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                      <Chip size="small" label={`${s.courseCode}-${s.sectionCode}`} />
                      <Chip size="small" variant="outlined" label={s.termCode} />
                    </Stack>
                    <Typography variant="subtitle2" sx={{ mt: 0.75 }}>{s.courseTitle}</Typography>
                    <Typography variant="caption" component="p">{s.meetings.map((m) => `${m.day} ${m.start}–${m.end}`).join(' · ') || 'No scheduled meetings'}</Typography>
                    <Typography variant="caption" component="p">{s.seats.enrolled ?? '—'} enrolled of {s.seats.capacity}</Typography>
                    {lmsBySection.has(s.source.id) && (
                      <Typography variant="caption" component="p" color={lmsBySection.get(s.source.id).status === 'TEACHING' ? 'success.main' : 'text.secondary'}>
                        Moodle: {lmsBySection.get(s.source.id).moodleCourse ? `${lmsBySection.get(s.source.id).moodleCourse.shortName}${lmsBySection.get(s.source.id).status === 'TEACHING' ? ' (you teach it)' : lmsBySection.get(s.source.id).status === 'TO_ENROL' ? ' (teacher role pending)' : ''}` : 'no Moodle course'}
                      </Typography>
                    )}
                    <MuiButton size="small" sx={{ mt: 0.5 }} onClick={() => setOpen(s)}>Roster</MuiButton>
                  </Box>
                ))}
              </Box>
            ))}
          </Stack>
        )}
      </DataState>
      <Modal isOpen={Boolean(open)} onClose={() => setOpen(null)} title={open ? `${open.courseCode}-${open.sectionCode} roster` : ''} subtitle="CampusCore SIS">
        {open && <Roster sectionId={open.source.id} />}
      </Modal>
    </Card>
  );
}

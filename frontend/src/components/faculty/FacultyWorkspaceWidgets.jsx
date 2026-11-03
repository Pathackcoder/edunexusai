import React, { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Stack, Typography, Button, TextField, MenuItem, Chip, Alert, Checkbox, FormControlLabel } from '@mui/material';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import VideoCallOutlinedIcon from '@mui/icons-material/VideoCallOutlined';
import AssignmentIndOutlinedIcon from '@mui/icons-material/AssignmentIndOutlined';
import { WidgetCard } from '../common/WidgetCard';
import { Modal } from '../common/Modal';
import { Badge } from '../common/Badge';
import { DataState } from '../common/DataState';
import { useToast } from '../common/Toast';
import { useApiQuery } from '../../hooks/useApiQuery';
import { advisingApi, interventionApi, workflowApi } from '../../services/api';
import { statusTone } from '../workflows/status';
import { CardFootnote } from '../common/Section';
import { FitList, Spotlight, WidgetEmpty } from '../common/FitList';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';

/**
 * Faculty dashboard widgets. Each is self-contained so the dashboard can render them as
 * independent, draggable cards.
 */

export function RosterWidget({ courses }) {
  const students = courses.reduce((sum, course) => sum + (course.enrolledCount ?? 0), 0);
  return (
    <WidgetCard title="My students & groups" subtitle="Your assigned sections · roster and class communication" icon={GroupsOutlinedIcon} tone="communication" accentBorder="top">
      {courses.length === 0 ? (
        <WidgetEmpty icon={GroupsOutlinedIcon} tone="communication" title="No assigned sections yet">
          Sections you teach this term will appear here with their rosters.
        </WidgetEmpty>
      ) : (
        <FitList
          items={courses}
          max={4}
          gap={1.25}
          moreTo="/faculty/courses"
          moreLabel="more sections"
          renderSpotlight={(course) => (
            <Spotlight
              tone="secondary"
              eyebrow={course.code}
              title={`${course.enrolledCount} student${course.enrolledCount === 1 ? '' : 's'} enrolled`}
              subtitle={course.name}
              action={<Button component={RouterLink} to={`/faculty/courses/${course.id}`} size="small" variant="outlined">Open roster & message class</Button>}
            />
          )}
          renderItem={(course) => (
            <Box sx={{ p: 1.5, bgcolor: 'secondary.lighter', borderRadius: 3 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                <Typography fontWeight={600}>{course.code}</Typography>
                <Chip size="small" label={`${course.enrolledCount} enrolled`} />
              </Stack>
              <Typography variant="body2" color="text.secondary">{course.name}</Typography>
              <Button component={RouterLink} to={`/faculty/courses/${course.id}`} size="small" sx={{ mt: 0.5, ml: -1 }}>Open roster & message class</Button>
            </Box>
          )}
        />
      )}
      {courses.length > 0 && (
        <CardFootnote icon={GroupsOutlinedIcon}>
          <strong>{students} student{students === 1 ? '' : 's'}</strong> across {courses.length} section{courses.length === 1 ? '' : 's'}
        </CardFootnote>
      )}
    </WidgetCard>
  );
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

/** Mon–Fri strip with the section's meeting days highlighted (from course.days). */
function WeekStrip({ days }) {
  const meets = new Set(days.map((day) => String(day).toLowerCase()));
  return (
    <Stack direction="row" spacing={0.75} sx={{ mt: 1.25 }} aria-label={`Meets ${days.join(' and ') || 'on days to be confirmed'}`}>
      {WEEKDAYS.map((day) => {
        const on = meets.has(day.toLowerCase()) || meets.has(day.slice(0, 3).toLowerCase());
        return (
          <Box
            key={day}
            aria-hidden
            sx={{
              flex: 1,
              py: 0.5,
              borderRadius: '8px',
              textAlign: 'center',
              typography: 'caption',
              fontWeight: 700,
              color: on ? '#fff' : 'text.secondary',
              background: on ? 'linear-gradient(135deg, #1C7ED6, #22D3EE)' : 'transparent',
              border: 1,
              borderColor: on ? 'transparent' : 'divider',
            }}
          >
            {day.slice(0, 3)}
          </Box>
        );
      })}
    </Stack>
  );
}

export function TeachingScheduleWidget({ courses }) {
  return (
    <WidgetCard title="Teaching schedule & office hours" icon={EventNoteOutlinedIcon} tone="campus" accentBorder="left" actionLabel="Weekly schedule" actionTo="/faculty/schedule">
      {courses.length === 0 ? (
        <WidgetEmpty icon={EventNoteOutlinedIcon} tone="campus" title="No teaching times yet">
          Class meetings and office hours appear here once your sections are scheduled.
        </WidgetEmpty>
      ) : (
        <FitList
          items={courses}
          max={4}
          gap={2}
          moreTo="/faculty/schedule"
          moreLabel="more sections"
          renderSpotlight={(course) => (
            <Spotlight
              tone="info"
              eyebrow={course.code}
              title={course.time || 'Time to be confirmed'}
              meta={[course.room && { icon: PlaceOutlinedIcon, label: course.room }]}
            >
              <WeekStrip days={course.days ?? []} />
            </Spotlight>
          )}
          renderItem={(course) => (
            <Box sx={{ borderLeft: 3, borderColor: 'info.main', pl: 2 }}>
              <Typography variant="overline" component="p">{course.code} · {(course.days ?? []).join(' / ')}</Typography>
              <Typography fontWeight={600}>{course.time || 'Time to be confirmed'}</Typography>
              <Typography variant="body2" color="text.secondary">{course.room}</Typography>
            </Box>
          )}
        />
      )}
      {courses.length > 0 && (
        <CardFootnote icon={EventNoteOutlinedIcon}>
          Office hours: <strong>{courses.find((course) => course.officeHours)?.officeHours || 'Not published'}</strong>
        </CardFootnote>
      )}
    </WidgetCard>
  );
}

const EMPTY_FOLLOW_UP = { title: '', type: 'FOLLOW_UP', studentProfileId: '', subjectLabel: '', courseId: '', dueDate: '', note: '', notifyStudent: false, referralTo: 'Student Success Office' };

/** Follow-up dialog shared by the dashboard widget and the Student Follow-ups page. */
export function FollowUpDialog({ open, onClose, onSaved, courses = [] }) {
  const { showToast } = useToast();
  const { data: students = [] } = useApiQuery(() => (open ? interventionApi.students() : Promise.resolve([])), [open], { initialData: [] });
  const [form, setForm] = useState(EMPTY_FOLLOW_UP);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async (event) => {
    event.preventDefault();
    if (!form.title.trim()) return setError('Enter an action or follow-up.');
    if (form.type !== 'TASK' && !form.studentProfileId && !form.subjectLabel.trim()) return setError('Choose the student for this follow-up.');
    setSaving(true);
    try {
      await interventionApi.create(form);
      showToast(form.type === 'REFERRAL' ? 'Referral saved and sent to the Administration queue.' : form.notifyStudent ? 'Follow-up saved and the student was notified.' : 'Follow-up saved.');
      setForm(EMPTY_FOLLOW_UP);
      setError('');
      onSaved();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal isOpen={open} onClose={onClose} title="Add task or student follow-up" footer={<Button type="submit" form="faculty-followup" variant="contained" disabled={saving}>Save follow-up</Button>}>
      <Stack component="form" id="faculty-followup" onSubmit={save} spacing={2}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField select label="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          {[['TASK', 'Task'], ['FOLLOW_UP', 'Follow-up required'], ['ADVISING', 'Advising note'], ['ATTENDANCE', 'Attendance concern'], ['MISSING_WORK', 'Missing assignments'], ['ACADEMIC_CONCERN', 'Academic concern'], ['REFERRAL', 'Referral to support office']].map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
        </TextField>
        <TextField label="Action" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        {form.type !== 'TASK' && (
          <TextField select label="Student" value={form.studentProfileId} onChange={(e) => setForm({ ...form, studentProfileId: e.target.value })} helperText="Students on your course rosters">
            {(students ?? []).map((student) => <MenuItem key={student.id} value={student.id}>{student.name} · {student.studentNumber}</MenuItem>)}
          </TextField>
        )}
        <TextField select label="Course (optional)" value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })}>
          <MenuItem value="">None</MenuItem>
          {courses.map((course) => <MenuItem key={course.id} value={course.id}>{course.code} · {course.name}</MenuItem>)}
        </TextField>
        <TextField label="Follow-up date" type="date" InputLabelProps={{ shrink: true }} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
        {form.type === 'REFERRAL' && (
          <TextField select label="Refer to" value={form.referralTo} onChange={(e) => setForm({ ...form, referralTo: e.target.value })}>
            {['Student Success Office', 'Counseling Services', 'Accessibility Services', 'Financial Aid Office', 'Writing Center'].map((office) => <MenuItem key={office} value={office}>{office}</MenuItem>)}
          </TextField>
        )}
        <TextField label="Notes" multiline rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        {form.type !== 'TASK' && form.studentProfileId && (
          <FormControlLabel control={<Checkbox checked={form.notifyStudent} onChange={(e) => setForm({ ...form, notifyStudent: e.target.checked })} />} label="Send the student a supportive check-in notification" />
        )}
        <Alert severity="info">Flags are your professional judgement, not a calculated risk score. Referrals go to the Administration operations queue.</Alert>
      </Stack>
    </Modal>
  );
}

export function FollowUpsWidget({ courses }) {
  const { showToast } = useToast();
  const { data, loading, error, refetch } = useApiQuery(() => interventionApi.list('OPEN'));
  const [open, setOpen] = useState(false);
  const items = data?.interventions ?? [];
  const toggle = async (item) => {
    try {
      await interventionApi.update(item.id, { status: item.status === 'RESOLVED' ? 'OPEN' : 'RESOLVED' });
      showToast(item.status === 'RESOLVED' ? 'Re-opened.' : 'Marked complete.');
      refetch();
    } catch (caught) {
      showToast(caught.message, 'error');
    }
  };
  return (
    <>
      <WidgetCard
        title="Tasks & student follow-ups"
        subtitle={`${items.length} open · ${data?.indicators?.length ?? 0} course-data indicator(s)`}
        icon={TaskAltOutlinedIcon}
        tone="warning"
        headerAction={<Stack direction="row" spacing={0.5}><Button size="small" component={RouterLink} to="/faculty/interventions">View all</Button><Button size="small" variant="contained" onClick={() => setOpen(true)}>Add</Button></Stack>}
      >
        <DataState loading={loading} error={error} onRetry={refetch} minHeight={100} fill>
          {() =>
            items.length === 0 ? (
              <WidgetEmpty
                icon={TaskAltOutlinedIcon}
                tone="warning"
                title="Your follow-up list is clear"
                action={<Button size="small" variant="outlined" onClick={() => setOpen(true)}>Add a follow-up</Button>}
              >
                Add a task, advising note, concern or referral.
              </WidgetEmpty>
            ) : (
              <FitList
                items={items}
                max={6}
                columns={{ xs: 1, sm: 2 }}
                moreTo="/faculty/interventions"
                moreLabel="more follow-ups"
                renderItem={(task) => (
                  <Stack direction="row" alignItems="flex-start" spacing={1} sx={{ p: 1, height: '100%', bgcolor: 'background.subtle', borderRadius: 2, border: 1, borderColor: 'divider' }}>
                    <Checkbox checked={task.status === 'RESOLVED'} inputProps={{ 'aria-label': `Complete ${task.title}` }} onChange={() => toggle(task)} sx={{ p: 0.5 }} />
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography fontWeight={600} sx={{ textDecoration: task.status === 'RESOLVED' ? 'line-through' : 'none' }}>{task.title}</Typography>
                      <Typography variant="caption" color="text.secondary" component="p">
                        {task.typeLabel} · {task.subject}{task.course ? ` · ${task.course.code}` : ''} · {task.dueDate || 'No due date'}
                      </Typography>
                      {task.note && <Typography variant="body2" color="text.secondary">{task.note}</Typography>}
                    </Box>
                    <Badge variant={task.status === 'IN_PROGRESS' ? 'info' : 'warning'}>{task.status === 'IN_PROGRESS' ? 'In progress' : 'Follow-up'}</Badge>
                  </Stack>
                )}
              />
            )
          }
        </DataState>
      </WidgetCard>
      <FollowUpDialog open={open} courses={courses} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); refetch(); }} />
    </>
  );
}

export function FacultyAdvisingWidget() {
  const { data, loading, error, refetch } = useApiQuery(() => advisingApi.appointments());
  const upcoming = data?.upcoming ?? [];
  return (
    <WidgetCard title="Advising appointments" subtitle={`${upcoming.length} upcoming`} icon={VideoCallOutlinedIcon} tone="purple" actionLabel="Availability" actionTo="/faculty/advising">
      <DataState loading={loading} error={error} onRetry={refetch} minHeight={100} fill>
        {() =>
          upcoming.length === 0 ? (
            <WidgetEmpty icon={VideoCallOutlinedIcon} tone="purple" title="No upcoming appointments">
              Publish availability so students can book time with you.
            </WidgetEmpty>
          ) : (
            <FitList
              items={upcoming}
              max={4}
              moreTo="/faculty/advising"
              moreLabel="more appointments"
              renderSpotlight={(appt) => (
                <Spotlight
                  tone="secondary"
                  eyebrow={new Date(appt.startsAt).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  title={appt.student.name}
                  subtitle={appt.topic}
                  aside={<Badge variant={appt.mode === 'VIRTUAL' ? 'info' : 'neutral'}>{appt.mode === 'VIRTUAL' ? 'Virtual' : 'In person'}</Badge>}
                  action={appt.meetingUrl ? <Button size="small" href={appt.meetingUrl} target="_blank" rel="noopener noreferrer" sx={{ ml: -1 }}>Join virtual meeting</Button> : null}
                />
              )}
              renderItem={(appt) => (
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ p: 1.25, borderRadius: 2.5, border: 1, borderColor: 'divider', bgcolor: 'background.subtle' }}>
                <Box sx={{ px: 1, py: 0.5, borderRadius: 2, bgcolor: 'secondary.lighter', color: 'secondary.dark', textAlign: 'center', minWidth: 54 }}>
                  <Typography variant="caption" fontWeight={700} display="block">{new Date(appt.startsAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Typography>
                  <Typography variant="caption">{new Date(appt.startsAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</Typography>
                </Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="subtitle2">{appt.student.name}</Typography>
                  <Typography variant="caption" color="text.secondary" display="block">{appt.topic}</Typography>
                </Box>
                <Badge variant={appt.mode === 'VIRTUAL' ? 'info' : 'neutral'}>{appt.mode === 'VIRTUAL' ? 'Virtual' : 'In person'}</Badge>
              </Stack>
              )}
            />
          )
        }
      </DataState>
    </WidgetCard>
  );
}

export function FacultyRequestsWidget() {
  const { data, loading, error, refetch } = useApiQuery(() => Promise.all([workflowApi.listRequests(), workflowApi.listTickets()]));
  const [requests, tickets] = data ?? [null, null];
  const recent = requests?.requests ?? [];
  return (
    <WidgetCard title="My requests & help desk" subtitle={`${requests?.summary?.open ?? 0} open request(s) · ${(tickets?.tickets ?? []).filter((ticket) => ticket.isOpen).length} open ticket(s)`} icon={AssignmentIndOutlinedIcon} tone="info" actionLabel="All requests" actionTo="/help/requests">
      <DataState loading={loading} error={error} onRetry={refetch} minHeight={100} fill>
        {() => (
          <>
            {recent.length === 0 ? (
              <WidgetEmpty icon={AssignmentIndOutlinedIcon} tone="info" title="No requests yet">
                Room bookings, equipment, syllabus changes and leave go through here.
              </WidgetEmpty>
            ) : (
              <FitList
                items={recent}
                max={3}
                moreTo="/help/requests"
                moreLabel="more requests"
                sx={{ mb: 1.5 }}
                renderItem={(item) => (
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 1, borderRadius: 2, border: 1, borderColor: 'divider' }}>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="subtitle2">{item.title}</Typography>
                      <Typography variant="caption" color="text.secondary" component="p">{item.reference} · {item.typeLabel}</Typography>
                    </Box>
                    <Badge variant={statusTone(item.status)} dot>{item.statusLabel}</Badge>
                  </Stack>
                )}
              />
            )}
            <Stack direction="row" spacing={1} sx={{ mt: 'auto', flexShrink: 0 }}>
              <Button size="small" variant="contained" component={RouterLink} to="/help/requests?new=1">New request</Button>
              <Button size="small" component={RouterLink} to="/help/tickets?new=1">Open a ticket</Button>
            </Stack>
          </>
        )}
      </DataState>
    </WidgetCard>
  );
}

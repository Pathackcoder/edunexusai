import React, { useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import MuiButton from '@mui/material/Button';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import MailOutlineRoundedIcon from '@mui/icons-material/MailOutlineRounded';
import GradingRoundedIcon from '@mui/icons-material/GradingRounded';
import { useApiQuery } from '../../hooks/useApiQuery';
import { facultyApi } from '../../services/api';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { PageHeader } from '../../components/common/PageHeader';
import { WidgetCard } from '../../components/common/WidgetCard';
import { EmptyState } from '../../components/common/EmptyState';
import { useToast } from '../../components/common/Toast';
import { DataState } from '../../components/common/DataState';
import { useAuth } from '../../context/AuthContext';

/**
 * Roster and class messaging for a local EduNexusAI demo course (not a CampusCore section).
 *
 * "Send notification" is the demonstrable write: it creates one Notification row per
 * enrolled student in PostgreSQL, and those rows show up in each student's notification
 * centre. The response reports how many were created, so the count on screen is the
 * number the database actually accepted.
 *
 * Class announcements are not posted from here: they belong to the system that owns each
 * section (CampusCore or Moodle), and a local row would reach no student reading those.
 */
export const FacultyCourseDetailPage = () => {
  const { courseId } = useParams();
  const { isFaculty } = useAuth();
  const { showToast } = useToast();

  const { data, loading, error, refetch } = useApiQuery(
    () => facultyApi.getRoster(courseId),
    [courseId],
  );

  const [isNotifyOpen, setIsNotifyOpen] = useState(false);
  const [form, setForm] = useState({ title: '', message: '', priority: 'normal' });
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [formError, setFormError] = useState(null);

  const course = data?.course;
  const students = data?.students ?? [];

  const resetNotify = () => {
    setForm({ title: '', message: '', priority: 'normal' });
    setFormError(null);
  };

  const handleSendNotification = async (event) => {
    event.preventDefault();
    setSending(true);
    setFormError(null);
    try {
      const result = await facultyApi.sendClassNotification(courseId, form);
      setLastResult(result);
      showToast(`Notification delivered to ${result.recipientCount} enrolled students.`);
      setIsNotifyOpen(false);
      resetNotify();
    } catch (caught) {
      setFormError(caught);
    } finally {
      setSending(false);
    }
  };

  const fieldErrors = formError?.fieldErrors ?? {};

  return (
    <DataState
      loading={loading}
      error={error}
      onRetry={refetch}
      loadingLabel="Loading the course roster…"
      minHeight={360}
    >
      {() => (
        <Box>
          <MuiButton
            component={RouterLink}
            to="/faculty/courses"
            size="small"
            startIcon={<ArrowBackRoundedIcon />}
            sx={{ color: 'primary.main', mb: 1.5, ml: -1 }}
          >
            Back to my courses
          </MuiButton>

          <PageHeader
            title={`${course?.code} — ${course?.name}`}
            description={`${course?.room} · ${(course?.days ?? []).join(', ')} · ${course?.time}`}
            actions={
              <>
                {!isFaculty ? null : (
                  <Button variant="secondary" size="sm" icon={GradingRoundedIcon} component={RouterLink} to={`/faculty/gradebook?course=${courseId}`}>
                    Open gradebook
                  </Button>
                )}
                <Button variant="primary" size="sm" icon={SendRoundedIcon} onClick={() => setIsNotifyOpen(true)}>
                  Send notification
                </Button>
              </>
            }
          />

          <Stack spacing={2.5}>
            <Alert severity="info" action={<MuiButton component={RouterLink} to="/faculty/announcements" size="small">My Announcements</MuiButton>}>
              This is a local EduNexusAI demo course, not a CampusCore section. Notifications sent here reach only the
              students enrolled in this demo course. Class announcements are published in the system that owns each of
              your sections (CampusCore or Moodle).
            </Alert>
            {lastResult && (
              <Alert severity="success" role="status">
                <strong>{lastResult.notificationsCreated}</strong> notification records written for{' '}
                {lastResult.courseCode}: “{lastResult.title}”.
              </Alert>
            )}

            {/* Roster */}
            <WidgetCard
              title={`Enrolled Students (${data?.enrolledCount ?? 0})`}
              icon={GroupsOutlinedIcon}
              disablePadding
            >
              {students.length === 0 ? (
                <Box sx={{ borderTop: 1, borderColor: 'divider' }}>
                  <EmptyState compact title="No students enrolled" description="Students will appear here once they register for this section." />
                </Box>
              ) : (
                <TableContainer sx={{ borderTop: 1, borderColor: 'divider', borderRadius: 0 }}>
                  <Table sx={{ minWidth: 720 }}>
                    <TableHead>
                      <TableRow>
                        {['Student', 'Student ID', 'Program', 'Tier', 'Status', 'Grade'].map((heading) => (
                          <TableCell key={heading}>{heading}</TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {students.map((student) => (
                        <TableRow key={student.enrollmentId} hover>
                          <TableCell>
                            <Stack direction="row" alignItems="center" spacing={1.5}>
                              <Avatar sx={{ width: 34, height: 34, fontSize: '0.8125rem', bgcolor: 'primary.lighter', color: 'primary.dark' }}>
                                {student.name?.split(' ').map((part) => part.charAt(0)).slice(0, 2).join('')}
                              </Avatar>
                              <Box sx={{ minWidth: 0 }}>
                                <Typography variant="body2" fontWeight={600}>{student.name}</Typography>
                                <Stack direction="row" alignItems="center" spacing={0.5} sx={{ color: 'text.secondary' }}>
                                  <MailOutlineRoundedIcon sx={{ fontSize: 13 }} />
                                  <Typography variant="caption">{student.email}</Typography>
                                </Stack>
                              </Box>
                            </Stack>
                          </TableCell>
                          <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>{student.studentNumber}</TableCell>
                          <TableCell sx={{ color: 'text.secondary' }}>{student.program ?? '—'}</TableCell>
                          <TableCell>{student.tier ? <Badge variant="neutral">{student.tier}</Badge> : '—'}</TableCell>
                          <TableCell sx={{ color: 'text.secondary' }}>{student.status}</TableCell>
                          <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                            {student.letterGrade ?? '—'}
                            {student.percentage != null && (
                              <Box component="span" sx={{ fontWeight: 400, color: 'text.secondary' }}> ({student.percentage}%)</Box>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </WidgetCard>
          </Stack>

          {/* Send notification */}
          <Modal
            isOpen={isNotifyOpen}
            onClose={() => {
              setIsNotifyOpen(false);
              resetNotify();
            }}
            title={`Notify ${course?.code ?? 'this class'}`}
            subtitle={`${data?.enrolledCount ?? 0} enrolled students will receive this`}
          >
            <Box component="form" onSubmit={handleSendNotification}>
              <Stack spacing={2.25}>
                <TextField
                  id="notify-title"
                  label="Title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Midterm review session added"
                  required
                  error={Boolean(fieldErrors.title)}
                  helperText={fieldErrors.title}
                />
                <TextField
                  id="notify-message"
                  label="Message"
                  multiline
                  rows={4}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder="Extra review session Friday 3:00 PM in Science Building 204."
                  required
                  error={Boolean(fieldErrors.message)}
                  helperText={fieldErrors.message}
                />
                <TextField
                  id="notify-priority"
                  select
                  label="Priority"
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  SelectProps={{ native: true }}
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </TextField>

                {formError && !Object.keys(fieldErrors).length && (
                  <Alert severity="error">{formError.message}</Alert>
                )}

                <Stack direction="row" justifyContent="flex-end" spacing={1}>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setIsNotifyOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" size="sm" loading={sending} icon={SendRoundedIcon} mutates>
                    Send to {data?.enrolledCount ?? 0} students
                  </Button>
                </Stack>
              </Stack>
            </Box>
          </Modal>
        </Box>
      )}
    </DataState>
  );
};

export default FacultyCourseDetailPage;

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import { useApiQuery } from '../../hooks/useApiQuery';
import { adminOpsApi } from '../../services/api';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import InputAdornment from '@mui/material/InputAdornment';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import CampaignRoundedIcon from '@mui/icons-material/CampaignRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import ScheduleSendRoundedIcon from '@mui/icons-material/ScheduleSendRounded';
import EditNoteRoundedIcon from '@mui/icons-material/EditNoteRounded';
import BookmarkBorderRoundedIcon from '@mui/icons-material/BookmarkBorderRounded';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined';
import SmartphoneOutlinedIcon from '@mui/icons-material/SmartphoneOutlined';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import SmsOutlinedIcon from '@mui/icons-material/SmsOutlined';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import { WidgetCard } from '../common/WidgetCard';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { useToast } from '../common/Toast';

const TEMPLATES = [
  {
    id: 'tpl-1',
    name: 'Tuition Payment Due Notice',
    category: 'finance',
    priority: 'high',
    title: 'Reminder: Fall 2026 Tuition Settlement Deadline Approaching',
    message: 'The bursar office reminder: All tuition balances for Fall 2026 must be settled or enrolled in a payment plan by Friday at 5:00 PM to avoid late penalty holds.',
  },
  {
    id: 'tpl-2',
    name: 'Registration & Course Enrollment',
    category: 'academic',
    priority: 'normal',
    title: 'Spring 2027 Advance Course Registration Schedule Released',
    message: 'Course registration time-tickets are now visible in your student profile. Review prerequisite requirements with your academic advisor before your assigned enrollment window.',
  },
  {
    id: 'tpl-3',
    name: 'Midterm Examination Schedule',
    category: 'academic',
    priority: 'normal',
    title: 'Midterm Exam Rooms and Schedule Published',
    message: 'Locations and schedule for midterm assessments are now finalized. Check your Course Schedule tab for updated room assignments and proctor instructions.',
  },
  {
    id: 'tpl-4',
    name: 'Campus System Maintenance',
    category: 'operations',
    priority: 'low',
    title: 'Scheduled Portal Maintenance: Sunday 2:00 AM - 4:00 AM EST',
    message: 'EdunexusAI portal and Canvas LMS SSO integrations will undergo scheduled infrastructure maintenance this Sunday. Access will be temporarily limited.',
  },
];

/** Maps the compose form to the audience the API resolves against real users. */
const audienceValueOf = (f) =>
  ({
    INDIVIDUAL: f.individual,
    ROLE: f.role,
    DEPARTMENT: f.department === 'ALL' ? null : f.department,
    PROGRAM: f.program,
    COURSE: f.course,
    STATUS: f.academicStatus,
  })[f.audienceType] ?? null;

export const AdminCommunicationCenter = ({ initialAudience = null }) => {
  const { showToast } = useToast();
  const [params] = useSearchParams();
  const [editingDraft, setEditingDraft] = useState(null);
  const [activeTab, setActiveTab] = useState('sent'); // 'sent', 'scheduled', 'drafts', 'templates'
  const [isComposeOpen, setIsComposeOpen] = useState(Boolean(params.get('audience') || params.get('urgent')));
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Broadcasts are rows in communication_broadcasts; sending one writes in-app
  // notifications for every matching user.
  const { data: comms, refetch } = useApiQuery(() => adminOpsApi.listBroadcasts());
  const broadcasts = comms?.sent ?? [];
  const scheduled = comms?.scheduled ?? [];
  const drafts = comms?.drafts ?? [];
  const [busy, setBusy] = useState(false);
  const [reach, setReach] = useState(null);

  // Form State
  const [form, setForm] = useState({
    title: '',
    message: '',
    audienceType: initialAudience || params.get('audience') || 'ALL_STUDENTS',
    individual: '',
    role: 'STUDENT',
    academicStatus: 'Follow-up required',
    department: params.get('department') && params.get('department') !== 'CS' ? params.get('department') : params.get('department') === 'CS' ? 'Computer Science' : 'ALL',
    program: params.get('program') || 'Computer Science',
    batch: 'Class of 2026',
    course: 'CS 501',
    category: 'academic',
    priority: params.get('urgent') ? 'urgent' : 'normal',
    scheduledDate: '',
    expiryDate: '',
    channels: {
      inApp: true,
      email: false,
      push: false,
      sms: false,
    },
  });

  const handleOpenCompose = (prefill = null) => {
    setEditingDraft(prefill?.status === 'DRAFT' ? prefill.id : null);
    if (prefill) {
      setForm((prev) => ({
        ...prev,
        ...prefill,
        title: prefill.title || '',
        message: prefill.message || '',
        category: prefill.category || 'academic',
        priority: prefill.priority || 'normal',
        audienceType: prefill.audienceType || prev.audienceType,
      }));
    }
    setIsComposeOpen(true);
  };

  const handleUseTemplate = (template) => {
    handleOpenCompose({
      title: template.title,
      message: template.message,
      category: template.category,
      priority: template.priority,
    });
  };

  const payloadOf = (action) => ({
    action,
    title: form.title,
    message: form.message,
    category: form.category,
    priority: form.priority,
    audienceType: form.audienceType,
    audienceValue: audienceValueOf(form),
    audienceLabel: formatAudienceLabel(form),
    channels: Object.entries(form.channels).filter(([, v]) => v).map(([k]) => (k === 'inApp' ? 'IN_APP' : k.toUpperCase())),
    scheduledFor: action === 'SCHEDULE' ? new Date(form.scheduledDate).toISOString() : null,
    expiresAt: form.expiryDate ? new Date(`${form.expiryDate}T23:59:59`).toISOString() : null,
  });

  const handleSaveDraft = async () => {
    if (!form.title.trim()) {
      showToast('Please provide at least a title to save a draft.');
      return;
    }
    setBusy(true);
    try {
      await adminOpsApi.saveBroadcast(payloadOf('DRAFT'), editingDraft);
      setIsComposeOpen(false);
      setEditingDraft(null);
      showToast('Draft saved.');
      refetch();
    } catch (caught) {
      showToast(caught.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleDispatchCommunication = async () => {
    if (!form.channels.inApp) { showToast('In-app delivery must be selected; other channels are recorded only.'); return; }
    if (form.audienceType === 'INDIVIDUAL' && !form.individual.trim()) { showToast('Enter an individual recipient.'); return; }
    if (form.scheduledDate && new Date(form.scheduledDate) <= new Date()) { showToast('Choose a future scheduled time.'); return; }
    if (form.expiryDate && new Date(`${form.expiryDate}T23:59:59`) <= (form.scheduledDate ? new Date(form.scheduledDate) : new Date())) { showToast('Expiry must follow the send time.'); return; }
    if (!form.title.trim() || !form.message.trim()) {
      showToast('Title and message cannot be empty.');
      return;
    }
    setBusy(true);
    try {
      const result = await adminOpsApi.saveBroadcast(payloadOf(form.scheduledDate ? 'SCHEDULE' : 'SEND'), editingDraft);
      showToast(
        form.scheduledDate
          ? 'Broadcast scheduled. It is delivered automatically once the time has passed.'
          : `Broadcast delivered in-app to ${result?.sent?.[0]?.recipients ?? reach ?? 0} user(s).`,
      );
      setIsComposeOpen(false);
      setIsPreviewOpen(false);
      setEditingDraft(null);
      setForm((previous) => ({ ...previous, title: '', message: '', scheduledDate: '', expiryDate: '' }));
      refetch();
    } catch (caught) {
      showToast(caught.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const removeBroadcast = async (item, label) => {
    try {
      await adminOpsApi.deleteBroadcast(item.id);
      showToast(label);
      refetch();
    } catch (caught) {
      showToast(caught.message, 'error');
    }
  };

  // Live audience size from the API, so the reach shown is the number that will receive it.
  useEffect(() => {
    if (!isComposeOpen) return undefined;
    const timer = setTimeout(() => {
      adminOpsApi
        .previewAudience({ audienceType: form.audienceType, audienceValue: audienceValueOf(form) })
        .then((result) => setReach(result.recipients))
        .catch(() => setReach(null));
    }, 250);
    return () => clearTimeout(timer);
  }, [isComposeOpen, form.audienceType, form.individual, form.role, form.department, form.program, form.course, form.academicStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatAudienceLabel = (f) => {
    switch (f.audienceType) {
      case 'ALL_CAMPUS':
        return 'All Campus (Students, Faculty, Staff)';
      case 'ALL_STUDENTS':
        return 'All Enrolled Students';
      case 'ALL_FACULTY':
        return 'All Teaching Faculty';
      case 'DEPARTMENT':
        return `Department: ${f.department || 'Computer Science'}`;
      case 'PROGRAM':
        return `Program: ${f.program || 'BS Computer Science'}`;
      case 'BATCH':
        return `Batch: ${f.batch || 'Class of 2026'}`;
      case 'COURSE':
        return `Course: ${f.course || 'CS 501'}`;
      case 'INDIVIDUAL': return `Individual: ${f.individual}`;
      case 'ROLE': return `Role: ${f.role}`;
      case 'STATUS': return `Academic status: ${f.academicStatus}`;
      default: return 'Targeted Segment';
    }
  };

  const filterItems = (list) => {
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter((item) => `${item.title ?? ''} ${item.name ?? ''}`.toLowerCase().includes(q) || (item.audience || '').toLowerCase().includes(q));
  };

  return (
    <>
      <WidgetCard
        title="Centralized Communication Center"
        subtitle="Manage targeted campus broadcasts, scheduled notices, and audience reach"
        icon={CampaignRoundedIcon}
        tone="purple"
        accentBorder="top"
        headerAction={
          <Button
            size="sm"
            variant="primary"
            icon={SendRoundedIcon}
            onClick={() => handleOpenCompose()}
          >
            Compose Broadcast
          </Button>
        }
      >
        <Stack spacing={2}>
          <Alert severity="info">Broadcasts are delivered as in-app notifications to every matching user and saved with their read rate. Email, SMS and push are recorded as requested channels; no external providers are connected.</Alert>
          {/* Controls Bar: Tabs & Search */}
          <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" spacing={1.5}>
            <Tabs
              variant="scrollable" scrollButtons="auto"
              value={activeTab}
              onChange={(_, v) => setActiveTab(v)}
              sx={{ minHeight: 38, '& .MuiTab-root': { minHeight: 38, py: 0.5, px: 1.5, fontSize: '0.8125rem' } }}
            >
              <Tab label={`Dispatched (${broadcasts.length})`} value="sent" />
              <Tab label={`Scheduled (${scheduled.length})`} value="scheduled" />
              <Tab label={`Drafts (${drafts.length})`} value="drafts" />
              <Tab label="Templates (4)" value="templates" />
            </Tabs>

            <TextField
              size="small"
              label="Search communications" placeholder="Search communications..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              sx={{ maxWidth: { sm: 220 } }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchRoundedIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                  </InputAdornment>
                ),
              }}
            />
          </Stack>

          {/* TAB 1: Dispatched Broadcasts */}
          {activeTab === 'sent' && (
            <Stack spacing={1.25}>
              {filterItems(broadcasts).length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                  No dispatched communications found.
                </Typography>
              ) : (
                filterItems(broadcasts).map((bc) => (
                  <Paper
                    key={bc.id}
                    variant="outlined"
                    sx={{
                      p: 1.75,
                      borderRadius: 2.5,
                      transition: 'border-color 160ms ease, box-shadow 160ms ease',
                      '&:hover': { borderColor: 'primary.light', boxShadow: 1 },
                    }}
                  >
                    <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" spacing={1.25}>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Stack direction="row" alignItems="center" spacing={1} useFlexGap flexWrap="wrap">
                          <Badge variant={bc.priority === 'high' ? 'warning' : 'neutral'}>
                            {bc.priority.toUpperCase()}
                          </Badge>
                          <Badge variant="purple">{bc.category}</Badge>
                          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            {bc.sentAt}{bc.expiryDate ? ` · Expires ${bc.expiryDate}` : ''}
                          </Typography>
                        </Stack>

                        <Typography variant="subtitle2" sx={{ fontWeight: 600, mt: 0.5 }}>
                          {bc.title}
                        </Typography>

                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
                          Audience: <strong>{bc.audience}</strong> · <strong>{bc.recipients} recipients</strong>
                        </Typography>
                      </Box>

                      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ flexShrink: 0 }}>
                        <Box sx={{ textAlign: { sm: 'right' } }}>
                          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                            Read Rate
                          </Typography>
                          <Typography variant="subtitle2" sx={{ color: 'success.main', fontWeight: 700 }}>
                            {bc.openRate}
                          </Typography>
                        </Box>
                        <Chip
                          size="small"
                          label="Delivered in-app"
                          color="success"
                          variant="outlined"
                          icon={<CheckCircleRoundedIcon sx={{ fontSize: 14 }} />}
                        />
                      </Stack>
                    </Stack>
                  </Paper>
                ))
              )}
            </Stack>
          )}

          {/* TAB 2: Scheduled Broadcasts */}
          {activeTab === 'scheduled' && (
            <Stack spacing={1.25}>
              {filterItems(scheduled).length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                  No scheduled communications in queue.
                </Typography>
              ) : (
                filterItems(scheduled).map((sc) => (
                  <Paper
                    key={sc.id}
                    variant="outlined"
                    sx={{
                      p: 1.75,
                      borderRadius: 2.5,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 1.5,
                    }}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Badge variant="neutral">{sc.category}</Badge>
                        <Badge variant={sc.priority === 'high' ? 'warning' : 'neutral'}>{sc.priority}</Badge>
                        <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 600 }}>
                          Planned: {new Date(sc.scheduledFor).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </Typography>
                      </Stack>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, mt: 0.5 }}>
                        {sc.title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Target: {sc.audience} · ~{sc.recipientsEst} recipients
                      </Typography>
                    </Box>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => removeBroadcast(sc, 'Scheduled communication cancelled.')}
                    >
                      Cancel
                    </Button>
                  </Paper>
                ))
              )}
            </Stack>
          )}

          {/* TAB 3: Drafts */}
          {activeTab === 'drafts' && (
            <Stack spacing={1.25}>
              {filterItems(drafts).length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                  No saved drafts.
                </Typography>
              ) : (
                filterItems(drafts).map((df) => (
                  <Paper
                    key={df.id}
                    variant="outlined"
                    sx={{
                      p: 1.75,
                      borderRadius: 2.5,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 1.5,
                    }}
                  >
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Badge variant="neutral">Draft</Badge>
                        <Typography variant="caption" color="text.secondary">
                          Saved {df.lastSaved}
                        </Typography>
                      </Stack>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, mt: 0.5 }}>
                        {df.title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {df.message}
                      </Typography>
                    </Box>

                    <Stack direction="row" spacing={1}>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => handleOpenCompose(df)}
                      >
                        Resume
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={`Discard ${df.title}`} icon={DeleteOutlineRoundedIcon}
                        onClick={() => removeBroadcast(df, 'Draft discarded.')}
                      />
                    </Stack>
                  </Paper>
                ))
              )}
            </Stack>
          )}

          {/* TAB 4: Templates */}
          {activeTab === 'templates' && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
              {TEMPLATES.map((tpl) => (
                <Paper
                  key={tpl.id}
                  variant="outlined"
                  sx={{
                    p: 2,
                    borderRadius: 2.5,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    '&:hover': { borderColor: 'primary.light' },
                  }}
                >
                  <Box>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                      <Badge variant="purple">{tpl.category}</Badge>
                      <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                        Template
                      </Typography>
                    </Stack>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                      {tpl.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8125rem', lineHeight: 1.4 }}>
                      {tpl.message}
                    </Typography>
                  </Box>

                  <Button
                    size="sm"
                    variant="outline"
                    color="primary"
                    endIcon={<ArrowForwardRoundedIcon />}
                    onClick={() => handleUseTemplate(tpl)}
                    sx={{ mt: 2, alignSelf: 'flex-start' }}
                  >
                    Use Template
                  </Button>
                </Paper>
              ))}
            </Box>
          )}
        </Stack>
      </WidgetCard>

      {/* Compose Broadcast Modal */}
      <Modal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        title="Compose Campus Communication"
        subtitle="Preview a targeted notice. Delivery channels are not connected."
        footer={
          <Stack direction="row" spacing={1} justifyContent="space-between" sx={{ width: '100%' }}>
            <Button variant="outline" size="sm" onClick={handleSaveDraft}>
              Save Draft
            </Button>
            <Stack direction="row" spacing={1}>
              <Button variant="outline" size="sm" icon={VisibilityOutlinedIcon} onClick={() => setIsPreviewOpen(true)}>
                Preview Notice
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={form.scheduledDate ? ScheduleSendRoundedIcon : SendRoundedIcon}
                onClick={() => setIsPreviewOpen(true)}
                disabled={!form.title.trim() || !form.message.trim()}
              >
                Review Broadcast
              </Button>
            </Stack>
          </Stack>
        }
      >
        <Stack spacing={2.5}>
          {/* Audience Selection Row */}
          <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: 'background.subtle', border: 1, borderColor: 'divider' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, color: 'text.primary' }}>
              1. Audience Targeting & Segmentation
            </Typography>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
              <TextField
                select
                label="Target Segment"
                value={form.audienceType}
                onChange={(e) => setForm({ ...form, audienceType: e.target.value })}
              >
                <MenuItem value="ALL_STUDENTS">All Students</MenuItem>
                <MenuItem value="ALL_FACULTY">All Faculty & Instructors</MenuItem>
                <MenuItem value="ALL_CAMPUS">Entire Campus Population</MenuItem>
                <MenuItem value="INDIVIDUAL">Individual user</MenuItem>
                <MenuItem value="ROLE">Specific role</MenuItem>
                <MenuItem value="STATUS">Academic status</MenuItem>
                <MenuItem value="DEPARTMENT">Specific Department</MenuItem>
                <MenuItem value="PROGRAM">Academic Degree Program</MenuItem>
                <MenuItem value="COURSE">Enrolled Course Section</MenuItem>
              </TextField>

              {form.audienceType === 'INDIVIDUAL' && <TextField label="Recipient name or email" value={form.individual} onChange={(e) => setForm({ ...form, individual: e.target.value })} />}
              {form.audienceType === 'ROLE' && <TextField select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{['STUDENT', 'FACULTY', 'ADMIN'].map((role) => <MenuItem key={role} value={role}>{role}</MenuItem>)}</TextField>}
              {form.audienceType === 'STATUS' && <TextField select label="Academic status" value={form.academicStatus} onChange={(e) => setForm({ ...form, academicStatus: e.target.value })}>{['Follow-up required', 'Good standing'].map((status) => <MenuItem key={status} value={status}>{status}</MenuItem>)}</TextField>}
              {form.audienceType === 'PROGRAM' && <TextField select label="Program" value={form.program} onChange={(e) => setForm({ ...form, program: e.target.value })}>{['Computer Science', 'Data Science', 'Cybersecurity', 'Software Engineering', 'Distributed Systems', 'Embedded Systems'].map((program) => <MenuItem key={program} value={program}>{program}</MenuItem>)}</TextField>}
              {form.audienceType === 'DEPARTMENT'  && (
                <TextField
                  select
                  label="Select Department"
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                >
                  <MenuItem value="ALL">All departments</MenuItem>
                  <MenuItem value="Computer Science">Computer Science & Engineering</MenuItem>
                </TextField>
              )}

              {form.audienceType === 'BATCH' && (
                <TextField
                  select
                  label="Select Class Year"
                  value={form.batch}
                  onChange={(e) => setForm({ ...form, batch: e.target.value })}
                >
                  <MenuItem value="Class of 2026">Class of 2026 (Seniors)</MenuItem>
                  <MenuItem value="Class of 2027">Class of 2027 (Juniors)</MenuItem>
                  <MenuItem value="Class of 2028">Class of 2028 (Sophomores)</MenuItem>
                  <MenuItem value="Class of 2029">Class of 2029 (First Years)</MenuItem>
                </TextField>
              )}

              {form.audienceType === 'COURSE' && (
                <TextField
                  select
                  label="Select Course"
                  value={form.course}
                  onChange={(e) => setForm({ ...form, course: e.target.value })}
                >
                  <MenuItem value="CS 501">CS 501: Advanced Database Systems</MenuItem>
                  <MenuItem value="CS 512">CS 512: Software Engineering</MenuItem>
                  <MenuItem value="CS 530">CS 530: Distributed Systems</MenuItem>
                  <MenuItem value="CS 545">CS 545: Computer Networks</MenuItem>
                </TextField>
              )}

              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', bgcolor: 'background.paper', p: 1, borderRadius: 1.5, border: 1, borderColor: 'divider', width: '100%' }}>
                  Audience reach: <strong>{reach == null ? '…' : `${reach.toLocaleString()} user${reach === 1 ? '' : 's'}`}</strong>
                </Typography>
              </Box>
            </Box>
          </Box>

          {/* Message Content */}
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5, color: 'text.primary' }}>
              2. Notification Content & Details
            </Typography>

            <Stack spacing={1.5}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                <TextField
                  select
                  label="Category"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  <MenuItem value="academic">Academic & Curriculum</MenuItem>
                  <MenuItem value="finance">Bursar & Financial Aid</MenuItem>
                  <MenuItem value="campus">Campus Life & Events</MenuItem>
                  <MenuItem value="operations">IT & System Operations</MenuItem>
                  <MenuItem value="policy">Policy & Administration</MenuItem>
                </TextField>

                <TextField
                  select
                  label="Priority Level"
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                >
                  <MenuItem value="low">Low (General Information)</MenuItem>
                  <MenuItem value="normal">Normal (Standard Stream)</MenuItem>
                  <MenuItem value="high">High (Action Required)</MenuItem>
                  <MenuItem value="urgent">Urgent (Immediate Banner)</MenuItem>
                </TextField>
              </Box>

              <TextField
                label="Broadcast Headline"
                placeholder="e.g. Action Required: Degree Audit Submission Deadline"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />

              <TextField
                label="Broadcast Message Body"
                placeholder="Compose announcement text, deadlines, links and instructions for students or faculty..."
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                multiline
                rows={4}
                required
              />
            </Stack>
          </Box>

          {/* Delivery Channels */}
          <Box sx={{ p: 2, borderRadius: 2.5, bgcolor: 'background.subtle', border: 1, borderColor: 'divider' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: 'text.primary' }}>
              3. Dispatch Channels & Scheduling
            </Typography>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 1.5 }} useFlexGap flexWrap="wrap">
              <FormControlLabel
                control={
                  <Checkbox
                    checked={form.channels.inApp}
                    onChange={(e) => setForm({ ...form, channels: { ...form.channels, inApp: e.target.checked } })}
                    size="small"
                  />
                }
                label={<Typography variant="caption">In-App Portal Notification (Simulation)</Typography>}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    disabled checked={false}
                    onChange={(e) => setForm({ ...form, channels: { ...form.channels, email: e.target.checked } })}
                    size="small"
                  />
                }
                label={<Typography variant="caption">Campus Email (Not configured)</Typography>}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    disabled checked={false}
                    onChange={(e) => setForm({ ...form, channels: { ...form.channels, push: e.target.checked } })}
                    size="small"
                  />
                }
                label={<Typography variant="caption">Push (Not configured)</Typography>}
              />
              <FormControlLabel
                control={
                  <Checkbox
                    disabled checked={false}
                    onChange={(e) => setForm({ ...form, channels: { ...form.channels, sms: e.target.checked } })}
                    size="small"
                  />
                }
                label={<Typography variant="caption">SMS (Not configured)</Typography>}
              />
            </Stack>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
              <TextField
                label="Schedule Send Date / Time (Optional)"
                type="datetime-local"
                value={form.scheduledDate}
                onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })}
                InputLabelProps={{ shrink: true }}
                helperText="Leave blank for an immediate simulation"
              />
              <TextField
                label="Notification Expiry Date (Optional)"
                type="date"
                value={form.expiryDate}
                onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
                InputLabelProps={{ shrink: true }}
                helperText="Expiry saved with the prototype record"
              />
            </Box>
          </Box>
        </Stack>
      </Modal>

      {/* Live Preview Modal */}
      <Modal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        title="Notification Preview"
        subtitle="How this announcement will appear to students and faculty"
        footer={
          <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ width: '100%' }}>
            <Button variant="outline" size="sm" onClick={() => setIsPreviewOpen(false)}>
              Close Preview
            </Button>
            <Button variant="primary" size="sm" icon={SendRoundedIcon} onClick={handleDispatchCommunication}>
              Confirm Simulation
            </Button>
          </Stack>
        }
      >
        <Stack spacing={2.5}>
          <Alert severity={form.priority === 'urgent' ? 'warning' : 'info'}>{formatAudienceLabel(form)} · {form.scheduledDate || 'Immediate simulation'} · Expires: {form.expiryDate || 'No expiry'} · No live delivery</Alert>
          {/* Portal Card Preview */}
          <Box>
            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
              PORTAL NOTIFICATION CARD
            </Typography>
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, mt: 0.5, bgcolor: 'background.paper' }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <Badge variant={form.priority === 'high' ? 'warning' : 'primary'}>{form.priority.toUpperCase()}</Badge>
                <Badge variant="purple">{form.category}</Badge>
                <Typography variant="caption" color="text.secondary">
                  Just now · From University Administration
                </Typography>
              </Stack>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
                {form.title || 'Broadcast Title Preview'}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                {form.message || 'Notification content will render here for recipients.'}
              </Typography>
            </Paper>
          </Box>

          {/* Mobile Push Preview */}
          <Box>
            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
              MOBILE PUSH NOTIFICATION SIMULATION
            </Typography>
            <Paper
              variant="outlined"
              sx={{
                p: 1.5,
                borderRadius: 2.5,
                mt: 0.5,
                bgcolor: 'grey.900',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
              }}
            >
              <NotificationsActiveOutlinedIcon sx={{ color: 'primary.light' }} />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="caption" sx={{ color: 'grey.400', display: 'block' }}>
                  EdunexusAI Student Portal · Now
                </Typography>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#fff' }} noWrap>
                  {form.title || 'Headline'}
                </Typography>
                <Typography variant="caption" sx={{ color: 'grey.300', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {form.message || 'Message details preview.'}
                </Typography>
              </Box>
            </Paper>
          </Box>
        </Stack>
      </Modal>
    </>
  );
};

export default AdminCommunicationCenter;

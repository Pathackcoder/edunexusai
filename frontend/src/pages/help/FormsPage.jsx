import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import AssignmentTurnedInOutlinedIcon from '@mui/icons-material/AssignmentTurnedInOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import { PageHeader } from '../../components/common/PageHeader';
import { WidgetCard } from '../../components/common/WidgetCard';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { EmptyState } from '../../components/common/EmptyState';
import { DataState } from '../../components/common/DataState';
import { useToast } from '../../components/common/Toast';
import { useApiQuery } from '../../hooks/useApiQuery';
import { workflowApi } from '../../services/api';
import { DynamicField } from '../../components/workflows/DynamicField';
import { statusTone, formatDateTime } from '../../components/workflows/status';

/** Forms & surveys published by Administration for the signed-in persona. */
export const FormsPage = () => {
  const { showToast } = useToast();
  const { data, loading, error, refetch } = useApiQuery(() => workflowApi.listForms());
  const [active, setActive] = useState(null);
  const [answers, setAnswers] = useState({});
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const forms = data?.forms ?? [];
  const submissions = data?.submissions ?? [];

  const open = (form) => {
    setActive(form);
    setAnswers({});
    setErrors({});
  };
  const submit = async (event) => {
    event.preventDefault();
    const next = {};
    for (const field of active.fields) {
      const value = answers[field.key];
      if (field.required && (value === undefined || value === '' || value === 0 || value === false)) next[field.key] = `${field.label} is required.`;
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      await workflowApi.submitForm(active.id, answers);
      showToast(active.requiresReview ? 'Submitted for review. You will be notified of the outcome.' : 'Thank you — your response was recorded.');
      setActive(null);
      refetch();
    } catch (caught) {
      setErrors({ ...caught.fieldErrors, form: caught.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <PageHeader eyebrow="Help & Support" title="Forms & Surveys" description="Forms published by university offices for you. Submissions that need approval show their review status below." />
      <DataState loading={loading} error={error} onRetry={refetch} loadingLabel="Loading forms…">
        {() => (
          <Stack spacing={2.5}>
            <WidgetCard title="Open forms" subtitle={`${forms.filter((form) => !form.submitted).length} awaiting your response`} icon={AssignmentTurnedInOutlinedIcon} tone="academic" hoverable={false}>
              {forms.length === 0 ? (
                <EmptyState compact title="No open forms" description="When an office publishes a form for you, it will appear here and in your notifications." />
              ) : (
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
                  {forms.map((form) => (
                    <Stack
                      key={form.id}
                      spacing={1}
                      sx={{ p: 2, borderRadius: 3, border: 1, borderColor: 'divider', bgcolor: 'background.subtle', transition: 'transform 220ms ease, box-shadow 220ms ease, border-color 220ms ease', '&:hover': { transform: 'translateY(-2px)', boxShadow: 2, borderColor: 'info.light' } }}
                    >
                      <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                        <Badge variant="info">{form.category}</Badge>
                        {form.requiresReview && <Badge variant="purple">Reviewed by staff</Badge>}
                        {form.submitted && <Badge variant="success" dot>Submitted</Badge>}
                      </Stack>
                      <Typography variant="subtitle1" fontWeight={700}>{form.title}</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>{form.description}</Typography>
                      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: 'text.secondary' }}>
                          <EventOutlinedIcon sx={{ fontSize: 16 }} />
                          <Typography variant="caption">{form.closesLabel} · {form.fields.length} questions</Typography>
                        </Stack>
                        <Button size="sm" variant={form.submitted ? 'outline' : 'primary'} disabled={form.submitted} onClick={() => open(form)}>
                          {form.submitted ? 'Completed' : 'Start'}
                        </Button>
                      </Stack>
                    </Stack>
                  ))}
                </Box>
              )}
            </WidgetCard>
            <WidgetCard title="My submissions" icon={FactCheckOutlinedIcon} tone="success" hoverable={false}>
              {submissions.length === 0 ? (
                <Typography variant="body2" color="text.secondary">You have not submitted any forms yet.</Typography>
              ) : (
                <Stack spacing={1}>
                  {submissions.map((submission) => (
                    <Stack key={submission.id} direction="row" alignItems="center" spacing={1.5} sx={{ p: 1.25, borderRadius: 2.5, border: 1, borderColor: 'divider' }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="subtitle2" noWrap>{submission.formTitle}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Submitted {formatDateTime(submission.submittedAt)}
                          {submission.reviewNote ? ` · ${submission.reviewNote}` : ''}
                        </Typography>
                      </Box>
                      <Badge variant={statusTone(submission.status)} dot>{submission.statusLabel}</Badge>
                    </Stack>
                  ))}
                </Stack>
              )}
            </WidgetCard>
          </Stack>
        )}
      </DataState>
      <Modal
        isOpen={Boolean(active)}
        onClose={() => setActive(null)}
        title={active?.title}
        subtitle={active?.description}
        maxWidth="620px"
        footer={<><Button variant="ghost" onClick={() => setActive(null)}>Cancel</Button><Button type="submit" form="portal-form" loading={saving}>Submit</Button></>}
      >
        {active && (
          <Stack component="form" id="portal-form" spacing={2.25} onSubmit={submit} noValidate>
            {errors.form && <Alert severity="error">{errors.form}</Alert>}
            {active.fields.map((field) => (
              <DynamicField key={field.key} field={field} value={answers[field.key]} error={errors[field.key]} onChange={(value) => setAnswers({ ...answers, [field.key]: value })} />
            ))}
          </Stack>
        )}
      </Modal>
    </Box>
  );
};

export default FormsPage;

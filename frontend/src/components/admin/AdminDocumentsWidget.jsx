import React, { useState } from 'react';
import { TextField, Alert, MenuItem, Link } from '@mui/material';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import FileUploadOutlinedIcon from '@mui/icons-material/FileUploadOutlined';
import { Modal } from '../common/Modal';
import { WidgetCard } from '../common/WidgetCard';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { DataState } from '../common/DataState';
import { useToast } from '../common/Toast';
import { useApiQuery } from '../../hooks/useApiQuery';
import { workflowApi } from '../../services/api';
import { statusTone } from '../workflows/status';

const EMPTY = { title: '', description: '', category: '', audience: 'ALL', url: '', content: '', status: 'DRAFT' };

/**
 * Resource publishing. Administrators manage institutional documents for any audience;
 * faculty (`faculty` prop) manage their own teaching resources, published to students.
 * Published resources appear for the audience in Help & Support → Resources.
 */
export const AdminDocumentsWidget = ({ faculty = false }) => {
  const { showToast } = useToast();
  const { data: docs = [], loading, error, refetch } = useApiQuery(() => workflowApi.listManagedResources(), [], { initialData: [] });
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(null);
  const [form, setForm] = useState({ ...EMPTY, category: faculty ? 'Teaching' : 'Institutional' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const publish = async (event) => {
    event.preventDefault();
    if (!form.title.trim() || (!form.content.trim() && !form.url.trim())) {
      setFormError('Add a title and either a link or the resource content.');
      return;
    }
    setSaving(true);
    try {
      await workflowApi.createResource({ ...form, url: form.url || undefined, audience: faculty ? undefined : form.audience });
      showToast(form.status === 'PUBLISHED' ? 'Resource published — your audience has been notified.' : 'Draft saved.');
      setOpen(false);
      setForm({ ...EMPTY, category: faculty ? 'Teaching' : 'Institutional' });
      setFormError('');
      refetch();
    } catch (caught) {
      setFormError(caught.message);
    } finally {
      setSaving(false);
    }
  };
  const setStatus = async (doc, status) => {
    try {
      await workflowApi.updateResource(doc.id, { status });
      showToast(status === 'PUBLISHED' ? `${doc.title} published.` : `${doc.title} ${status.toLowerCase()}.`);
      refetch();
    } catch (caught) {
      showToast(caught.message, 'error');
    }
  };

  return (
    <>
      <WidgetCard
        title={faculty ? 'Teaching resources' : 'Resource publishing & institutional documents'}
        subtitle={faculty ? 'Guides and materials you publish to your students' : 'Catalogs, policies and guides — drafts and published'}
        icon={DescriptionOutlinedIcon}
        tone="primary"
        hoverable={!faculty}
        headerAction={<Button size="sm" variant="outline" icon={FileUploadOutlinedIcon} onClick={() => setOpen(true)}>Add resource</Button>}
      >
        <DataState loading={loading} error={error} onRetry={refetch} minHeight={100}>
          {() => (
            <Stack spacing={1.25}>
              {(docs ?? []).length === 0 && <Typography color="text.secondary">{faculty ? 'No teaching resources yet. Add a lab guide or reading list for your students.' : 'No resources yet.'}</Typography>}
              {(docs ?? []).map((doc) => (
                <Box key={doc.id} sx={{ p: 1.5, borderRadius: 2.5, border: 1, borderColor: 'divider', bgcolor: 'background.subtle', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap' }}>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }} noWrap>{doc.title}</Typography>
                      <Badge variant={statusTone(doc.status)}>{doc.status}</Badge>
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      {doc.category} · {doc.fileLabel ?? 'Portal page'} · {doc.viewCount.toLocaleString()} views · {doc.updatedLabel}
                      {!faculty ? ` · ${doc.audience === 'ALL' ? 'Everyone' : doc.audience === 'STUDENT' ? 'Students' : 'Faculty'}` : ''}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={0.75}>
                    {doc.status !== 'PUBLISHED' ? (
                      <Button size="sm" onClick={() => setStatus(doc, 'PUBLISHED')} sx={{ minHeight: 28, fontSize: '0.75rem' }}>Publish</Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setStatus(doc, 'ARCHIVED')} sx={{ minHeight: 28, fontSize: '0.75rem' }}>Archive</Button>
                    )}
                    <Button size="sm" variant="outline" icon={VisibilityOutlinedIcon} onClick={() => setView(doc)} sx={{ minHeight: 28, fontSize: '0.75rem', px: 1 }}>View</Button>
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}
        </DataState>
      </WidgetCard>
      <Modal isOpen={open} onClose={() => setOpen(false)} title={faculty ? 'Add teaching resource' : 'Add portal resource'} footer={<Button type="submit" form="portal-resource" variant="primary" loading={saving}>Save resource</Button>}>
        <Stack component="form" id="portal-resource" onSubmit={publish} spacing={2}>
          {formError && <Alert severity="error">{formError}</Alert>}
          <TextField label="Resource title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <TextField label="Short description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField fullWidth label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            {!faculty && (
              <TextField fullWidth select label="Audience" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>
                <MenuItem value="ALL">Everyone</MenuItem>
                <MenuItem value="STUDENT">Students</MenuItem>
                <MenuItem value="FACULTY">Faculty</MenuItem>
              </TextField>
            )}
          </Stack>
          <TextField label="Link (optional)" placeholder="https://…" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          <TextField label="Resource content" multiline rows={5} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
          <TextField label="Publication state" select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <MenuItem value="DRAFT">Draft</MenuItem>
            <MenuItem value="PUBLISHED">Published</MenuItem>
          </TextField>
        </Stack>
      </Modal>
      <Modal isOpen={Boolean(view)} onClose={() => setView(null)} title={view?.title} subtitle={view ? `${view.status} · ${view.category}` : ''}>
        <Stack spacing={1.5}>
          {view?.description && <Typography color="text.secondary">{view.description}</Typography>}
          {view?.content && <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{view.content}</Typography>}
          {view?.url && <Link href={view.url} target="_blank" rel="noopener noreferrer">{view.url}</Link>}
        </Stack>
      </Modal>
    </>
  );
};

export default AdminDocumentsWidget;

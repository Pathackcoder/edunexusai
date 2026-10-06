import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import TextField from '@mui/material/TextField';
import Rating from '@mui/material/Rating';
import Chip from '@mui/material/Chip';
import Avatar from '@mui/material/Avatar';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Link from '@mui/material/Link';
import Autocomplete from '@mui/material/Autocomplete';
import { alpha } from '@mui/material/styles';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined';
import BusinessCenterOutlinedIcon from '@mui/icons-material/BusinessCenterOutlined';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import { PageHeader } from '../../components/common/PageHeader';
import { WidgetCard } from '../../components/common/WidgetCard';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { DataState } from '../../components/common/DataState';
import { useToast } from '../../components/common/Toast';
import { useApiQuery } from '../../hooks/useApiQuery';
import { careerApi } from '../../services/api';

const SECTIONS = [
  { key: 'skills', kind: 'SKILL', title: 'Skills', icon: PsychologyOutlinedIcon, tone: 'primary' },
  { key: 'projects', kind: 'PROJECT', title: 'Projects', icon: RocketLaunchOutlinedIcon, tone: 'purple' },
  { key: 'experience', kind: 'EXPERIENCE', title: 'Experience', icon: BusinessCenterOutlinedIcon, tone: 'info' },
  { key: 'achievements', kind: 'ACHIEVEMENT', title: 'Accomplishments', icon: EmojiEventsOutlinedIcon, tone: 'warning' },
];
const EMPTY = { title: '', subtitle: '', description: '', level: 3, tags: [], url: '', startDate: '', endDate: '' };
const range = (item) => [item.startDate, item.endDate].filter(Boolean).map((d) => new Date(d).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })).join(' – ');

/** Skills portfolio: the student's skills, projects, experience and accomplishments. */
export const PortfolioPage = () => {
  const { showToast } = useToast();
  const { data, loading, error, refetch, setData } = useApiQuery(() => careerApi.portfolio());
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const open = (kind, item = null) => {
    setEditing({ kind, id: item?.id ?? null });
    setForm(item ? { ...EMPTY, ...item, subtitle: item.subtitle ?? '', description: item.description ?? '', url: item.url ?? '', startDate: item.startDate ?? '', endDate: item.endDate ?? '' } : EMPTY);
  };
  const save = async () => {
    if (form.title.trim().length < 2) return showToast('Add a title.', 'error');
    setSaving(true);
    try {
      const payload = { ...form, kind: editing.kind };
      setData(editing.id ? await careerApi.updatePortfolioItem(editing.id, payload) : await careerApi.addPortfolioItem(payload));
      showToast('Portfolio updated.');
      setEditing(null);
    } catch (caught) {
      showToast(caught.message, 'error');
    } finally {
      setSaving(false);
    }
  };
  const remove = async (item) => {
    try {
      setData(await careerApi.deletePortfolioItem(item.id));
      showToast('Removed.');
    } catch (caught) {
      showToast(caught.message, 'error');
    }
  };

  return (
    <Box>
      <PageHeader eyebrow="Career & Community" title="Skills Portfolio" description="Showcase what you can do. Your skills also power job matching and course recommendations." />
      <DataState loading={loading} error={error} onRetry={refetch} loadingLabel="Loading your portfolio…">
        {() => (
          <Stack spacing={2.5}>
            <Card sx={(theme) => ({ p: { xs: 2.5, md: 3 }, background: `linear-gradient(120deg, ${alpha(theme.palette.secondary.main, 0.1)} 0%, ${theme.palette.background.paper} 65%)` })}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2.5} alignItems={{ sm: 'center' }}>
                <Avatar sx={{ width: 72, height: 72, fontSize: 28, bgcolor: 'secondary.main' }}>{data.owner.name.charAt(0)}</Avatar>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="h4" component="h2">{data.owner.name}</Typography>
                  <Typography color="text.secondary">{data.owner.program} · {data.owner.department}</Typography>
                  <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                    {data.owner.careerGoals.map((goal) => <Chip key={goal} size="small" color="secondary" label={goal} />)}
                    {data.owner.interests.map((interest) => <Chip key={interest} size="small" variant="outlined" label={interest} />)}
                  </Stack>
                </Box>
                <Box sx={{ minWidth: 200 }}>
                  <Typography variant="caption" color="text.secondary">Portfolio completeness</Typography>
                  <LinearProgress variant="determinate" value={data.completeness} color="secondary" sx={{ my: 0.5, height: 8 }} />
                  <Typography variant="subtitle2">{data.completeness}% · add every section to reach 100%</Typography>
                </Box>
              </Stack>
            </Card>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2 }}>
              {SECTIONS.map((section) => (
                <WidgetCard key={section.key} title={section.title} icon={section.icon} tone={section.tone} headerAction={<Button size="sm" variant="outline" icon={AddRoundedIcon} onClick={() => open(section.kind)}>Add</Button>}>
                  <Stack spacing={1.25}>
                    {data[section.key].length === 0 && <Typography color="text.secondary">Nothing added yet.</Typography>}
                    {section.kind === 'SKILL' ? (
                      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                        {data.skills.map((item) => (
                          <Stack key={item.id} direction="row" alignItems="center" spacing={1} sx={{ p: 1.25, borderRadius: 2.5, border: 1, borderColor: 'divider', bgcolor: 'background.subtle', '&:hover .row-actions': { opacity: 1 } }}>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography variant="subtitle2" noWrap>{item.title}</Typography>
                              <Rating value={item.level ?? 0} readOnly size="small" />
                            </Box>
                            <Stack direction="row" className="row-actions" sx={{ opacity: { xs: 1, md: 0 }, transition: 'opacity 160ms ease' }}>
                              <IconButton size="small" aria-label={`Edit ${item.title}`} onClick={() => open('SKILL', item)}><EditOutlinedIcon fontSize="small" /></IconButton>
                              <IconButton size="small" aria-label={`Remove ${item.title}`} onClick={() => remove(item)}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton>
                            </Stack>
                          </Stack>
                        ))}
                      </Box>
                    ) : (
                      data[section.key].map((item) => (
                        <Box key={item.id} sx={{ p: 1.5, borderRadius: 3, border: 1, borderColor: 'divider', '&:hover .row-actions': { opacity: 1 } }}>
                          <Stack direction="row" justifyContent="space-between" spacing={1}>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="subtitle2">{item.title}</Typography>
                              <Typography variant="caption" color="text.secondary">{[item.subtitle, range(item)].filter(Boolean).join(' · ')}</Typography>
                            </Box>
                            <Stack direction="row" className="row-actions" sx={{ opacity: { xs: 1, md: 0 }, transition: 'opacity 160ms ease' }}>
                              <IconButton size="small" aria-label={`Edit ${item.title}`} onClick={() => open(section.kind, item)}><EditOutlinedIcon fontSize="small" /></IconButton>
                              <IconButton size="small" aria-label={`Remove ${item.title}`} onClick={() => remove(item)}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton>
                            </Stack>
                          </Stack>
                          {item.description && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{item.description}</Typography>}
                          <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 0.75 }}>
                            {item.tags.map((tag) => <Chip key={tag} size="small" label={tag} variant="outlined" />)}
                            {item.url && <Link href={item.url} target="_blank" rel="noopener noreferrer" variant="caption">View project</Link>}
                          </Stack>
                        </Box>
                      ))
                    )}
                  </Stack>
                </WidgetCard>
              ))}
            </Box>
          </Stack>
        )}
      </DataState>
      <Modal isOpen={Boolean(editing)} onClose={() => setEditing(null)} title={`${editing?.id ? 'Edit' : 'Add'} ${SECTIONS.find((s) => s.kind === editing?.kind)?.title.toLowerCase().replace(/s$/, '') ?? 'item'}`} footer={<Button onClick={save} loading={saving}>Save</Button>}>
        <Stack spacing={2}>
          <TextField label={editing?.kind === 'SKILL' ? 'Skill' : 'Title'} required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          {editing?.kind === 'SKILL' ? (
            <Box><Typography variant="body2" gutterBottom>Proficiency</Typography><Rating value={form.level} onChange={(_, v) => setForm({ ...form, level: v ?? 1 })} /></Box>
          ) : (
            <>
              <TextField label={editing?.kind === 'EXPERIENCE' ? 'Organisation / role detail' : 'Subtitle'} value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />
              <TextField label="Description" multiline minRows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <Stack direction="row" spacing={1.5}>
                <TextField fullWidth label="Start" type="date" InputLabelProps={{ shrink: true }} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
                <TextField fullWidth label="End" type="date" InputLabelProps={{ shrink: true }} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </Stack>
              <TextField label="Link" placeholder="https://…" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            </>
          )}
          <Autocomplete multiple freeSolo options={[]} value={form.tags} onChange={(_, value) => setForm({ ...form, tags: value })} renderInput={(params) => <TextField {...params} label="Tags" placeholder="Type and press Enter" />} />
        </Stack>
      </Modal>
    </Box>
  );
};

export default PortfolioPage;

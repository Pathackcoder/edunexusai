import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import WorkOutlineRoundedIcon from '@mui/icons-material/WorkOutlineRounded';
import BookmarkBorderRoundedIcon from '@mui/icons-material/BookmarkBorderRounded';
import BookmarkRoundedIcon from '@mui/icons-material/BookmarkRounded';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import { PageHeader } from '../../components/common/PageHeader';
import { WidgetCard } from '../../components/common/WidgetCard';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { FilterChips } from '../../components/common/FilterChips';
import { DataState } from '../../components/common/DataState';
import { EmptyState } from '../../components/common/EmptyState';
import { useToast } from '../../components/common/Toast';
import { useApiQuery } from '../../hooks/useApiQuery';
import { careerApi } from '../../services/api';

/** Internship & job board, fed by the career-services adapter and ranked against the portfolio. */
export const OpportunitiesPage = () => {
  const { showToast } = useToast();
  const [type, setType] = useState('ALL');
  const [workMode, setWorkMode] = useState('ALL');
  const [search, setSearch] = useState('');
  const [view, setView] = useState('ALL');
  const [detail, setDetail] = useState(null);
  const { data, loading, error, refetch, setData } = useApiQuery(() => careerApi.opportunities({ type, workMode, search: search || undefined }), [type, workMode, search]);
  const list = (data?.opportunities ?? []).filter((item) => (view === 'SAVED' ? Boolean(item.saveStatus) : true));

  const setStatus = async (item, status) => {
    try {
      const result = await careerApi.setOpportunityStatus(item.id, status);
      setData((current) => ({ ...current, opportunities: current.opportunities.map((row) => (row.id === item.id ? { ...row, saveStatus: result.saveStatus } : row)) }));
      if (detail?.id === item.id) setDetail({ ...detail, saveStatus: result.saveStatus });
      showToast(status === 'APPLIED' ? 'Marked as applied.' : status === 'SAVED' ? 'Saved to your list.' : 'Removed from your list.');
    } catch (caught) {
      showToast(caught.message, 'error');
    }
  };

  const Card = ({ item }) => (
    <Stack spacing={1.25} onClick={() => setDetail(item)} sx={{ cursor: 'pointer', p: 2, borderRadius: 4, border: 1, borderColor: item.recommended ? 'primary.light' : 'divider', bgcolor: 'background.paper', transition: 'transform 240ms cubic-bezier(.2,.8,.2,1), box-shadow 240ms ease', '&:hover': { transform: 'translateY(-3px)', boxShadow: 3 } }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mb: 0.5 }}>
            <Badge variant={item.type === 'INTERNSHIP' ? 'purple' : 'info'}>{item.type === 'INTERNSHIP' ? 'Internship' : 'Job'}</Badge>
            <Badge variant="neutral">{item.workMode}</Badge>
            {item.recommended && <Badge variant="success">{item.relevance}% match</Badge>}
            {item.saveStatus === 'APPLIED' && <Badge variant="primary" dot>Applied</Badge>}
          </Stack>
          <Typography variant="subtitle1" fontWeight={700}>{item.title}</Typography>
          <Typography variant="body2" color="text.secondary">{item.company}</Typography>
        </Box>
        <Tooltip title={item.saveStatus ? 'Remove from saved' : 'Save'}>
          <IconButton onClick={(e) => { e.stopPropagation(); setStatus(item, item.saveStatus ? 'NONE' : 'SAVED'); }} aria-label="Save opportunity">
            {item.saveStatus ? <BookmarkRoundedIcon color="primary" /> : <BookmarkBorderRoundedIcon />}
          </IconButton>
        </Tooltip>
      </Stack>
      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: 'text.secondary' }}>
        <PlaceOutlinedIcon sx={{ fontSize: 16 }} />
        <Typography variant="caption">{item.location} · {item.compensation ?? 'Compensation not listed'}</Typography>
      </Stack>
      <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
        {item.skills.map((skill) => <Chip key={skill} size="small" label={skill} color={item.matchedSkills.includes(skill) ? 'primary' : 'default'} variant={item.matchedSkills.includes(skill) ? 'filled' : 'outlined'} />)}
      </Stack>
      <Typography variant="caption" color="text.secondary">Posted {item.postedAgo} · Apply by {item.deadlineLabel}</Typography>
    </Stack>
  );

  return (
    <Box>
      <PageHeader eyebrow="Career & Community" title="Jobs & Internships" description="Opportunities from Career Services, with the ones that match your skills portfolio highlighted." />
      <Stack spacing={2.5}>
        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.25} alignItems={{ lg: 'center' }} useFlexGap flexWrap="wrap">
          <TextField size="small" placeholder="Search title, company, field, location…" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 280, flex: 1 }} InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> }} />
          <FilterChips ariaLabel="Type" value={type} onChange={setType} options={[{ id: 'ALL', label: 'All' }, { id: 'INTERNSHIP', label: 'Internships' }, { id: 'JOB', label: 'Jobs' }]} />
          <FilterChips ariaLabel="Work mode" value={workMode} onChange={setWorkMode} options={[{ id: 'ALL', label: 'Any' }, { id: 'Remote', label: 'Remote' }, { id: 'Hybrid', label: 'Hybrid' }, { id: 'On-site', label: 'On-site' }]} />
          <FilterChips ariaLabel="List" value={view} onChange={setView} options={[{ id: 'ALL', label: 'Everything' }, { id: 'SAVED', label: `Saved & applied (${(data?.counts?.saved ?? 0) + (data?.counts?.applied ?? 0)})` }]} />
        </Stack>
        <DataState loading={loading} error={error} onRetry={refetch} loadingLabel="Loading opportunities…">
          {() => (
            <Stack spacing={2.5}>
              {data.recommended.length > 0 && view === 'ALL' && (
                <WidgetCard title="Recommended for you" subtitle="Ranked by overlap with your portfolio skills, interests and career goals" icon={AutoAwesomeRoundedIcon} tone="purple" hoverable={false}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
                    {data.recommended.slice(0, 2).map((item) => <Card key={item.id} item={item} />)}
                  </Box>
                </WidgetCard>
              )}
              {list.length === 0 ? (
                <EmptyState title="No opportunities match" description="Try another search or filter." />
              ) : (
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', xl: 'repeat(3, 1fr)' }, gap: 2 }}>
                  {list.map((item) => <Card key={item.id} item={item} />)}
                </Box>
              )}
              <Typography variant="caption" color="text.secondary"><WorkOutlineRoundedIcon sx={{ fontSize: 14, verticalAlign: 'middle' }} /> Source: {data.source.label}. Applications are completed on the employer’s site.</Typography>
            </Stack>
          )}
        </DataState>
      </Stack>
      <Modal
        isOpen={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.title}
        subtitle={detail ? `${detail.company} · ${detail.location} · ${detail.workMode}` : ''}
        maxWidth="620px"
        footer={
          detail && (
            <>
              <Button variant="ghost" onClick={() => setStatus(detail, detail.saveStatus ? 'NONE' : 'SAVED')}>{detail.saveStatus ? 'Unsave' : 'Save'}</Button>
              <Button variant="outline" onClick={() => setStatus(detail, 'APPLIED')} disabled={detail.saveStatus === 'APPLIED'}>I applied</Button>
              <Button icon={OpenInNewRoundedIcon} component="a" href={detail.applyUrl} target="_blank" rel="noopener noreferrer">Apply on employer site</Button>
            </>
          )
        }
      >
        {detail && (
          <Stack spacing={1.5}>
            <Typography>{detail.description}</Typography>
            <Typography variant="body2"><strong>Compensation:</strong> {detail.compensation ?? '—'} · <strong>Deadline:</strong> {detail.deadlineLabel} · <strong>Field:</strong> {detail.field}</Typography>
            <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">{detail.skills.map((skill) => <Chip key={skill} size="small" label={skill} color={detail.matchedSkills.includes(skill) ? 'primary' : 'default'} />)}</Stack>
            {detail.matchedSkills.length > 0 && <Typography variant="caption" color="success.main">You list {detail.matchedSkills.join(', ')} in your portfolio.</Typography>}
          </Stack>
        )}
      </Modal>
    </Box>
  );
};

export default OpportunitiesPage;

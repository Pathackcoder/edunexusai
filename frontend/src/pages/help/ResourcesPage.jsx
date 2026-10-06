import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import LibraryBooksOutlinedIcon from '@mui/icons-material/LibraryBooksOutlined';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { PageHeader } from '../../components/common/PageHeader';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Modal } from '../../components/common/Modal';
import { EmptyState } from '../../components/common/EmptyState';
import { FilterChips } from '../../components/common/FilterChips';
import { DataState } from '../../components/common/DataState';
import { IconTile } from '../../components/common/IconTile';
import { useToast } from '../../components/common/Toast';
import { useApiQuery } from '../../hooks/useApiQuery';
import { workflowApi } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { AdminDocumentsWidget } from '../../components/admin/AdminDocumentsWidget';

const TONE = { Institutional: 'primary', Compliance: 'warning', Teaching: 'success', 'IT Services': 'info', 'Faculty Affairs': 'purple' };

/** Published resources for students and faculty; faculty also manage their own here. */
export const ResourcesPage = () => {
  const { isFaculty } = useAuth();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');
  const [viewing, setViewing] = useState(null);
  const { data, loading, error, refetch } = useApiQuery(() => workflowApi.listResources({ search: search || undefined }), [search]);
  const resources = (data?.resources ?? []).filter((item) => category === 'ALL' || item.category === category);

  const open = async (resource) => {
    try {
      setViewing(await workflowApi.openResource(resource.id));
    } catch (caught) {
      showToast(caught.message, 'error');
    }
  };

  return (
    <Box>
      <PageHeader eyebrow="Help & Support" title="Resources" description="Catalogs, policies, guides and teaching materials published by the university and your instructors." />
      <Stack spacing={2.5}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
          <TextField
            size="small"
            placeholder="Search resources…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ maxWidth: 360, width: '100%' }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> }}
          />
          <FilterChips ariaLabel="Resource category" value={category} onChange={setCategory} options={[{ id: 'ALL', label: 'All' }, ...(data?.categories ?? []).map((item) => ({ id: item, label: item }))]} />
        </Stack>
        <DataState loading={loading} error={error} onRetry={refetch} loadingLabel="Loading resources…">
          {() =>
            resources.length === 0 ? (
              <EmptyState title="No resources found" description="Try a different search or category." />
            ) : (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(3, 1fr)' }, gap: 2 }}>
                {resources.map((resource) => (
                  <Stack
                    key={resource.id}
                    spacing={1.25}
                    sx={{ p: 2, borderRadius: 4, border: 1, borderColor: 'divider', bgcolor: 'background.paper', transition: 'transform 240ms cubic-bezier(.2,.8,.2,1), box-shadow 240ms ease, border-color 240ms ease', '&:hover': { transform: 'translateY(-3px)', boxShadow: 3, borderColor: 'primary.light' } }}
                  >
                    <Stack direction="row" spacing={1.25} alignItems="center">
                      <IconTile icon={LibraryBooksOutlinedIcon} tone={TONE[resource.category] ?? 'neutral'} size={38} />
                      <Box sx={{ minWidth: 0 }}>
                        <Badge variant={TONE[resource.category] ?? 'neutral'}>{resource.category}</Badge>
                      </Box>
                    </Stack>
                    <Typography variant="subtitle1" fontWeight={700}>{resource.title}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>{resource.description}</Typography>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="caption" color="text.secondary">
                        {resource.fileLabel} · {resource.updatedLabel}
                      </Typography>
                      <Button size="sm" variant="outline" icon={VisibilityOutlinedIcon} onClick={() => open(resource)}>Open</Button>
                    </Stack>
                  </Stack>
                ))}
              </Box>
            )
          }
        </DataState>
        {isFaculty && <AdminDocumentsWidget faculty />}
      </Stack>
      <Modal isOpen={Boolean(viewing)} onClose={() => setViewing(null)} title={viewing?.title} subtitle={viewing ? `${viewing.category} · ${viewing.viewCount} views${viewing.author ? ` · ${viewing.author}` : ''}` : ''}>
        {viewing && (
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">{viewing.description}</Typography>
            {viewing.content && <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', p: 2, borderRadius: 2, bgcolor: 'background.subtle' }}>{viewing.content}</Typography>}
            {viewing.url && (
              <Link href={viewing.url} target="_blank" rel="noopener noreferrer" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontWeight: 600 }}>
                Open {viewing.fileLabel ?? 'link'} <OpenInNewRoundedIcon sx={{ fontSize: 16 }} />
              </Link>
            )}
          </Stack>
        )}
      </Modal>
    </Box>
  );
};

export default ResourcesPage;

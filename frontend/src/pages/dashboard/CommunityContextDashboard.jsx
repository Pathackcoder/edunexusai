import React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import { Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { DashboardGrid, GridItem } from '../../components/common/DashboardGrid';
import { useApiQuery } from '../../hooks/useApiQuery';
import { workflowApi } from '../../services/api/workflowApi';
import { HeroBanner } from '../../components/dashboard/HeroBanner';
import { WidgetCard } from '../../components/common/WidgetCard';
import { EventsListBlock } from '../../components/cms/blocks/CmsBlocks';
import { ErrorPanel } from '../../components/common/DataState';
import { contentApi } from '../../services/api/cmsApi';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import Diversity3OutlinedIcon from '@mui/icons-material/Diversity3Outlined';

const TITLES = {
  staff: { eyebrow: 'Working', title: 'Staff', description: 'Staff news, the academic calendar, resources addressed to staff and your requests.', audience: 'STAFF', cmsAudience: 'staff' },
  alumni: { eyebrow: 'Alumni', title: 'Alumni', description: 'Alumni news, networking, mentoring, events and giving, and resources for alumni.', audience: 'ALUMNI', cmsAudience: 'alumni' },
};

function ResourcesWidget({ audience, title }) {
  const { data, loading, error } = useApiQuery(() => workflowApi.listResources(), []);
  // The server already limits resources to the person's audiences; this view keeps its own.
  const items = (data?.resources ?? []).filter((r) => r.audience === 'ALL' || r.audience === audience).slice(0, 6);
  return (
    <WidgetCard title={title} icon={FolderOpenOutlinedIcon} actionLabel="All resources" actionTo="/help/resources">
      {loading ? <Typography variant="body2" color="text.secondary">Loading…</Typography>
        : error ? <Typography variant="body2" color="text.secondary">Resources could not be loaded.</Typography>
          : items.length === 0 ? <Typography variant="body2" color="text.secondary">No resources yet.</Typography>
            : (
              <Stack spacing={0.75}>
                {items.map((r) => <Typography key={r.id} variant="body2" component={RouterLink} to="/help/resources" sx={{ color: 'text.primary' }}>{r.title}</Typography>)}
              </Stack>
            )}
    </WidgetCard>
  );
}

/** News published for this context's audience only (an alumnus who is also staff sees each in its own view). */
function ContextNews({ audience, title }) {
  const { data, loading, error, refetch } = useApiQuery(() => contentApi.announcements({ audience, limit: 5 }), [audience]);
  const items = Array.isArray(data) ? data : [];
  return (
    <WidgetCard title={title} icon={CampaignOutlinedIcon} actionLabel="All news" actionTo="/campus/news">
      {loading ? <Typography variant="body2" color="text.secondary">Loading…</Typography>
        : error ? <ErrorPanel compact error={error} onRetry={refetch} />
          : items.length === 0 ? <Typography variant="body2" color="text.secondary">No news has been published for you yet.</Typography>
            : (
              <Stack spacing={1.25}>
                {items.map((a) => (
                  <Box key={a.id}>
                    <Typography variant="subtitle2" component="h3">{a.title}</Typography>
                    {a.summary && <Typography variant="body2" color="text.secondary">{a.summary}</Typography>}
                    {a.ctaUrl && a.ctaLabel && <Typography variant="caption" component={a.ctaUrl.startsWith('/') ? RouterLink : 'a'} {...(a.ctaUrl.startsWith('/') ? { to: a.ctaUrl } : { href: a.ctaUrl, target: '_blank', rel: 'noopener noreferrer' })} sx={{ fontWeight: 600 }}>{a.ctaLabel}</Typography>}
                  </Box>
                ))}
              </Stack>
            )}
    </WidgetCard>
  );
}

/** The context's own CMS pages (networking, mentoring, events, giving…), as published in the Studio. */
function ContextPages({ audience, title }) {
  const { data, loading, error, refetch } = useApiQuery(() => contentApi.pages({ audience }), [audience]);
  const pages = Array.isArray(data) ? data : [];
  return (
    <WidgetCard title={title} icon={Diversity3OutlinedIcon}>
      {loading ? <Typography variant="body2" color="text.secondary">Loading…</Typography>
        : error ? <ErrorPanel compact error={error} onRetry={refetch} />
          : pages.length === 0 ? <Typography variant="body2" color="text.secondary">Nothing has been published here yet.</Typography>
            : (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                {pages.map((p) => (
                  <Box key={p.slug} component={RouterLink} to={`/pages/${p.slug}`} sx={{ p: 1.25, border: 1, borderColor: 'divider', borderRadius: 2.5, textDecoration: 'none', color: 'inherit', '&:hover': { borderColor: 'primary.main' } }}>
                    <Typography variant="subtitle2">{p.navLabel || p.title}</Typography>
                    {p.summary && <Typography variant="caption" color="text.secondary">{p.summary}</Typography>}
                  </Box>
                ))}
              </Box>
            )}
    </WidgetCard>
  );
}

/**
 * Dashboard of the staff and alumni contexts: only widgets that context's entitlements offer, all
 * of them institution-wide information the person may already see. No academic records.
 */
export function CommunityContextDashboard({ contextKey }) {
  const { canIn } = useAuth();
  const meta = TITLES[contextKey];
  if (!meta) return null;
  const offered = (widget) => canIn(contextKey, `${contextKey}.${widget}`);
  return (
    <Stack spacing={{ xs: 2, sm: 2.25 }}>
      <HeroBanner dense eyebrow={meta.eyebrow} title={meta.title} description={meta.description} />
      <DashboardGrid>
        {offered('announcements') && <GridItem span={{ md: 7 }}><Box sx={{ width: '100%' }}><ContextNews audience={meta.cmsAudience} title={contextKey === 'alumni' ? 'Alumni news' : 'Campus news for staff'} /></Box></GridItem>}
        {offered('community') && <GridItem span={{ md: 12 }}><Box sx={{ width: '100%' }}><ContextPages audience={meta.cmsAudience} title="Networking, mentoring, events & giving" /></Box></GridItem>}
        {offered('calendar') && <GridItem span={{ md: 5 }}><Box sx={{ width: '100%' }}><EventsListBlock title={contextKey === 'alumni' ? 'Campus events' : 'Upcoming dates'} limit={5} categories={contextKey === 'alumni' ? ['EVENT', 'ACADEMIC', 'HOLIDAY'] : null} /></Box></GridItem>}
        {offered('resources') && <GridItem span={{ md: 6 }}><Box sx={{ width: '100%' }}><ResourcesWidget audience={meta.audience} title={contextKey === 'alumni' ? 'Alumni resources' : 'Resources for staff'} /></Box></GridItem>}
        {offered('requests') && (
          <GridItem span={{ md: 6 }}><Box sx={{ width: '100%' }}>
            <WidgetCard title="My requests & help desk" icon={SupportAgentOutlinedIcon}>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Button size="small" variant="outlined" component={RouterLink} to="/help/requests">My requests</Button>
                <Button size="small" variant="outlined" component={RouterLink} to="/help/tickets">Help desk</Button>
              </Stack>
            </WidgetCard>
          </Box></GridItem>
        )}
      </DashboardGrid>
    </Stack>
  );
}

export default CommunityContextDashboard;

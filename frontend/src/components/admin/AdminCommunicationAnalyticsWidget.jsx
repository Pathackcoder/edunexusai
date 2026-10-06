import React from 'react';
import { useApiQuery } from '../../hooks/useApiQuery';
import { adminOpsApi } from '../../services/api';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import { alpha, useTheme } from '@mui/material/styles';
import AnalyticsOutlinedIcon from '@mui/icons-material/AnalyticsOutlined';
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined';
import TouchAppOutlinedIcon from '@mui/icons-material/TouchAppOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import { WidgetCard } from '../common/WidgetCard';
import { Badge } from '../common/Badge';

export const AdminCommunicationAnalyticsWidget = () => {
  const theme = useTheme();
  const { data } = useApiQuery(() => adminOpsApi.listBroadcasts());
  const broadcasts = data?.sent ?? [];
  const scheduled = data?.scheduled ?? [];
  const drafts = data?.drafts ?? [];

  // Measured from the notifications each broadcast produced.
  const recipients = broadcasts.reduce((sum, item) => sum + (item.recipients ?? 0), 0);
  const reads = broadcasts.reduce((sum, item) => sum + (item.readCount ?? 0), 0);
  const readRate = recipients ? Math.round((reads / recipients) * 1000) / 10 : 0;
  const metrics = [
    { label: 'In-app delivery', value: recipients ? '100%' : '—', progress: recipients ? 100 : 0, color: 'success.main', icon: CheckCircleOutlinedIcon },
    { label: 'Portal read rate', value: `${readRate}%`, progress: readRate, color: 'primary.main', icon: MarkEmailReadOutlinedIcon },
    { label: 'Notifications delivered', value: recipients.toLocaleString(), progress: Math.min(100, recipients), color: 'secondary.main', icon: TouchAppOutlinedIcon },
  ];

  const recentCampaigns = broadcasts.slice(0, 3).map((item) => ({ name: item.title, sent: item.recipients, delivered: item.recipients, read: item.openRate, category: item.category }));

  return (
    <WidgetCard
      title="Communication & Delivery Analytics"
      subtitle="Measured from delivered in-app notifications"
      actionLabel="Open Communication Center" actionTo="/notifications"
      icon={AnalyticsOutlinedIcon}
      tone="analytics"
      accentBorder="left"
    >
      <Stack spacing={2.5}>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap"><Badge variant="purple">{broadcasts.length} sent</Badge><Badge variant="warning">{scheduled.length} planned</Badge><Badge variant="neutral">{drafts.length} drafts</Badge></Stack>
        {/* KPI Row */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 1.5 }}>
          {metrics.map((m) => {
            const Icon = m.icon;
            return (
              <Box
                key={m.label}
                sx={{
                  p: 1.75,
                  borderRadius: 2.5,
                  bgcolor: 'background.subtle',
                  border: 1,
                  borderColor: 'divider',
                }}
              >
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                  <Icon sx={{ fontSize: 18, color: m.color }} />
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                    {m.label}
                  </Typography>
                </Stack>
                <Typography variant="h5" component="div" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {m.value}
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={m.progress}
                  sx={{
                    mt: 1.25,
                    height: 6,
                    borderRadius: 3,
                    bgcolor: alpha(theme.palette.grey[300], 0.6),
                    '& .MuiLinearProgress-bar': { bgcolor: m.color, borderRadius: 3 },
                  }}
                />
              </Box>
            );
          })}
        </Box>

        {/* Recent Campaigns Performance Table */}
        <Box>
          <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary', display: 'block', mb: 1 }}>
            Recent High-Volume Dispatches
          </Typography>
          <Stack spacing={1}>
            {recentCampaigns.map((camp, idx) => (
              <Box
                key={idx}
                sx={{
                  p: 1.25,
                  px: 1.75,
                  borderRadius: 2,
                  border: 1,
                  borderColor: 'divider',
                  bgcolor: 'background.paper',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 1.5,
                  flexWrap: 'wrap',
                }}
              >
                <Box sx={{ minWidth: 0, flex: '1 1 200px' }}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Typography variant="subtitle2" noWrap sx={{ fontWeight: 600 }}>
                      {camp.name}
                    </Typography>
                    <Badge variant={camp.category === 'finance' ? 'warning' : camp.category === 'academic' ? 'primary' : 'neutral'}>
                      {camp.category}
                    </Badge>
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {camp.sent} recipients dispatched
                  </Typography>
                </Box>

                <Stack direction="row" alignItems="center" spacing={2.5}>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Delivered
                    </Typography>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'success.main' }}>
                      {camp.delivered}
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Read Rate
                    </Typography>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'primary.main' }}>
                      {camp.read}
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            ))}
          </Stack>
        </Box>
      </Stack>
    </WidgetCard>
  );
};

export default AdminCommunicationAnalyticsWidget;

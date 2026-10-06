import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import ButtonBase from '@mui/material/ButtonBase';
import MuiButton from '@mui/material/Button';
import { alpha } from '@mui/material/styles';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import AssignmentIndOutlinedIcon from '@mui/icons-material/AssignmentIndOutlined';
import VideoCallOutlinedIcon from '@mui/icons-material/VideoCallOutlined';
import RouteRoundedIcon from '@mui/icons-material/RouteRounded';
import MilitaryTechRoundedIcon from '@mui/icons-material/MilitaryTechRounded';
import WorkOutlineRoundedIcon from '@mui/icons-material/WorkOutlineRounded';
import { WidgetCard } from '../common/WidgetCard';
import { Badge } from '../common/Badge';
import { CardFootnote } from '../common/Section';
import { ProgressRing, SERIES_COLORS } from '../charts/Charts';
import { statusTone } from '../workflows/status';

const Empty = ({ children }) => <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>{children}</Typography>;

/** Dashboard cards for the advanced features. Each summarises a full page. */
export function buildAdvancedItems({ payload, panelBody }) {
  const degree = payload('dashboard.degree_progress');
  const requests = payload('dashboard.requests');
  const advising = payload('dashboard.advising') ?? [];
  const path = payload('dashboard.learning_path');
  const achievements = payload('dashboard.achievements');
  const opportunities = payload('dashboard.opportunities') ?? [];

  return [
    {
      key: 'dashboard.degree_progress',
      label: 'Degree progress',
      span: { md: 6, lg: 4 },
      node: (
        <WidgetCard title="Degree progress" subtitle={degree?.program} icon={SchoolOutlinedIcon} tone="primary" actionLabel="Audit" actionTo="/academics/degree-progress">
          {panelBody('dashboard.degree_progress', () => (
            <>
              <Stack direction="row" spacing={2} alignItems="center">
                <ProgressRing value={degree?.percentComplete ?? 0} secondary={(degree?.projectedPercent ?? 0) - (degree?.percentComplete ?? 0)} size={104} stroke={10} sublabel="earned" />
                <Stack spacing={0.5} sx={{ minWidth: 0 }}>
                  {[
                    ['Completed', degree?.completedCredits, SERIES_COLORS[0]],
                    ['In progress', degree?.inProgressCredits, SERIES_COLORS[1]],
                    ['Remaining', degree?.remainingCredits, '#B26A00'],
                  ].map(([label, value, color]) => (
                    <Stack key={label} direction="row" spacing={1} alignItems="center">
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color }} />
                      <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>{label}</Typography>
                      <Typography variant="body2" fontWeight={700}>{value ?? 0} cr</Typography>
                    </Stack>
                  ))}
                </Stack>
              </Stack>
              <CardFootnote icon={SchoolOutlinedIcon}>{degree?.completedCredits ?? 0} of {degree?.totalRequired ?? 0} credits toward graduation</CardFootnote>
            </>
          ))}
        </WidgetCard>
      ),
    },
    {
      key: 'dashboard.requests',
      label: 'My requests & tickets',
      span: { md: 6, lg: 4 },
      node: (
        <WidgetCard title="My requests" subtitle={`${requests?.summary?.open ?? 0} open · ${requests?.openTickets ?? 0} help desk ticket(s)`} icon={AssignmentIndOutlinedIcon} tone="warning" actionLabel="All" actionTo="/help/requests">
          {panelBody('dashboard.requests', () => (
            <>
              {(requests?.summary?.needsInfo > 0 || requests?.awaitingReply > 0) && (
                <Box sx={{ mb: 1.5, p: 1.25, borderRadius: 2.5, bgcolor: 'error.lighter', color: 'error.dark' }}>
                  <Typography variant="body2" fontWeight={600}>
                    {requests.summary.needsInfo > 0 ? `${requests.summary.needsInfo} request(s) need your information` : ''}
                    {requests.summary.needsInfo > 0 && requests.awaitingReply > 0 ? ' · ' : ''}
                    {requests.awaitingReply > 0 ? `${requests.awaitingReply} ticket(s) await your reply` : ''}
                  </Typography>
                </Box>
              )}
              <Stack spacing={1} sx={{ mb: 1.5 }}>
                {(requests?.recent ?? []).length === 0 && <Empty>No requests yet.</Empty>}
                {(requests?.recent ?? []).map((item) => (
                  <ButtonBase key={item.id} component={RouterLink} to={`/help/requests?request=${item.id}`} sx={{ display: 'flex', gap: 1, p: 1.25, borderRadius: 2.5, border: 1, borderColor: 'divider', textAlign: 'left', '&:hover': { bgcolor: 'background.subtle' } }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle2" noWrap>{item.title}</Typography>
                      <Typography variant="caption" color="text.secondary">{item.reference}</Typography>
                    </Box>
                    <Badge variant={statusTone(item.status)} dot>{item.statusLabel}</Badge>
                  </ButtonBase>
                ))}
              </Stack>
              <Stack direction="row" spacing={1} sx={{ mt: 'auto' }}>
                <MuiButton size="small" variant="contained" component={RouterLink} to="/help/requests?new=1">New request</MuiButton>
                <MuiButton size="small" component={RouterLink} to="/help/tickets?new=1">Get help</MuiButton>
              </Stack>
            </>
          ))}
        </WidgetCard>
      ),
    },
    {
      key: 'dashboard.advising',
      label: 'Advising',
      span: { md: 6, lg: 4 },
      node: (
        <WidgetCard title="Advising" subtitle="Your next appointment" icon={VideoCallOutlinedIcon} tone="purple" actionLabel="Book" actionTo="/academics/advising">
          {panelBody('dashboard.advising', () =>
            advising.length === 0 ? (
              <Stack spacing={1.5} sx={{ py: 1 }}>
                <Typography variant="body2" color="text.secondary">No upcoming appointment. Meet your advisor virtually to plan next term.</Typography>
                <Box><MuiButton size="small" variant="contained" component={RouterLink} to="/academics/advising">Book a time</MuiButton></Box>
              </Stack>
            ) : (
              <Stack spacing={1.25}>
                {advising.map((appt) => (
                  <Box key={appt.id} sx={(theme) => ({ p: 1.5, borderRadius: 3, background: `linear-gradient(135deg, ${alpha(theme.palette.secondary.main, 0.1)}, transparent)`, border: 1, borderColor: alpha(theme.palette.secondary.main, 0.2) })}>
                    <Typography variant="subtitle2">{new Date(appt.startsAt).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</Typography>
                    <Typography variant="body2" color="text.secondary">{appt.topic} · {appt.advisor.name}</Typography>
                    {appt.meetingUrl && <MuiButton size="small" href={appt.meetingUrl} target="_blank" rel="noopener noreferrer" sx={{ mt: 0.5, px: 0 }}>Join virtual meeting</MuiButton>}
                  </Box>
                ))}
              </Stack>
            ),
          )}
        </WidgetCard>
      ),
    },
    {
      key: 'dashboard.learning_path',
      label: 'Learning path',
      span: { md: 6, lg: 4 },
      node: (
        <WidgetCard title="Learning path" subtitle={path?.title ?? 'Choose a path'} icon={RouteRoundedIcon} tone="academic" actionLabel="Open" actionTo="/academics/learning-path">
          {panelBody('dashboard.learning_path', () =>
            !path ? (
              <Empty>Pick a learning path aligned with your career goal.</Empty>
            ) : (
              <>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
                  <Typography variant="caption">Stage: <strong>{path.currentStage}</strong></Typography>
                  <Typography variant="caption" fontWeight={700}>{path.completedSteps}/{path.totalSteps} steps</Typography>
                </Stack>
                <LinearProgress variant="determinate" value={path.progress} color="info" sx={{ height: 8 }} />
                {path.nextStep && (
                  <Box sx={{ mt: 2, p: 1.25, borderRadius: 2.5, bgcolor: 'info.lighter' }}>
                    <Typography variant="caption" color="info.dark" fontWeight={700}>Up next</Typography>
                    <Typography variant="subtitle2">{path.nextStep.title}</Typography>
                  </Box>
                )}
                {!path.isActive && <CardFootnote>Suggested from your career goals</CardFootnote>}
              </>
            ),
          )}
        </WidgetCard>
      ),
    },
    {
      key: 'dashboard.achievements',
      label: 'Achievements',
      span: { md: 6, lg: 4 },
      node: (
        <WidgetCard title="Achievements" subtitle={achievements ? `Level ${achievements.level.index} · ${achievements.level.name}` : ''} icon={MilitaryTechRoundedIcon} tone="warning" actionLabel="Badges" actionTo="/career/achievements">
          {panelBody('dashboard.achievements', () => (
            <>
              <Stack direction="row" alignItems="baseline" spacing={1}>
                <Typography variant="metric" sx={{ fontSize: '1.875rem', color: 'warning.dark' }}>{achievements?.points ?? 0}</Typography>
                <Typography variant="body2" color="text.secondary">points · {achievements?.earned ?? 0}/{achievements?.total ?? 0} badges</Typography>
              </Stack>
              <LinearProgress variant="determinate" value={achievements?.level?.progress ?? 0} color="warning" sx={{ my: 1.5 }} />
              <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                {(achievements?.recent ?? []).map((badge) => <Badge key={badge.key} variant={badge.tone}>{badge.title}</Badge>)}
              </Stack>
              {achievements?.next && <CardFootnote>Next: {achievements.next.title} ({achievements.next.progress}%)</CardFootnote>}
            </>
          ))}
        </WidgetCard>
      ),
    },
    {
      key: 'dashboard.opportunities',
      label: 'Opportunities',
      span: { md: 6, lg: 4 },
      node: (
        <WidgetCard title="Opportunities for you" subtitle="Matched to your skills portfolio" icon={WorkOutlineRoundedIcon} tone="success" actionLabel="Browse" actionTo="/career/opportunities">
          {panelBody('dashboard.opportunities', () => (
            <Stack spacing={1}>
              {opportunities.length === 0 && <Empty>Add skills to your portfolio to get matches.</Empty>}
              {opportunities.map((item) => (
                <Stack key={item.id} direction="row" spacing={1} alignItems="center" sx={{ p: 1.25, borderRadius: 2.5, border: 1, borderColor: 'divider' }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" noWrap>{item.title}</Typography>
                    <Typography variant="caption" color="text.secondary">{item.company} · {item.workMode}</Typography>
                  </Box>
                  <Badge variant="success">{item.relevance}%</Badge>
                </Stack>
              ))}
            </Stack>
          ))}
        </WidgetCard>
      ),
    },
  ];
}

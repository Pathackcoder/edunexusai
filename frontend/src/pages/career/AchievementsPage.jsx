import React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import LinearProgress from '@mui/material/LinearProgress';
import { alpha, useTheme } from '@mui/material/styles';
import MilitaryTechRoundedIcon from '@mui/icons-material/MilitaryTechRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import WorkspacePremiumRoundedIcon from '@mui/icons-material/WorkspacePremiumRounded';
import FlagRoundedIcon from '@mui/icons-material/FlagRounded';
import { PageHeader } from '../../components/common/PageHeader';
import { WidgetCard } from '../../components/common/WidgetCard';
import { Badge } from '../../components/common/Badge';
import { DataState } from '../../components/common/DataState';
import { useApiQuery } from '../../hooks/useApiQuery';
import { careerApi } from '../../services/api';
import { getTone } from '../../theme/tones';

/** Badges, milestones and level — all derived from the student's own activity. */
export const AchievementsPage = () => {
  const theme = useTheme();
  const { data, loading, error, refetch } = useApiQuery(() => careerApi.achievements());
  return (
    <Box>
      <PageHeader eyebrow="Career & Community" title="Achievements" description="Milestones you have reached across academics, community and career. Earned automatically from your portal activity." />
      <DataState loading={loading} error={error} onRetry={refetch} loadingLabel="Loading achievements…">
        {() => (
          <Stack spacing={2.5}>
            <Card sx={{ p: { xs: 2.5, md: 3 }, background: `linear-gradient(120deg, ${alpha(theme.palette.warning.main, 0.1)} 0%, ${theme.palette.background.paper} 60%)` }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} alignItems={{ sm: 'center' }}>
                <Box sx={{ width: 84, height: 84, borderRadius: '24px', display: 'grid', placeItems: 'center', bgcolor: 'warning.lighter', color: 'warning.dark', border: 2, borderColor: alpha(theme.palette.warning.main, 0.3) }}>
                  <WorkspacePremiumRoundedIcon sx={{ fontSize: 46 }} />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="overline" color="text.secondary">Level {data.level.index}</Typography>
                  <Typography variant="h4" component="h2">{data.level.name}</Typography>
                  <Typography color="text.secondary">{data.points} points · {data.earned} of {data.total} badges earned</Typography>
                  {data.level.nextAt && (
                    <Box sx={{ mt: 1.25, maxWidth: 420 }}>
                      <LinearProgress variant="determinate" value={data.level.progress} color="warning" sx={{ height: 8 }} />
                      <Typography variant="caption" color="text.secondary">{data.level.nextAt - data.points} points to the next level</Typography>
                    </Box>
                  )}
                </Box>
              </Stack>
            </Card>
            {data.nextMilestones.length > 0 && (
              <WidgetCard title="Next milestones" icon={FlagRoundedIcon} tone="primary" hoverable={false}>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 1.5 }}>
                  {data.nextMilestones.map((badge) => (
                    <Box key={badge.key} sx={{ p: 1.5, borderRadius: 3, border: 1, borderColor: 'divider' }}>
                      <Typography variant="subtitle2">{badge.title}</Typography>
                      <Typography variant="caption" color="text.secondary">{badge.description}</Typography>
                      <LinearProgress variant="determinate" value={badge.progress} sx={{ mt: 1 }} />
                      <Typography variant="caption" color="text.secondary">{badge.current} / {badge.target}</Typography>
                    </Box>
                  ))}
                </Box>
              </WidgetCard>
            )}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, 1fr)', xl: 'repeat(4, 1fr)' }, gap: 2 }}>
              {data.badges.map((badge) => {
                const tone = getTone(theme, badge.tone);
                return (
                  <Stack key={badge.key} alignItems="center" spacing={1} sx={{ p: 2.25, textAlign: 'center', borderRadius: 4, border: 1, borderColor: badge.earned ? tone.border : 'divider', bgcolor: badge.earned ? 'background.paper' : 'background.subtle', opacity: badge.earned ? 1 : 0.75, transition: 'transform 240ms cubic-bezier(.2,.8,.2,1), box-shadow 240ms ease', '&:hover': { transform: 'translateY(-3px)', boxShadow: 2 } }}>
                    <Box sx={{ width: 56, height: 56, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: badge.earned ? tone.bg : 'grey.100', color: badge.earned ? tone.solid : 'grey.400', border: `2px solid ${badge.earned ? tone.border : 'transparent'}` }}>
                      {badge.earned ? <MilitaryTechRoundedIcon sx={{ fontSize: 30 }} /> : <LockOutlinedIcon />}
                    </Box>
                    <Typography variant="subtitle2">{badge.title}</Typography>
                    <Typography variant="caption" color="text.secondary">{badge.description}</Typography>
                    {badge.earned ? <Badge variant={badge.tone}>+{badge.points} pts</Badge> : <Typography variant="caption" color="text.secondary">{badge.progress}% there</Typography>}
                  </Stack>
                );
              })}
            </Box>
          </Stack>
        )}
      </DataState>
    </Box>
  );
};

export default AchievementsPage;

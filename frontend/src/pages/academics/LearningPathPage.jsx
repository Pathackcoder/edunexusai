import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import LinearProgress from '@mui/material/LinearProgress';
import ButtonBase from '@mui/material/ButtonBase';
import Link from '@mui/material/Link';
import Tooltip from '@mui/material/Tooltip';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import RadioButtonUncheckedRoundedIcon from '@mui/icons-material/RadioButtonUncheckedRounded';
import TimelapseRoundedIcon from '@mui/icons-material/TimelapseRounded';
import RouteRoundedIcon from '@mui/icons-material/RouteRounded';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import BuildCircleOutlinedIcon from '@mui/icons-material/BuildCircleOutlined';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import { PageHeader } from '../../components/common/PageHeader';
import { WidgetCard } from '../../components/common/WidgetCard';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { DataState } from '../../components/common/DataState';
import { useToast } from '../../components/common/Toast';
import { useApiQuery } from '../../hooks/useApiQuery';
import { planningApi } from '../../services/api';

const KIND = { COURSE: { icon: MenuBookOutlinedIcon, label: 'Course' }, RESOURCE: { icon: LinkRoundedIcon, label: 'Resource' }, SKILL: { icon: BuildCircleOutlinedIcon, label: 'Skill' }, MILESTONE: { icon: FlagOutlinedIcon, label: 'Milestone' } };
const NEXT = { NOT_STARTED: 'IN_PROGRESS', IN_PROGRESS: 'COMPLETED', COMPLETED: 'NOT_STARTED' };

/** Career-aligned learning paths; course steps track themselves from the transcript. */
export const LearningPathPage = () => {
  const { showToast } = useToast();
  const { data, loading, error, refetch, setData } = useApiQuery(() => planningApi.learningPaths());
  const [selectedId, setSelectedId] = useState(null);
  const paths = data?.paths ?? [];
  const path = paths.find((item) => item.id === selectedId) ?? paths[0];

  const activate = async () => {
    try {
      setData(await planningApi.activatePath(path.id));
      showToast(`${path.title} is now your active path.`);
    } catch (caught) {
      showToast(caught.message, 'error');
    }
  };
  const cycle = async (step) => {
    if (step.autoTracked) return;
    try {
      setData(await planningApi.setStepStatus(step.id, NEXT[step.status]));
    } catch (caught) {
      showToast(caught.message, 'error');
    }
  };

  return (
    <Box>
      <PageHeader eyebrow="Academics" title="Learning Path" description="A step-by-step route to your career goal: courses, skills, resources and milestones. Course steps update from your transcript automatically." />
      <DataState loading={loading} error={error} onRetry={refetch} loadingLabel="Loading learning paths…">
        {() => (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '300px minmax(0, 1fr)' }, gap: 2, alignItems: 'start' }}>
            {/* Path picker keeps its natural height and stays in view beside the long step list. */}
            <Stack spacing={1.25} sx={{ position: { lg: 'sticky' }, top: { lg: 74 }, alignSelf: 'start' }}>
              {paths.map((item) => (
                <ButtonBase key={item.id} onClick={() => setSelectedId(item.id)} sx={{ display: 'block', textAlign: 'left', p: 1.75, borderRadius: 3, border: 2, borderColor: item.id === path?.id ? 'primary.main' : 'divider', bgcolor: 'background.paper', transition: 'transform 200ms ease, box-shadow 200ms ease', '&:hover': { transform: 'translateY(-2px)', boxShadow: 2 } }}>
                  <Stack direction="row" spacing={0.75} sx={{ mb: 0.5 }}>
                    {item.isActive && <Badge variant="primary" dot>Active</Badge>}
                    {item.recommended && !item.isActive && <Badge variant="purple">Matches your goals</Badge>}
                  </Stack>
                  <Typography variant="subtitle1" fontWeight={700}>{item.title}</Typography>
                  <Typography variant="caption" color="text.secondary">{item.completedSteps}/{item.totalSteps} steps · {item.currentStage}</Typography>
                  <LinearProgress variant="determinate" value={item.progress} sx={{ mt: 1 }} />
                </ButtonBase>
              ))}
            </Stack>
            {path && (
              <WidgetCard title={path.title} subtitle={path.description} icon={RouteRoundedIcon} tone="academic" hoverable={false} headerAction={path.isActive ? <Badge variant="success" dot>Your active path</Badge> : <Button size="sm" onClick={activate}>Follow this path</Button>}>
                <Stack spacing={2.5}>
                  <Box>
                    <Stack direction="row" justifyContent="space-between"><Typography variant="body2" color="text.secondary">Current stage: <strong>{path.currentStage}</strong></Typography><Typography variant="body2" fontWeight={700}>{path.progress}%</Typography></Stack>
                    <LinearProgress variant="determinate" value={path.progress} sx={{ mt: 0.75, height: 10 }} />
                  </Box>
                  {path.stages.map((stage) => (
                    <Box key={stage}>
                      <Typography variant="overline" color="text.secondary">{stage}</Typography>
                      <Stack spacing={1} sx={{ mt: 0.5 }}>
                        {path.steps.filter((step) => step.stage === stage).map((step) => {
                          const Kind = KIND[step.kind] ?? KIND.MILESTONE;
                          const StatusIcon = step.status === 'COMPLETED' ? CheckCircleRoundedIcon : step.status === 'IN_PROGRESS' ? TimelapseRoundedIcon : RadioButtonUncheckedRoundedIcon;
                          return (
                            <Stack key={step.id} direction="row" spacing={1.5} alignItems="flex-start" sx={{ p: 1.5, borderRadius: 3, border: 1, borderColor: step.status === 'IN_PROGRESS' ? 'info.light' : 'divider', bgcolor: step.status === 'COMPLETED' ? 'success.lighter' : 'background.subtle' }}>
                              <Tooltip title={step.autoTracked ? 'Tracked from your transcript' : 'Click to update status'}>
                                <ButtonBase onClick={() => cycle(step)} sx={{ borderRadius: '50%', mt: 0.25 }} aria-label={`Status: ${step.status}`}>
                                  <StatusIcon sx={{ color: step.status === 'COMPLETED' ? 'success.main' : step.status === 'IN_PROGRESS' ? 'info.main' : 'grey.400' }} />
                                </ButtonBase>
                              </Tooltip>
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                                  <Kind.icon sx={{ fontSize: 16, color: 'text.secondary' }} />
                                  <Typography variant="subtitle2">{step.title}</Typography>
                                  {step.courseCode && <Badge variant="info">{step.courseCode}</Badge>}
                                  {step.autoTracked && <Badge variant="neutral">Auto</Badge>}
                                </Stack>
                                {step.description && <Typography variant="body2" color="text.secondary">{step.description}</Typography>}
                                <Typography variant="caption" color="text.secondary">{Kind.label}{step.estimatedHours ? ` · ~${step.estimatedHours} h` : ''}</Typography>
                                {step.resourceUrl && <Link href={step.resourceUrl} target="_blank" rel="noopener noreferrer" variant="caption" sx={{ ml: 1 }}>Open resource</Link>}
                              </Box>
                            </Stack>
                          );
                        })}
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              </WidgetCard>
            )}
          </Box>
        )}
      </DataState>
    </Box>
  );
};

export default LearningPathPage;

import React, { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import WorkOutlineRoundedIcon from '@mui/icons-material/WorkOutlineRounded';
import FavoriteBorderRoundedIcon from '@mui/icons-material/FavoriteBorderRounded';
import HistoryEduRoundedIcon from '@mui/icons-material/HistoryEduRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { PageHeader } from '../../components/common/PageHeader';
import { WidgetCard } from '../../components/common/WidgetCard';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { DataState } from '../../components/common/DataState';
import { useToast } from '../../components/common/Toast';
import { useApiQuery } from '../../hooks/useApiQuery';
import { planningApi } from '../../services/api';

const REASON_ICON = { degree: SchoolOutlinedIcon, career: WorkOutlineRoundedIcon, interest: FavoriteBorderRoundedIcon, history: HistoryEduRoundedIcon, prerequisite: LockOutlinedIcon };

/** Personalised course recommendations with the reasons behind each one. */
export const RecommendationsPage = () => {
  const { showToast } = useToast();
  const { data, loading, error, refetch, setData } = useApiQuery(() => planningApi.recommendations());
  const [prefs, setPrefs] = useState({ interests: [], careerGoals: [] });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (data?.profile) setPrefs({ interests: data.profile.interests, careerGoals: data.profile.careerGoals });
  }, [data?.profile]);

  const save = async () => {
    setSaving(true);
    try {
      setData(await planningApi.savePreferences(prefs));
      showToast('Preferences saved — recommendations updated.');
    } catch (caught) {
      showToast(caught.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <PageHeader eyebrow="Academics" title="Course Recommendations" description="Suggestions ranked from your academic history, remaining degree requirements, interests and career goals." />
      <DataState loading={loading} error={error} onRetry={refetch} loadingLabel="Finding courses for you…">
        {() => (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '320px minmax(0, 1fr)' }, gap: 2, alignItems: 'start' }}>
            {/* Side panel keeps its natural height and stays in view while the list scrolls. */}
            <Box sx={{ position: { lg: 'sticky' }, top: { lg: 74 }, alignSelf: 'start' }}>
            <WidgetCard title="Your goals" subtitle="Tune what the recommendations optimise for" icon={TuneRoundedIcon} tone="purple" hoverable={false}>
              <Stack spacing={2}>
                <Autocomplete multiple freeSolo options={data.options.interests} value={prefs.interests} onChange={(_, value) => setPrefs({ ...prefs, interests: value })} renderInput={(params) => <TextField {...params} label="Interests" placeholder="Add a topic" />} />
                <Autocomplete multiple freeSolo options={data.options.careerGoals} value={prefs.careerGoals} onChange={(_, value) => setPrefs({ ...prefs, careerGoals: value })} renderInput={(params) => <TextField {...params} label="Career goals" placeholder="Add a role" />} />
                <Button onClick={save} loading={saving}>Update recommendations</Button>
                <Box sx={{ p: 1.5, borderRadius: 2.5, bgcolor: 'background.subtle', border: 1, borderColor: 'divider' }}>
                  <Typography variant="caption" color="text.secondary" display="block">Signals used</Typography>
                  <Typography variant="body2">{data.signals.completedCourses} completed courses · strengths in {data.signals.strongTopics.slice(0, 3).join(', ') || '—'}</Typography>
                  <Typography variant="body2">Remaining: {data.signals.remainingRequirements.join(', ') || 'none'}</Typography>
                </Box>
                <Alert severity="info" icon={<AutoAwesomeRoundedIcon />}>{data.provider.label}. Each suggestion shows why it was made; ranking can be switched to an AI model without changing this page.</Alert>
              </Stack>
            </WidgetCard>
            </Box>
            <Stack spacing={1.5}>
              {data.recommendations.length === 0 && <Alert severity="info">Add interests or career goals to get recommendations.</Alert>}
              {data.recommendations.map((course, index) => (
                <Box
                  key={course.code}
                  sx={{ p: 2.25, borderRadius: 4, border: 1, borderColor: index === 0 ? 'primary.light' : 'divider', bgcolor: 'background.paper', transition: 'transform 240ms cubic-bezier(.2,.8,.2,1), box-shadow 240ms ease', '&:hover': { transform: 'translateY(-3px)', boxShadow: 3 } }}
                >
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'flex-start' }}>
                    <Box sx={{ minWidth: 72, textAlign: 'center', p: 1, borderRadius: 3, bgcolor: 'primary.lighter', color: 'primary.dark' }}>
                      <Typography variant="metric" sx={{ fontSize: '1.5rem', lineHeight: 1 }}>{course.match}%</Typography>
                      <Typography variant="caption" display="block">match</Typography>
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                        <Typography variant="overline" color="primary.main">{course.code}</Typography>
                        <Badge variant="neutral">{course.credits} credits</Badge>
                        <Badge variant="info">{course.termsOffered.join(' / ')}</Badge>
                        {!course.eligible && <Badge variant="warning">Prerequisite needed</Badge>}
                        {index === 0 && <Badge variant="purple">Top pick</Badge>}
                      </Stack>
                      <Typography variant="h6">{course.title}</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{course.description}</Typography>
                      <Stack spacing={0.5} sx={{ mt: 1.25 }}>
                        {course.reasons.map((reason) => {
                          const Icon = REASON_ICON[reason.kind] ?? AutoAwesomeRoundedIcon;
                          return (
                            <Stack key={reason.text} direction="row" spacing={0.75} alignItems="center">
                              <Icon sx={{ fontSize: 16, color: reason.kind === 'prerequisite' ? 'warning.main' : 'success.main' }} />
                              <Typography variant="body2">{reason.text}</Typography>
                            </Stack>
                          );
                        })}
                      </Stack>
                      <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 1.25 }}>
                        {course.topics.map((topic) => <Chip key={topic} size="small" label={topic} variant="outlined" />)}
                      </Stack>
                    </Box>
                  </Stack>
                </Box>
              ))}
            </Stack>
          </Box>
        )}
      </DataState>
    </Box>
  );
};

export default RecommendationsPage;

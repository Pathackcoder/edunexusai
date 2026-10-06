import React, { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Switch from '@mui/material/Switch';
import Chip from '@mui/material/Chip';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { Button } from '../common/Button';
import { WidgetCard } from '../common/WidgetCard';
import { useToast } from '../common/Toast';

const PRONOUN_OPTIONS = ['He / Him', 'She / Her', 'They / Them', 'Prefer not to say', 'Custom'];

/** Map a stored value such as "he/him" onto one of the presented options. */
const matchOption = (stored) => {
  if (!stored) return 'They / Them';
  const normalised = stored.replace(/\s*\/\s*/g, ' / ').toLowerCase();
  return (
    PRONOUN_OPTIONS.find((option) => option.toLowerCase() === normalised) ?? 'Custom'
  );
};

/**
 * Pronouns and directory visibility. These are fields on the student record, so the
 * values come in as props and the save goes through the page's API call. The prototype
 * kept them in localStorage, which meant no faculty member could ever see them.
 */
export const PronounsPrivacySection = ({ profile, onSave, isSaving: savingProp = false }) => {
  const { showToast } = useToast();
  const storedPronouns = profile?.pronouns ?? '';
  const [selectedPronoun, setSelectedPronoun] = useState(() => matchOption(storedPronouns));
  const [customPronoun, setCustomPronoun] = useState(() =>
    matchOption(storedPronouns) === 'Custom' ? storedPronouns : '',
  );
  const [shareWithFaculty, setShareWithFaculty] = useState(
    () => profile?.directoryVisible !== false,
  );
  const [isSaving, setIsSaving] = useState(false);

  // Re-sync when the profile arrives or changes after a save.
  useEffect(() => {
    const option = matchOption(profile?.pronouns ?? '');
    setSelectedPronoun(option);
    setCustomPronoun(option === 'Custom' ? (profile?.pronouns ?? '') : '');
    setShareWithFaculty(profile?.directoryVisible !== false);
  }, [profile?.pronouns, profile?.directoryVisible]);

  const pronounOptions = PRONOUN_OPTIONS;

  const handleSave = async (e) => {
    e.preventDefault();
    const finalPronoun = selectedPronoun === 'Custom' ? customPronoun.trim() : selectedPronoun;
    if (selectedPronoun === 'Custom' && !finalPronoun) {
      showToast('Enter your pronouns before saving.');
      return;
    }

    setIsSaving(true);
    try {
      if (onSave) {
        await onSave({
          pronouns: finalPronoun,
          directoryVisible: shareWithFaculty,
          pronounsVisibility: shareWithFaculty
            ? 'Faculty & Advisors Only'
            : 'Private (Not shared)',
        });
      } else {
        showToast('No save handler is configured for this section.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Box component="form" onSubmit={handleSave}>
      <Stack spacing={2.5}>
        <WidgetCard
          title="Personal Pronoun Selection"
          subtitle="Specify how you prefer to be referred to within university communications and academic records."
          icon={BadgeOutlinedIcon}
          tone="purple"
        >
          <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1} role="radiogroup" aria-label="Pronouns">
            {pronounOptions.map(option => {
              const isSelected = selectedPronoun === option;
              return (
                <Chip
                  key={option}
                  role="radio"
                  aria-checked={isSelected}
                  clickable
                  onClick={() => setSelectedPronoun(option)}
                  icon={isSelected ? <CheckRoundedIcon /> : undefined}
                  label={option}
                  variant={isSelected ? 'filled' : 'outlined'}
                  color={isSelected ? 'primary' : 'default'}
                  sx={{
                    height: 36,
                    px: 0.5,
                    fontSize: '0.8125rem',
                    borderRadius: 999,
                    ...(isSelected ? {} : { borderColor: 'divider', color: 'text.secondary', '&:hover': { borderColor: 'grey.300', color: 'text.primary' } }),
                  }}
                />
              );
            })}
          </Stack>

          {selectedPronoun === 'Custom' && (
            <TextField
              label="Enter custom pronouns"
              type="text"
              placeholder="e.g. Ze / Zir"
              value={customPronoun}
              onChange={(e) => setCustomPronoun(e.target.value)}
              required
              sx={{ mt: 2.25, maxWidth: 340 }}
            />
          )}
        </WidgetCard>

        <WidgetCard
          title="Faculty & Advisor Sharing Privacy"
          subtitle="Control who within the university can view your selected pronouns."
          icon={ShieldOutlinedIcon}
          tone="success"
        >
          <Stack
            component="label"
            direction="row"
            alignItems="flex-start"
            justifyContent="space-between"
            spacing={2}
            sx={{ p: 2, bgcolor: 'background.subtle', borderRadius: 3, border: 1, borderColor: 'divider', cursor: 'pointer' }}
          >
            <Box>
              <Typography variant="subtitle2">Share with faculty and relevant university staff</Typography>
              <Typography variant="caption" component="p" sx={{ mt: 0.25 }}>
                When enabled, your pronouns will appear beside your name on instructor Canvas course rosters and in the Academic Advising scheduling system.
              </Typography>
            </Box>
            <Switch checked={shareWithFaculty} onChange={(e) => setShareWithFaculty(e.target.checked)} sx={{ flexShrink: 0, mt: -0.5 }} />
          </Stack>

          <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2.25 }}>
            <Button type="submit" variant="primary" icon={SaveOutlinedIcon} loading={isSaving || savingProp}>
              Save Preferences
            </Button>
          </Stack>
        </WidgetCard>
      </Stack>
    </Box>
  );
};

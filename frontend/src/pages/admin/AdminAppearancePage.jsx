import React, { useEffect, useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ButtonBase from '@mui/material/ButtonBase';
import MuiButton from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Card from '@mui/material/Card';
import LinearProgress from '@mui/material/LinearProgress';
import { ThemeProvider } from '@mui/material/styles';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import TextFieldsRoundedIcon from '@mui/icons-material/TextFieldsRounded';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import { PageHeader } from '../../components/common/PageHeader';
import { WidgetCard } from '../../components/common/WidgetCard';
import { useToast } from '../../components/common/Toast';
import { useAppearance } from '../../context/AppearanceContext';
import { appearanceApi } from '../../services/api';
import { createPortalTheme } from '../../theme/theme';
import { APPEARANCE_FONTS, APPEARANCE_THEMES, DEFAULT_FONT_KEY, DEFAULT_THEME_KEY, RETIRED_THEMES } from '../../../../shared/appearancePresets.js';
import Alert from '@mui/material/Alert';

/** A selectable preset card (radio semantics). */
function OptionCard({ selected, onSelect, label, description, children }) {
  return (
    <ButtonBase
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      sx={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        textAlign: 'left',
        p: 1.25,
        borderRadius: 3,
        border: 2,
        borderColor: selected ? 'primary.main' : 'divider',
        bgcolor: 'background.paper',
        boxShadow: selected ? 3 : 0,
        transition: 'border-color 200ms ease, box-shadow 200ms ease, transform 200ms ease',
        '&:hover': { borderColor: selected ? 'primary.main' : 'grey.300', transform: 'translateY(-2px)' },
        '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
      }}
    >
      {children}
      <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mt: 1.25, px: 0.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2">{label}</Typography>
          <Typography variant="caption" component="p">{description}</Typography>
        </Box>
        {selected && <CheckCircleRoundedIcon color="primary" fontSize="small" />}
      </Stack>
    </ButtonBase>
  );
}

/** Miniature portal in a theme's palette: navigation rail, header, card and button. */
function ThemeSwatch({ preset }) {
  const { palette, nav, accent } = preset;
  return (
    <Box aria-hidden sx={{ display: 'flex', height: 92, borderRadius: 2, overflow: 'hidden', border: 1, borderColor: palette.divider, bgcolor: palette.background.default }}>
      <Box sx={{ width: 34, background: `linear-gradient(160deg, ${nav.from}, ${nav.via} 48%, ${nav.to})`, p: 0.75, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        <Box sx={{ height: 6, borderRadius: 1, bgcolor: accent }} />
        {[0.5, 0.3, 0.3].map((o, i) => <Box key={i} sx={{ height: 5, borderRadius: 1, bgcolor: `rgba(255,255,255,${o})` }} />)}
      </Box>
      <Box sx={{ flex: 1, p: 0.875, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        <Box sx={{ height: 8, borderRadius: 1, bgcolor: palette.background.paper, border: `1px solid ${palette.divider}` }} />
        <Box sx={{ flex: 1, borderRadius: 1.5, bgcolor: palette.background.paper, border: `1px solid ${palette.divider}`, p: 0.75, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Box sx={{ height: 5, width: '60%', borderRadius: 1, bgcolor: palette.text.primary, opacity: 0.85 }} />
          <Box sx={{ height: 4, width: '80%', borderRadius: 1, bgcolor: palette.text.secondary, opacity: 0.5 }} />
          <Stack direction="row" spacing={0.5} sx={{ mt: 'auto' }}>
            <Box sx={{ height: 10, width: 34, borderRadius: 1, background: `linear-gradient(115deg, ${palette.primary.main}, ${palette.secondary.main})` }} />
            <Box sx={{ height: 10, width: 22, borderRadius: 1, bgcolor: palette.primary.lighter, border: `1px solid ${palette.primary.light}` }} />
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}

/** A small, faithful sample of the portal rendered with the candidate theme. */
function LivePreview({ themeKey, fontKey }) {
  const built = useMemo(() => createPortalTheme(themeKey, fontKey), [themeKey, fontKey]);
  const { nav, accent } = built.preset;
  return (
    <ThemeProvider theme={built.theme}>
      <Box sx={{ display: 'flex', borderRadius: 3, overflow: 'hidden', border: 1, borderColor: 'divider', bgcolor: 'background.default', minHeight: 260 }}>
        <Box sx={{ width: { xs: 120, sm: 170 }, flexShrink: 0, background: `linear-gradient(160deg, ${nav.from}, ${nav.via} 48%, ${nav.to})`, color: '#fff', p: 1.5 }}>
          <Typography sx={{ fontFamily: built.font.heading, fontWeight: 700, fontSize: '0.95rem' }}>Feddrick</Typography>
          <Stack spacing={0.75} sx={{ mt: 2 }}>
            {['Dashboard', 'Academics', 'Finance', 'Campus'].map((item, i) => (
              <Box key={item} sx={{ px: 1, py: 0.6, borderRadius: 1.5, fontSize: '0.78rem', bgcolor: i === 0 ? 'rgba(255,255,255,0.14)' : 'transparent', color: i === 0 ? accent : 'rgba(255,255,255,0.8)', fontFamily: built.font.body }}>
                {item}
              </Box>
            ))}
          </Stack>
        </Box>
        <Box sx={{ flex: 1, p: 2, minWidth: 0 }}>
          <Typography variant="overline" color="primary">Preview</Typography>
          <Typography variant="h4" component="p">Good morning, Amit</Typography>
          <Typography variant="body2" color="text.secondary">Here’s what matters today at Feddrick University.</Typography>
          <Card sx={{ mt: 1.5, p: 1.5 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle2">CS 501 · Advanced Database Systems</Typography>
                <Typography variant="caption">Midterm project · due Oct 24</Typography>
              </Box>
              <Chip size="small" color="primary" label="Upcoming" />
            </Stack>
            <LinearProgress variant="determinate" value={64} sx={{ mt: 1.25 }} />
          </Card>
          <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} useFlexGap flexWrap="wrap">
            <MuiButton variant="contained" size="small">Primary action</MuiButton>
            <MuiButton variant="outlined" size="small">Secondary</MuiButton>
            <Chip size="small" color="success" label="Paid" />
            <Chip size="small" color="warning" label="Due soon" />
          </Stack>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

/**
 * Admin → Portal Appearance. Chooses the institution's theme and typography presets;
 * saving persists them for this university (tenant) and applies them across the
 * Student, Faculty and Admin experiences, including the sign-in page.
 */
export const AdminAppearancePage = () => {
  const appearance = useAppearance();
  const { showToast } = useToast();
  const [themeKey, setThemeKey] = useState(appearance.themeKey);
  const [fontKey, setFontKey] = useState(appearance.fontKey);
  const [saving, setSaving] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);

  // Start from the saved value (the provider may still be loading it).
  useEffect(() => {
    let alive = true;
    appearanceApi
      .get()
      .then((saved) => {
        if (!alive) return;
        setThemeKey(saved.themeKey);
        setFontKey(saved.fontKey);
        setUpdatedAt(saved.updatedAt);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const dirty = themeKey !== appearance.themeKey || fontKey !== appearance.fontKey;
  // A retired theme still renders, but cannot be saved again: pick a current one to save.
  const retiredTheme = RETIRED_THEMES.find((preset) => preset.key === themeKey);

  const save = async () => {
    setSaving(true);
    try {
      const saved = await appearanceApi.update({ themeKey, fontKey });
      appearance.apply(saved);
      setUpdatedAt(saved.updatedAt);
      showToast('Portal appearance saved. Everyone at Feddrick University will see it.');
    } catch (error) {
      showToast(error.message ?? 'Could not save the appearance.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <PageHeader
        eyebrow="Administration"
        title="Portal Appearance"
        description="Choose the colour theme and typography for every student, faculty and administrator at Feddrick University."
        actions={
          <Stack direction="row" spacing={1}>
            <MuiButton
              startIcon={<RestartAltRoundedIcon />}
              onClick={() => {
                setThemeKey(DEFAULT_THEME_KEY);
                setFontKey(DEFAULT_FONT_KEY);
              }}
              disabled={themeKey === DEFAULT_THEME_KEY && fontKey === DEFAULT_FONT_KEY}
            >
              Use defaults
            </MuiButton>
            <MuiButton variant="contained" startIcon={<SaveOutlinedIcon />} onClick={save} disabled={!dirty || saving || Boolean(retiredTheme)}>
              {saving ? 'Saving…' : 'Save appearance'}
            </MuiButton>
          </Stack>
        }
      />

      <Stack spacing={2.5}>
        <WidgetCard title="Colour theme" subtitle="Complete palettes: navigation, surfaces, text, buttons and accents" icon={PaletteOutlinedIcon} hoverable={false}>
          {retiredTheme && (
            <Alert severity="info" sx={{ mb: 1.5 }}>
              The portal currently uses <b>{retiredTheme.label}</b>, a theme that is no longer offered. It keeps working until you choose one of the themes below and save.
            </Alert>
          )}
          <Box role="radiogroup" aria-label="Colour theme" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 }}>
            {APPEARANCE_THEMES.map((preset) => (
              <OptionCard key={preset.key} selected={themeKey === preset.key} onSelect={() => setThemeKey(preset.key)} label={preset.label} description={preset.description}>
                <ThemeSwatch preset={preset} />
              </OptionCard>
            ))}
          </Box>
        </WidgetCard>

        <WidgetCard title="Typography" subtitle="Heading and text fonts, from fonts already in the portal or on every device" icon={TextFieldsRoundedIcon} hoverable={false}>
          <Box role="radiogroup" aria-label="Typography" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5 }}>
            {APPEARANCE_FONTS.map((font) => (
              <OptionCard key={font.key} selected={fontKey === font.key} onSelect={() => setFontKey(font.key)} label={font.label} description={font.description}>
                <Box aria-hidden sx={{ p: 1.25, borderRadius: 2, bgcolor: 'background.subtle', border: 1, borderColor: 'divider', minHeight: 92 }}>
                  <Typography sx={{ fontFamily: font.heading, fontWeight: font.headingWeight, fontSize: '1.2rem', lineHeight: 1.25 }}>Feddrick University</Typography>
                  <Typography sx={{ fontFamily: font.body, fontSize: '0.8125rem', color: 'text.secondary', mt: 0.5 }}>Registration for Spring 2027 opens Monday at 9:00 AM.</Typography>
                </Box>
              </OptionCard>
            ))}
          </Box>
        </WidgetCard>

        <WidgetCard
          title="Live preview"
          subtitle={dirty ? 'Unsaved selection: save to apply it across the portal' : `Currently applied${updatedAt ? ` · saved ${new Date(updatedAt).toLocaleString()}` : ''}`}
          icon={VisibilityOutlinedIcon}
          hoverable={false}
        >
          <LivePreview themeKey={themeKey} fontKey={fontKey} />
        </WidgetCard>
      </Stack>
    </Box>
  );
};

export default AdminAppearancePage;

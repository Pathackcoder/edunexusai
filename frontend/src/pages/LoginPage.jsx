import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keyframes } from '@emotion/react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import IconButton from '@mui/material/IconButton';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import ButtonBase from '@mui/material/ButtonBase';
import MuiButton from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import { alpha } from '@mui/material/styles';
import MailOutlineRoundedIcon from '@mui/icons-material/MailOutlineRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import SchoolRoundedIcon from '@mui/icons-material/SchoolRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import CoPresentRoundedIcon from '@mui/icons-material/CoPresentRounded';
import AdminPanelSettingsRoundedIcon from '@mui/icons-material/AdminPanelSettingsRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import { PWAInstallButton } from '../components/pwa/PWAInstallButton';
import { CampusScene } from '../components/login/CampusScene';
import { LoginIntroOverlay, useLoginIntro } from '../components/login/LoginIntro';

/* Presentation only. Motion is transform/opacity and stops under prefers-reduced-motion. */
const fadeUp = keyframes`
  from { opacity: 0; transform: translate3d(0, 10px, 0); }
  to   { opacity: 1; transform: none; }
`;
const drift = keyframes`
  0%, 100% { transform: translate3d(0, 0, 0); }
  50%      { transform: translate3d(3%, -4%, 0); }
`;
const enterAt = (ms) => ({ animation: `${fadeUp} 600ms cubic-bezier(0.2, 0.8, 0.2, 1) ${ms}ms both` });

const BRAND_GRADIENT = 'linear-gradient(110deg, #3F4BDB 0%, #5B4BE3 45%, #7A4FD8 75%, #5B4BE3 100%)';

/** Visual identity for each demo persona (icon + accent). Behaviour lives in demoAccounts. */
const PERSONA_STYLE = {
  'student@edunexus.ai': { icon: SchoolRoundedIcon, accent: '#4651DE', short: 'Standard' },
  'student.advanced@edunexus.ai': { icon: AutoAwesomeRoundedIcon, accent: '#7A4FD8', short: 'Advanced' },
  'faculty@edunexus.ai': { icon: CoPresentRoundedIcon, accent: '#0D9488', short: 'CS 501' },
  'admin@edunexus.ai': { icon: AdminPanelSettingsRoundedIcon, accent: '#C2700A', short: 'Systems' },
};

/** Shared field styling: calm at rest, a soft brand glow and tinted icon on focus. */
const fieldSx = (theme) => ({
  '& .MuiOutlinedInput-root': {
    height: 48,
    borderRadius: '12px',
    fontSize: '0.9375rem',
    backgroundColor: alpha('#F4F5FF', 0.7),
    transition: 'background-color 200ms ease, box-shadow 220ms ease',
    '& fieldset': { borderColor: theme.palette.grey[200], transition: 'border-color 200ms ease' },
    '&:hover fieldset': { borderColor: alpha(theme.palette.primary.main, 0.45) },
    '&.Mui-focused': {
      backgroundColor: '#FFFFFF',
      boxShadow: `0 0 0 4px ${alpha(theme.palette.primary.main, 0.12)}, 0 10px 24px -14px ${alpha(theme.palette.primary.main, 0.55)}`,
    },
    '&.Mui-focused fieldset': { borderColor: `${theme.palette.primary.main} !important`, borderWidth: '1.5px !important' },
    '& .lead-icon': { color: theme.palette.grey[400], transition: 'color 200ms ease, transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1)' },
    '&.Mui-focused .lead-icon': { color: theme.palette.primary.main, transform: 'scale(1.08)' },
  },
  '& input::placeholder': { color: theme.palette.grey[400], opacity: 1 },
});

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  // Entrance intro (presentation only). When it plays it replaces the per-block fade-ups.
  const logoRef = useRef(null);
  const sceneRef = useRef(null);
  const formRef = useRef(null);
  const intro = useLoginIntro({ logoRef, sceneRef, formRef });
  const enter = (ms) => (intro.playing ? {} : enterAt(ms));

  /**
   * Demo accounts for the local prototype. The passwords are bcrypt-hashed in PostgreSQL
   * by the seed; nothing here is compared in the browser. Production replaces this whole
   * form with the institution's identity provider (SAML or OIDC).
   */
  const demoAccounts = [
    { persona: 'Student', name: 'Amit Pathak', detail: 'Standard tier', email: 'student@edunexus.ai', password: 'Student@Demo2026!' },
    { persona: 'Student', name: 'Maya Lin', detail: 'Advanced tier', email: 'student.advanced@edunexus.ai', password: 'Student@Demo2026!' },
    { persona: 'Faculty', name: 'Dr. Sarah Mitchell', detail: 'Teaches CS 501', email: 'faculty@edunexus.ai', password: 'Faculty@Demo2026!' },
    { persona: 'Admin', name: 'Karen Whitfield', detail: 'Systems & integrations', email: 'admin@edunexus.ai', password: 'Admin@Demo2026!' },
  ];

  const handleUseDemoCredentials = (account = demoAccounts[0]) => {
    setEmail(account.email);
    setPassword(account.password);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await login(email, password);
      if (result.success) {
        navigate('/dashboard');
      } else {
        setError(result.error || 'Invalid credentials. Please verify your email and password.');
      }
    } catch {
      setError('An error occurred during authentication. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        position: 'relative',
        overflowX: 'hidden',
        bgcolor: '#F7F7FD',
        '@media (prefers-reduced-motion: reduce)': {
          '& *, & *::before, & *::after': { animation: 'none !important', transitionDuration: '0.01ms !important' },
        },
      }}
    >
      {/* Form side atmosphere: soft light and a faint dot grid */}
      <Box aria-hidden sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
        <Box sx={{ position: 'absolute', top: '-20%', left: '-15%', width: { xs: '90vw', md: '45vw' }, aspectRatio: '1', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.16) 0%, transparent 65%)', animation: `${drift} 24s ease-in-out infinite` }} />
        <Box sx={{ position: 'absolute', bottom: '-25%', left: { xs: '30%', md: '12%' }, width: { xs: '80vw', md: '34vw' }, aspectRatio: '1', borderRadius: '50%', background: 'radial-gradient(circle, rgba(34,211,238,0.12) 0%, transparent 65%)', animation: `${drift} 30s ease-in-out -8s infinite` }} />
        <Box sx={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(70,81,222,0.10) 1px, transparent 1px)', backgroundSize: '22px 22px', maskImage: 'linear-gradient(180deg, #000 0%, transparent 70%)', WebkitMaskImage: 'linear-gradient(180deg, #000 0%, transparent 70%)' }} />
      </Box>

      {/* Form column */}
      <Box
        component="main"
        sx={{
          position: 'relative',
          zIndex: 1,
          flex: { xs: '1 1 100%', md: '0 0 46%', lg: '0 0 44%' },
          maxWidth: { md: 600 },
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          px: { xs: 2.5, sm: 6, lg: 7 },
          py: { xs: 2.5, sm: 3.5 },
          ...intro.styles.column,
        }}
      >
        {/* Brand row */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2} sx={enter(0)}>
          {/* The logo asset has a white ground, so it sits on a deliberate white brand plate. */}
          <Box
            ref={logoRef}
            sx={{
              ...intro.styles.logo,
              display: 'inline-flex',
              alignItems: 'center',
              px: 1.25,
              py: 0.75,
              borderRadius: '12px',
              bgcolor: '#FFFFFF',
              border: '1px solid',
              borderColor: alpha('#4651DE', 0.1),
              boxShadow: '0 6px 16px -10px rgba(53, 46, 160, 0.35)',
              transition: 'transform 300ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 300ms ease',
              '&:hover': { transform: 'translateY(-1px)', boxShadow: '0 12px 24px -12px rgba(91, 75, 227, 0.45)' },
            }}
          >
            <Box component="img" src="/logo.png" alt="EdunexusAI" sx={{ height: 28, width: 'auto', maxWidth: 170, display: 'block' }} />
          </Box>
          <Stack direction="row" alignItems="center" spacing={1} sx={intro.styles.chrome}>
            <PWAInstallButton size="sm" label="Install App" />
            <Chip
              label="Demo University Portal"
              variant="outlined"
              sx={{ display: { xs: 'none', sm: 'inline-flex', md: 'none', lg: 'inline-flex' }, color: 'text.secondary', borderColor: 'divider', bgcolor: alpha('#FFFFFF', 0.7), backdropFilter: 'blur(6px)' }}
            />
          </Stack>
        </Stack>

        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', py: { xs: 3, md: 2 } }}>
          <Box ref={formRef} sx={{ width: '100%', maxWidth: 440, mx: { xs: 'auto', md: 0 }, ...intro.styles.form }}>
            {/* Heading */}
            <Box sx={enter(80)}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.25 }}>
                <Box sx={{ width: 22, height: 3, borderRadius: 2, background: BRAND_GRADIENT }} />
                <Typography variant="overline" sx={{ color: 'primary.main', lineHeight: 1 }}>
                  Welcome back
                </Typography>
              </Stack>
              <Typography variant="h2" component="h1" sx={{ fontSize: { xs: '1.75rem', sm: '2.125rem' }, letterSpacing: '-0.025em', mb: 1 }}>
                Sign in to{' '}
                <Box component="span" sx={{ background: 'linear-gradient(90deg, #4651DE, #7A4FD8)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
                  EdunexusAI
                </Box>
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ maxWidth: 400 }}>
                One university portal for students, faculty and administrators. Sign in to reach your courses, teaching tools, campus services and records.
              </Typography>
            </Box>

            {/* Sign-in card */}
            <Box
              sx={{
                ...enter(180),
                mt: 3,
                p: { xs: 2.25, sm: 3 },
                borderRadius: '22px',
                bgcolor: alpha('#FFFFFF', 0.86),
                backdropFilter: 'blur(10px)',
                border: '1px solid',
                borderColor: alpha('#4651DE', 0.1),
                boxShadow: '0 1px 2px rgba(18,24,51,0.04), 0 24px 48px -24px rgba(53, 46, 160, 0.25)',
              }}
            >
              {/* Demo personas. Clicking one fills the form; the backend still verifies it. */}
              <Typography variant="caption" component="div" sx={{ mb: 0.75, fontWeight: 600, fontSize: '0.6875rem', color: 'text.secondary', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Demo accounts
              </Typography>
              <Box role="group" aria-label="Demo accounts" sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 0.75 }}>
                {demoAccounts.map((account) => {
                  const selected = email === account.email;
                  const { icon: Icon, accent, short } = PERSONA_STYLE[account.email];
                  return (
                    <ButtonBase
                      key={account.email}
                      onClick={() => handleUseDemoCredentials(account)}
                      title={`${account.name} — ${account.detail}`}
                      aria-pressed={selected}
                      sx={{
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        gap: 0.875,
                        px: 0.75,
                        py: 0.625,
                        pr: 1,
                        borderRadius: '10px',
                        textAlign: 'left',
                        border: '1px solid',
                        borderColor: selected ? accent : 'grey.200',
                        bgcolor: selected ? alpha(accent, 0.07) : '#FFFFFF',
                        boxShadow: selected ? `0 0 0 3px ${alpha(accent, 0.12)}` : 'none',
                        transition: 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 220ms ease, border-color 200ms ease, background-color 200ms ease',
                        '&:hover': {
                          transform: 'translateY(-2px)',
                          borderColor: alpha(accent, 0.55),
                          boxShadow: `0 10px 20px -12px ${alpha(accent, 0.6)}${selected ? `, 0 0 0 3px ${alpha(accent, 0.12)}` : ''}`,
                          '& .persona-icon': { transform: 'scale(1.06)' },
                        },
                        '&:focus-visible': { outline: `2px solid ${accent}`, outlineOffset: 2 },
                      }}
                    >
                      <Box
                        className="persona-icon"
                        sx={{
                          width: 24,
                          height: 24,
                          flexShrink: 0,
                          borderRadius: '7px',
                          display: 'grid',
                          placeItems: 'center',
                          color: selected ? '#fff' : accent,
                          background: selected ? `linear-gradient(135deg, ${accent}, ${alpha(accent, 0.75)})` : alpha(accent, 0.1),
                          transition: 'transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1), background 200ms ease, color 200ms ease',
                          '& svg': { fontSize: 14 },
                        }}
                      >
                        <Icon />
                      </Box>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography sx={{ fontSize: '0.59375rem', fontWeight: 700, color: accent, lineHeight: 1.2, letterSpacing: '0.05em', textTransform: 'uppercase' }} noWrap>
                          {account.persona}
                        </Typography>
                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'text.primary', lineHeight: 1.25 }} noWrap>
                          {account.name.startsWith('Dr.') ? account.name.split(' ').slice(0, 2).join(' ') : account.name.split(' ')[0]}
                          <Box component="span" sx={{ fontWeight: 500, color: 'text.secondary' }}> · {short}</Box>
                        </Typography>
                      </Box>
                      <Box
                        aria-hidden
                        sx={{
                          position: 'absolute',
                          top: 5,
                          right: 5,
                          width: 13,
                          height: 13,
                          borderRadius: '50%',
                          display: 'grid',
                          placeItems: 'center',
                          bgcolor: accent,
                          color: '#fff',
                          transform: selected ? 'scale(1)' : 'scale(0)',
                          opacity: selected ? 1 : 0,
                          transition: 'transform 260ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 200ms ease',
                          '& svg': { fontSize: 10 },
                        }}
                      >
                        <CheckRoundedIcon />
                      </Box>
                    </ButtonBase>
                  );
                })}
              </Box>

              {/* Divider with label */}
              <Stack direction="row" alignItems="center" spacing={1.5} sx={{ my: 1.75 }}>
                <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider' }} />
                <Typography sx={{ fontSize: '0.71875rem', color: 'text.disabled', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  or use your credentials
                </Typography>
                <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider' }} />
              </Stack>

              {/* Inline Error Message */}
              {error && (
                <Alert severity="error" role="alert" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}

              {/* Login Form */}
              <Box component="form" onSubmit={handleSubmit}>
                <Stack spacing={2}>
                  <Box>
                    <Typography component="label" htmlFor="email-input" variant="subtitle2" sx={{ display: 'block', mb: 0.75, fontSize: '0.8125rem' }}>
                      University Email or Username
                    </Typography>
                    <TextField
                      id="email-input"
                      type="text"
                      placeholder="student@edunexus.ai"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="username"
                      size="medium"
                      sx={fieldSx}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <MailOutlineRoundedIcon className="lead-icon" sx={{ fontSize: 20 }} />
                          </InputAdornment>
                        ),
                      }}
                    />
                  </Box>

                  <Box>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.75 }}>
                      <Typography component="label" htmlFor="password-input" variant="subtitle2" sx={{ fontSize: '0.8125rem' }}>
                        Password
                      </Typography>
                      <Link
                        component="button"
                        type="button"
                        variant="body2"
                        underline="none"
                        fontWeight={600}
                        onClick={() => setIsForgotModalOpen(true)}
                        sx={{
                          fontSize: '0.8125rem',
                          backgroundImage: 'linear-gradient(currentColor, currentColor)',
                          backgroundSize: '0% 1.5px',
                          backgroundPosition: '0 100%',
                          backgroundRepeat: 'no-repeat',
                          transition: 'background-size 260ms ease, color 200ms ease',
                          '&:hover, &:focus-visible': { backgroundSize: '100% 1.5px', color: 'secondary.main' },
                        }}
                      >
                        Forgot password?
                      </Link>
                    </Stack>
                    <TextField
                      id="password-input"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      size="medium"
                      sx={fieldSx}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <LockOutlinedIcon className="lead-icon" sx={{ fontSize: 20 }} />
                          </InputAdornment>
                        ),
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              onClick={() => setShowPassword(!showPassword)}
                              aria-label={showPassword ? 'Hide password' : 'Show password'}
                              edge="end"
                              size="small"
                              sx={{ position: 'relative', width: 34, height: 34 }}
                            >
                              {/* Both icons stay mounted and cross-fade, so the toggle never jumps. */}
                              {[
                                { Icon: VisibilityOutlinedIcon, on: !showPassword },
                                { Icon: VisibilityOffOutlinedIcon, on: showPassword },
                              ].map(({ Icon, on }, index) => (
                                <Icon
                                  key={index}
                                  fontSize="small"
                                  sx={{
                                    position: 'absolute',
                                    opacity: on ? 1 : 0,
                                    transform: on ? 'rotate(0deg) scale(1)' : 'rotate(-35deg) scale(0.6)',
                                    transition: 'opacity 200ms ease, transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                                  }}
                                />
                              ))}
                            </IconButton>
                          </InputAdornment>
                        ),
                      }}
                    />
                  </Box>

                  <MuiButton
                    type="submit"
                    variant="contained"
                    fullWidth
                    disabled={isLoading}
                    endIcon={isLoading ? null : <ArrowForwardRoundedIcon className="cta-arrow" />}
                    sx={(theme) => ({
                      mt: '20px !important',
                      height: 50,
                      borderRadius: '14px',
                      fontSize: '0.9375rem',
                      fontWeight: 700,
                      letterSpacing: '0.005em',
                      color: '#fff',
                      position: 'relative',
                      overflow: 'hidden',
                      background: BRAND_GRADIENT,
                      backgroundSize: '220% 100%',
                      backgroundPosition: '0% 50%',
                      boxShadow: `0 12px 24px -12px ${alpha('#4F46E5', 0.75)}, inset 0 1px 0 rgba(255,255,255,0.18)`,
                      transition: 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 260ms ease, background-position 600ms ease',
                      '& .cta-arrow': { transition: 'transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1)' },
                      // A soft band of light sweeps across on hover.
                      '&::after': {
                        content: '""',
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: 0,
                        width: '40%',
                        background: 'linear-gradient(100deg, transparent, rgba(255,255,255,0.28), transparent)',
                        transform: 'translateX(-130%) skewX(-18deg)',
                        transition: 'transform 700ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                      },
                      '&:hover': {
                        background: BRAND_GRADIENT,
                        backgroundSize: '220% 100%',
                        backgroundPosition: '100% 50%',
                        transform: 'translateY(-2px)',
                        boxShadow: `0 18px 32px -14px ${alpha('#4F46E5', 0.85)}, inset 0 1px 0 rgba(255,255,255,0.2)`,
                        '& .cta-arrow': { transform: 'translateX(3px)' },
                        '&::after': { transform: 'translateX(320%) skewX(-18deg)' },
                      },
                      '&:active': { transform: 'translateY(0)' },
                      '&:focus-visible': { outline: `3px solid ${alpha(theme.palette.primary.main, 0.35)}`, outlineOffset: 2 },
                      '&.Mui-disabled': { color: '#fff', background: BRAND_GRADIENT, opacity: 0.85 },
                    })}
                  >
                    {isLoading ? (
                      <Stack direction="row" spacing={1.25} alignItems="center">
                        <CircularProgress size={18} thickness={5} sx={{ color: '#fff' }} />
                        <span>Signing in…</span>
                      </Stack>
                    ) : (
                      'Sign In to Portal'
                    )}
                  </MuiButton>
                </Stack>
              </Box>
            </Box>
          </Box>
        </Box>

        {/* Phones: the campus story as a compact band below the form, never above it. */}
        <Box
          aria-hidden
          sx={{
            display: { xs: 'flex', md: 'none' },
            alignItems: 'center',
            gap: 1.5,
            mb: 2.5,
            mx: 'auto',
            width: '100%',
            maxWidth: 440,
            p: 2,
            borderRadius: '18px',
            color: '#fff',
            position: 'relative',
            overflow: 'hidden',
            background: 'linear-gradient(135deg, #161A52 0%, #2B1F70 55%, #4A33A8 100%)',
            '&::before': { content: '""', position: 'absolute', inset: 0, background: 'radial-gradient(circle at 85% 20%, rgba(34,211,238,0.35), transparent 50%)' },
            ...enter(320),
            ...intro.styles.chrome,
          }}
        >
          <Stack direction="row" sx={{ position: 'relative', flexShrink: 0 }}>
            {[
              [SchoolRoundedIcon, '#4651DE', '#7A4FD8'],
              [AutoAwesomeRoundedIcon, '#6366F1', '#C084FC'],
              [CoPresentRoundedIcon, '#0D9488', '#22D3EE'],
            ].map(([Icon, from, to], index) => (
              <Box key={index} sx={{ width: 32, height: 32, ml: index ? -0.75 : 0, borderRadius: '10px', display: 'grid', placeItems: 'center', background: `linear-gradient(135deg, ${from}, ${to})`, border: '2px solid #241C66', '& svg': { fontSize: 17 } }}>
                <Icon />
              </Box>
            ))}
          </Stack>
          <Box sx={{ position: 'relative', minWidth: 0 }}>
            <Typography sx={{ fontFamily: '"Rubik", sans-serif', fontWeight: 600, fontSize: '0.9375rem', lineHeight: 1.25 }}>One unified portal for campus life</Typography>
            <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.72)' }}>Students, faculty and administrators in one place.</Typography>
          </Box>
        </Box>

        {/* Footer info */}
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems="center" spacing={{ xs: 0.75, sm: 2 }} sx={{ color: 'text.secondary', pt: 2, borderTop: 1, borderColor: alpha('#4651DE', 0.08), ...enter(260), ...intro.styles.chrome }}>
          <Typography variant="caption">© 2026 EdunexusAI Higher Education</Typography>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <VerifiedUserOutlinedIcon sx={{ fontSize: 15, color: 'success.main' }} />
            <Typography variant="caption">256-Bit SSL Secured</Typography>
          </Stack>
        </Stack>
      </Box>

      {/* Campus experience */}
      <Box
        ref={sceneRef}
        sx={{
          position: { md: 'sticky' },
          top: 0,
          height: '100vh',
          zIndex: 1,
          flex: '1 1 auto',
          minWidth: 0,
          display: { xs: 'none', md: 'block' },
          p: { md: 1.5, lg: 2 },
          pl: { md: 0, lg: 0 },
          ...intro.styles.scene,
        }}
      >
        <CampusScene entranceDelay={intro.entranceDelay} />
      </Box>

      <LoginIntroOverlay intro={intro} />

      {/* Forgot Password Modal (Demo Hint) */}
      <Modal
        isOpen={isForgotModalOpen}
        onClose={() => setIsForgotModalOpen(false)}
        title="Forgot Your Password?"
        subtitle="Demo Portal Information"
        footer={
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              handleUseDemoCredentials();
              setIsForgotModalOpen(false);
            }}
          >
            Autofill Student Credentials
          </Button>
        }
      >
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            This is a prototype deployment of <strong>EdunexusAI</strong>. Sign-in is verified by
            the EdunexusAI backend against bcrypt-hashed credentials in PostgreSQL. In a production
            university deployment this link redirects to your institution's SSO identity provider
            (Azure AD, Okta or Shibboleth) and EdunexusAI stops holding passwords at all.
          </Typography>

          <Paper variant="outlined" sx={{ p: 2, bgcolor: 'primary.lighter', borderColor: 'primary.light', borderRadius: 3 }}>
            <Typography variant="subtitle2" color="primary.dark" sx={{ mb: 1 }}>
              Portal Access Credentials:
            </Typography>
            <Stack spacing={1.25}>
              {demoAccounts.map((account) => (
                <Typography key={account.email} variant="body2" component="div">
                  <strong>{account.persona}</strong> · {account.name} ({account.detail})
                  <Box component="div" sx={{ color: 'text.secondary', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.8125rem' }}>
                    {account.email} / {account.password}
                  </Box>
                </Typography>
              ))}
            </Stack>
          </Paper>
        </Stack>
      </Modal>
    </Box>
  );
};

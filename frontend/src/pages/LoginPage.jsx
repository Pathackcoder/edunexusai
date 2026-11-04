import React, { useRef, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { keyframes } from '@emotion/react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import IconButton from '@mui/material/IconButton';
import Alert from '@mui/material/Alert';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import MuiButton from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import { alpha } from '@mui/material/styles';
import MailOutlineRoundedIcon from '@mui/icons-material/MailOutlineRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/common/Button';
import { Modal } from '../components/common/Modal';
import { PWAInstallButton } from '../components/pwa/PWAInstallButton';
import { CampusVideoBackdrop } from '../components/login/CampusVideoBackdrop';
import { LoginIntroOverlay, useLoginIntro } from '../components/login/LoginIntro';
import { InstitutionLogo, PoweredBy } from '../components/brand/Brand';
import { institution } from '../branding';
import { InstitutionSignIn } from '../components/login/InstitutionSignIn';

/* Presentation only. Motion is transform/opacity and stops under prefers-reduced-motion. */
const fadeUp = keyframes`
  from { opacity: 0; transform: translate3d(0, 10px, 0); }
  to   { opacity: 1; transform: none; }
`;
const enterAt = (ms) => ({ animation: `${fadeUp} 600ms cubic-bezier(0.2, 0.8, 0.2, 1) ${ms}ms both` });

/** Shared field styling: a quiet, solid field at rest; the theme's focus ring and a tinted icon on focus. */
const fieldSx = (theme) => ({
  '& .MuiOutlinedInput-root': {
    height: 46,
    fontSize: '0.9375rem',
    backgroundColor: theme.palette.grey[50],
    transition: 'background-color 180ms ease, box-shadow 180ms ease',
    '&:hover': { backgroundColor: '#FFFFFF' },
    '&.Mui-focused': { backgroundColor: '#FFFFFF' },
    '& .lead-icon': { color: theme.palette.grey[400], transition: 'color 180ms ease' },
    '&.Mui-focused .lead-icon': { color: theme.palette.primary.main },
  },
});

const labelSx = { display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'grey.800' };

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);

  const { login } = useAuth();
  const ssoError = new URLSearchParams(window.location.search).get('sso_error');
  const navigate = useNavigate();

  // Entrance intro (presentation only). When it plays it replaces the per-block fade-ups.
  const logoRef = useRef(null);
  const intro = useLoginIntro({ logoRef });
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
        bgcolor: '#0B1036',
        '@media (prefers-reduced-motion: reduce)': {
          '& *, & *::before, & *::after': { animation: 'none !important', transitionDuration: '0.01ms !important' },
        },
      }}
    >
      {/* Full-screen campus flyover behind everything; the sign-in card is the foreground. */}
      <CampusVideoBackdrop visible={!intro.active || intro.videoVisible} />

      <Box
        component="main"
        sx={{
          position: 'relative',
          zIndex: 1,
          flex: '1 1 100%',
          minWidth: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          px: { xs: 2, sm: 5, lg: 8, xl: 11 },
          py: { xs: 2, sm: 3 },
        }}
      >
        {/* Brand row */}
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2} sx={enter(0)}>
          {/* Feddrick University is the identity; the intro's flying logo lands exactly here. */}
          <Box ref={logoRef} sx={{ ...intro.styles.logo, display: 'inline-flex', alignItems: 'center' }}>
            <InstitutionLogo inverse height={46} sx={{ filter: 'drop-shadow(0 4px 14px rgba(5, 8, 30, 0.55))' }} />
          </Box>
          <Stack direction="row" alignItems="center" spacing={2} sx={intro.styles.chrome}>
            <Box sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center', gap: 2 }}>
              <PoweredBy tone="dark" showLogo />
              <Box aria-hidden sx={{ width: '1px', height: 20, bgcolor: 'rgba(255, 255, 255, 0.22)' }} />
            </Box>
            <PWAInstallButton
              size="sm"
              label="Install App"
              sx={{
                color: '#FFFFFF',
                borderColor: 'rgba(255, 255, 255, 0.32)',
                backgroundColor: 'rgba(11, 16, 54, 0.28)',
                '&:hover': { borderColor: 'rgba(255, 255, 255, 0.6)', backgroundColor: 'rgba(11, 16, 54, 0.45)' },
              }}
            />
          </Stack>
        </Stack>

        {/* Sign-in card on the left; on wider screens the portal's purpose sits on the campus itself. */}
        <Box
          sx={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 432px) minmax(0, 1fr)' },
            alignItems: 'center',
            columnGap: { md: 6, lg: 10 },
            py: 3,
          }}
        >
          <Box sx={{ width: '100%', maxWidth: 432, mx: { xs: 'auto', md: 0 }, ...intro.styles.card }}>
            <Box
              sx={(theme) => ({
                ...enter(120),
                position: 'relative',
                overflow: 'hidden',
                px: { xs: 3, sm: 4 },
                pt: { xs: 3.5, sm: 4 },
                pb: { xs: 3, sm: 3.5 },
                borderRadius: '16px',
                bgcolor: '#FFFFFF',
                boxShadow: `0 1px 2px rgba(5, 8, 30, 0.08), 0 24px 56px -28px rgba(5, 8, 30, 0.7), 0 0 0 1px ${alpha(theme.palette.grey[900], 0.04)}`,
                // The institution's colour as a single band across the top of the card.
                '&::before': { content: '""', position: 'absolute', top: 0, left: 0, right: 0, height: 4, bgcolor: 'primary.main' },
              })}
            >
              {/* Heading */}
              <Box sx={{ mb: 3 }}>
                <Typography variant="overline" component="p" sx={{ color: 'primary.main', fontWeight: 600, lineHeight: 1.4, mb: 1 }}>
                  Welcome back
                </Typography>
                <Typography variant="h2" component="h1" sx={{ fontSize: { xs: '1.23rem', sm: '1.55rem' }, lineHeight: 1.18, letterSpacing: '-0.02em', color: 'grey.900' }}>
                  Welcome to{' '}
                  <Box component="span" sx={{ color: 'primary.main', whiteSpace: 'nowrap' }}>
                    {institution.name}
                  </Box>
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ mt: 1, fontSize: '0.875rem' }}>
                  Use your university email or username to continue to your portal.
                </Typography>
              </Box>

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
                    <Typography component="label" htmlFor="email-input" sx={{ ...labelSx, mb: 0.75 }}>
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
                            <MailOutlineRoundedIcon className="lead-icon" sx={{ fontSize: 19 }} />
                          </InputAdornment>
                        ),
                      }}
                    />
                  </Box>

                  <Box>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.75 }}>
                      <Typography component="label" htmlFor="password-input" sx={labelSx}>
                        Password
                      </Typography>
                      <Link
                        component="button"
                        type="button"
                        variant="body2"
                        underline="hover"
                        fontWeight={600}
                        onClick={() => setIsForgotModalOpen(true)}
                        sx={{ fontSize: '0.8125rem', textUnderlineOffset: '3px' }}
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
                            <LockOutlinedIcon className="lead-icon" sx={{ fontSize: 19 }} />
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
                      mt: '24px !important',
                      height: 48,
                      borderRadius: '10px',
                      fontSize: '0.9375rem',
                      fontWeight: 600,
                      color: '#fff',
                      // A solid institution colour instead of the theme's gradient fill.
                      backgroundColor: 'primary.main',
                      backgroundImage: 'none',
                      boxShadow: `0 1px 2px ${alpha(theme.palette.grey[900], 0.12)}, 0 10px 20px -12px ${alpha(theme.palette.primary.main, 0.8)}`,
                      '& .cta-arrow': { transition: 'transform 240ms cubic-bezier(0.2, 0.8, 0.2, 1)' },
                      '&:hover': {
                        backgroundColor: 'primary.dark',
                        backgroundImage: 'none',
                        boxShadow: `0 1px 2px ${alpha(theme.palette.grey[900], 0.12)}, 0 14px 26px -14px ${alpha(theme.palette.primary.main, 0.9)}`,
                        '& .cta-arrow': { transform: 'translateX(3px)' },
                      },
                      '&:focus-visible': { outline: `3px solid ${alpha(theme.palette.primary.main, 0.35)}`, outlineOffset: 2 },
                      '&.Mui-disabled': { color: '#fff', backgroundColor: 'primary.main', opacity: 0.8 },
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
              <InstitutionSignIn error={ssoError} />
              {/* <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
                Thinking of applying or visiting? <Link component={RouterLink} to="/visit" sx={{ fontWeight: 600 }}>Explore without an account</Link>
              </Typography> */}
            </Box>
          </Box>

          {/* The portal's purpose, set on the campus (tablet and desktop). */}
          <Box
            sx={{
              display: { xs: 'none', md: 'block' },
              alignSelf: 'end',
              justifySelf: 'end',
              maxWidth: 440,
              pb: 1,
              color: '#FFFFFF',
              textShadow: '0 2px 18px rgba(5, 8, 30, 0.45)',
              ...enter(260),
              ...intro.styles.chrome,
            }}
          >
            <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mb: 1.5 }}>
              <Box sx={{ width: 28, height: 2, bgcolor: 'var(--enx-accent)' }} />
              <Typography variant="overline" sx={{ color: 'rgba(235, 238, 255, 0.85)', fontWeight: 600, lineHeight: 1 }}>
                {institution.portalName}
              </Typography>
            </Stack>
            <Typography variant="h2" component="p" sx={{ color: 'inherit', fontSize: { md: '1.5rem', lg: '1.75rem' }, lineHeight: 1.25, letterSpacing: '-0.02em' }}>
              Courses, teaching tools, campus services and records in one place.
            </Typography>
            <Typography sx={{ mt: 1.25, fontSize: '0.9375rem', color: 'rgba(235, 238, 255, 0.82)' }}>
              For Feddrick students, faculty and administrators.
            </Typography>
          </Box>
        </Box>

        {/* Footer info */}
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems="center" spacing={{ xs: 0.75, sm: 2 }} sx={{ color: 'rgba(235, 238, 255, 0.78)', pt: 2, borderTop: 1, borderColor: 'rgba(255, 255, 255, 0.14)', '& .MuiTypography-caption': { color: 'inherit' }, ...enter(260), ...intro.styles.chrome }}>
          <Stack direction="row" alignItems="center" spacing={1.5} useFlexGap flexWrap="wrap" justifyContent="center">
            <Typography variant="caption">© 2026 {institution.name}</Typography>
            <PoweredBy tone="dark" sx={{ display: { xs: 'flex', sm: 'none' } }} />
          </Stack>
          <Stack direction="row" alignItems="center" spacing={0.75}>
            <VerifiedUserOutlinedIcon sx={{ fontSize: 15, color: '#6EE7B7' }} />
            <Typography variant="caption">256-bit SSL encrypted connection</Typography>
          </Stack>
        </Stack>
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

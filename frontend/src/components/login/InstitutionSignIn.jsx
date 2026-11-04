import React, { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import MuiButton from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { ssoApi, SSO_ERROR_MESSAGES } from '../../services/api';

/**
 * "Sign in with <university>" options, below the password form. Shown only when the institution has
 * enabled at least one identity provider; password sign-in is unaffected. A failed institutional
 * sign-in returns here with ?sso_error=<code>, shown as a plain-language message.
 */
export function InstitutionSignIn({ tenant, error }) {
  const [providers, setProviders] = useState([]);
  useEffect(() => {
    let active = true;
    ssoApi.providers(tenant).then((list) => { if (active) setProviders(Array.isArray(list) ? list : []); }, () => {});
    return () => { active = false; };
  }, [tenant]);

  if (!providers.length && !error) return null;
  return (
    <Box sx={{ mt: 2.25 }}>
      {error && (
        <Alert severity="warning" role="alert" sx={{ mb: 2 }}>
          {SSO_ERROR_MESSAGES[error] ?? SSO_ERROR_MESSAGES.SIGN_IN_FAILED}
        </Alert>
      )}
      {providers.length > 0 && (
        <>
          <Divider sx={{ mb: 2, typography: 'caption', fontWeight: 600, color: 'text.disabled', letterSpacing: '0.08em', textTransform: 'uppercase', '&::before, &::after': { borderColor: 'grey.200' } }}>or</Divider>
          <Stack spacing={1}>
            {providers.map((p) => (
              <MuiButton
                key={p.key}
                variant="outlined"
                fullWidth
                href={ssoApi.startUrl(p.tenant, p.key, '/dashboard')}
                startIcon={<AccountBalanceOutlinedIcon />}
                sx={{
                  height: 46,
                  borderRadius: '10px',
                  fontSize: '0.9063rem',
                  fontWeight: 600,
                  color: 'grey.900',
                  bgcolor: '#FFFFFF',
                  borderColor: 'grey.300',
                  '& .MuiButton-startIcon': { color: 'primary.main' },
                  '&:hover': { bgcolor: 'primary.lighter', borderColor: 'primary.main' },
                }}
              >
                Sign in with {p.displayName}
              </MuiButton>
            ))}
          </Stack>
          <Stack direction="row" spacing={0.75} justifyContent="center" alignItems="flex-start" sx={{ mt: 1.25, color: 'text.secondary' }}>
            <LockOutlinedIcon sx={{ fontSize: 14, mt: '2px', color: 'grey.400' }} />
            <Typography variant="caption" color="inherit" component="p">
              Uses your university account. Your password is never shared with the portal.
            </Typography>
          </Stack>
        </>
      )}
    </Box>
  );
}

export default InstitutionSignIn;

import React, { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FullPageLoader } from '../components/common/FullPageLoader';

const safePath = (value) => (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value : '/dashboard');

/**
 * End of an institutional sign-in. The API sent the browser here with a single-use code in the URL
 * fragment (never sent to any server by the browser, never logged); it is exchanged once for the
 * normal session and removed from the address bar immediately.
 */
export const SsoCompletePage = () => {
  const { completeSsoSignIn } = useAuth();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const code = params.get('code');
    const returnTo = safePath(params.get('returnTo'));
    window.history.replaceState(null, '', window.location.pathname);
    if (!code) { setFailed(true); return; }
    completeSsoSignIn(code).then((result) => {
      if (result.success) navigate(returnTo, { replace: true });
      else setFailed(true);
    });
  }, [completeSsoSignIn, navigate]);

  if (failed) return <Navigate to="/login?sso_error=INVALID_REQUEST" replace />;
  return <FullPageLoader label="Signing you in…" />;
};

export default SsoCompletePage;

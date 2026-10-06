import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Fab from '@mui/material/Fab';
import Paper from '@mui/material/Paper';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import Chip from '@mui/material/Chip';
import Grow from '@mui/material/Grow';
import Tooltip from '@mui/material/Tooltip';
import { alpha } from '@mui/material/styles';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import DeleteSweepOutlinedIcon from '@mui/icons-material/DeleteSweepOutlined';
import { assistantApi } from '../../services/api';
import { useI18n } from '../../i18n';

/**
 * Floating portal assistant. Answers come from the user's own portal records and the
 * FAQ base (see backend assistantProvider.js); history is saved per user.
 */
export function AssistantLauncher() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [provider, setProvider] = useState(null);
  const [text, setText] = useState('');
  const [thinking, setThinking] = useState(false);
  const scroller = useRef(null);

  useEffect(() => {
    if (!open || provider) return;
    assistantApi.history().then((data) => {
      setMessages(data.messages);
      setSuggestions(data.suggestions);
      setProvider(data.provider);
    }).catch(() => {});
  }, [open, provider]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  const ask = async (question) => {
    const value = (question ?? text).trim();
    if (!value || thinking) return;
    setText('');
    setMessages((current) => [...current, { id: `pending-${Date.now()}`, role: 'user', content: value, actions: [] }]);
    setThinking(true);
    try {
      const result = await assistantApi.ask(value);
      setMessages((current) => [...current.filter((item) => !String(item.id).startsWith('pending-')), ...result.messages]);
    } catch (caught) {
      setMessages((current) => [...current, { id: `error-${Date.now()}`, role: 'assistant', content: caught.message, actions: [] }]);
    } finally {
      setThinking(false);
    }
  };
  const clear = async () => {
    const data = await assistantApi.clear();
    setMessages([]);
    setSuggestions(data.suggestions);
  };

  return (
    <>
      <Grow in={open} style={{ transformOrigin: 'bottom right' }} unmountOnExit>
        <Paper
          role="dialog"
          aria-label={t('Ask EdunexusAI')}
          elevation={8}
          sx={{ position: 'fixed', right: { xs: 12, sm: 24 }, bottom: { xs: 84, sm: 96 }, width: { xs: 'calc(100vw - 24px)', sm: 400 }, height: { xs: '70vh', sm: 560 }, maxHeight: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column', borderRadius: 4, overflow: 'hidden', zIndex: 1300 }}
        >
          <Stack direction="row" alignItems="center" spacing={1.25} sx={(theme) => ({ px: 2, py: 1.5, color: '#fff', background: `linear-gradient(120deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})` })}>
            <AutoAwesomeRoundedIcon />
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle1" fontWeight={700} color="inherit">{t('Ask EdunexusAI')}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.85 }}>{provider?.label ?? 'Portal assistant'}</Typography>
            </Box>
            <Tooltip title="Clear conversation"><IconButton size="small" onClick={clear} sx={{ color: 'inherit' }}><DeleteSweepOutlinedIcon fontSize="small" /></IconButton></Tooltip>
            <IconButton size="small" onClick={() => setOpen(false)} sx={{ color: 'inherit' }} aria-label="Close assistant"><CloseRoundedIcon fontSize="small" /></IconButton>
          </Stack>
          <Box ref={scroller} sx={{ flex: 1, overflowY: 'auto', p: 2, bgcolor: 'background.default' }}>
            {messages.length === 0 && (
              <Box sx={{ textAlign: 'center', py: 2 }}>
                <Typography variant="subtitle2">Hi! I can answer questions about your classes, deadlines, balance, degree progress, requests and campus.</Typography>
                <Typography variant="caption" color="text.secondary">I only use information already in the portal.</Typography>
              </Box>
            )}
            <Stack spacing={1.25}>
              {messages.map((message) => (
                <Box key={message.id} sx={{ alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '86%' }}>
                  <Box sx={(theme) => ({ px: 1.5, py: 1, borderRadius: 3, bgcolor: message.role === 'user' ? 'primary.main' : 'background.paper', color: message.role === 'user' ? '#fff' : 'text.primary', border: message.role === 'user' ? 0 : `1px solid ${theme.palette.divider}`, borderBottomRightRadius: message.role === 'user' ? 6 : 12, borderBottomLeftRadius: message.role === 'user' ? 12 : 6 })}>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{message.content}</Typography>
                  </Box>
                  {message.actions?.length > 0 && (
                    <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 0.75 }}>
                      {message.actions.map((action) => (
                        <Chip key={action.to} size="small" label={action.label} onClick={() => { navigate(action.to); setOpen(false); }} color="primary" variant="outlined" clickable />
                      ))}
                    </Stack>
                  )}
                </Box>
              ))}
              {thinking && (
                <Stack direction="row" spacing={0.5} sx={{ px: 1.5, py: 1.25, bgcolor: 'background.paper', borderRadius: 3, width: 'fit-content', border: 1, borderColor: 'divider' }}>
                  {[0, 1, 2].map((i) => <Box key={i} sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'text.secondary', animation: 'assistantDot 1s infinite', animationDelay: `${i * 0.15}s`, '@keyframes assistantDot': { '0%, 80%, 100%': { opacity: 0.25 }, '40%': { opacity: 1 } } }} />)}
                </Stack>
              )}
            </Stack>
          </Box>
          {suggestions.length > 0 && messages.length < 2 && (
            <Stack direction="row" spacing={0.75} sx={{ px: 1.5, py: 1, overflowX: 'auto', borderTop: 1, borderColor: 'divider' }}>
              {suggestions.map((item) => <Chip key={item} size="small" label={item} onClick={() => ask(item)} clickable sx={{ flexShrink: 0 }} />)}
            </Stack>
          )}
          <Stack component="form" direction="row" spacing={1} alignItems="center" onSubmit={(e) => { e.preventDefault(); ask(); }} sx={{ p: 1.25, borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
            <InputBase fullWidth placeholder={t('Ask a question…')} value={text} onChange={(e) => setText(e.target.value)} sx={{ px: 1.5, py: 0.75, borderRadius: 3, bgcolor: 'background.subtle', border: 1, borderColor: 'divider' }} inputProps={{ 'aria-label': t('Ask a question…'), maxLength: 1000 }} />
            <IconButton type="submit" color="primary" disabled={!text.trim() || thinking} aria-label={t('Send')}><SendRoundedIcon /></IconButton>
          </Stack>
        </Paper>
      </Grow>
      <Tooltip title={t('Ask EdunexusAI')} placement="left">
        <Fab
          color="primary"
          onClick={() => setOpen((value) => !value)}
          aria-label={t('Ask EdunexusAI')}
          sx={(theme) => ({ position: 'fixed', right: { xs: 16, sm: 28 }, bottom: { xs: 16, sm: 28 }, zIndex: 1300, background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`, boxShadow: `0 10px 24px -8px ${alpha(theme.palette.primary.main, 0.6)}`, transition: 'transform 200ms ease', '&:hover': { transform: 'translateY(-2px) scale(1.04)' } })}
        >
          {open ? <CloseRoundedIcon /> : <AutoAwesomeRoundedIcon />}
        </Fab>
      </Tooltip>
    </>
  );
}

export default AssistantLauncher;

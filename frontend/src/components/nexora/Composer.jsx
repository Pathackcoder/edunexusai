import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import { nexora } from './nexoraStyle';

const MAX = 4000;

/**
 * The prompt composer: an auto-growing text area. Enter sends, Shift+Enter adds a line, Escape stops a response.
 * `large` is the hero version shown on an empty workspace.
 */
export const Composer = forwardRef(function Composer({ onSend, onStop, streaming, disabled, large = false, placeholder }, ref) {
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const area = useRef(null);

  useImperativeHandle(ref, () => ({
    focus: () => area.current?.focus(),
    fill: (text) => {
      setValue(text);
      requestAnimationFrame(() => area.current?.focus());
    },
  }));

  // Grow with the text, up to a comfortable height; then scroll inside.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, large ? 260 : 220)}px`;
  }, [value, large]);

  const canSend = value.trim().length > 0 && !streaming && !disabled;
  const submit = () => {
    if (!canSend) return;
    onSend(value.trim());
    setValue('');
  };

  return (
    <Box
      sx={{
        position: 'relative',
        borderRadius: large ? 6 : 5,
        p: '1.5px',
        background: focused ? nexora.spectrum : `linear-gradient(0deg, ${nexora.hairline}, ${nexora.hairline})`,
        boxShadow: focused ? '0 22px 50px -28px rgba(70, 81, 222, 0.75), 0 0 0 6px rgba(70, 81, 222, 0.07)' : '0 14px 40px -30px rgba(18, 24, 51, 0.45)',
        transition: `box-shadow 260ms ${nexora.ease}, background 260ms ease`,
      }}
    >
      <Box sx={{ borderRadius: 'inherit', bgcolor: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(12px)', px: { xs: 1.75, sm: 2.25 }, pt: large ? 2 : 1.4, pb: 1.25 }}>
        <Box
          component="textarea"
          ref={area}
          rows={1}
          value={value}
          maxLength={MAX}
          disabled={disabled}
          placeholder={placeholder ?? 'Ask Nexora anything about your campus…'}
          aria-label="Message Nexora"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            } else if (e.key === 'Escape' && streaming) {
              e.preventDefault();
              onStop?.();
            }
          }}
          sx={{
            width: '100%',
            minHeight: large ? 56 : 28,
            resize: 'none',
            border: 0,
            outline: 0,
            bgcolor: 'transparent',
            font: 'inherit',
            fontSize: large ? { xs: '1rem', sm: '1.0625rem' } : '0.98rem',
            lineHeight: 1.55,
            color: nexora.ink,
            p: 0,
            '&::placeholder': { color: '#8A91AB', opacity: 1 },
          }}
        />
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 0.75 }}>
          <Typography variant="caption" sx={{ color: '#8A91AB', display: { xs: 'none', sm: 'block' } }}>
            {streaming ? 'Esc to stop' : 'Enter to send · Shift + Enter for a new line'}
          </Typography>
          <Box sx={{ flex: 1 }} />
          {value.length > MAX * 0.85 && (
            <Typography variant="caption" sx={{ color: value.length >= MAX ? 'error.main' : '#8A91AB', mr: 1 }}>{value.length}/{MAX}</Typography>
          )}
          {streaming ? (
            <Tooltip title="Stop responding">
              <IconButton onClick={onStop} aria-label="Stop responding" sx={{ width: 38, height: 38, bgcolor: nexora.ink, color: '#fff', '&:hover': { bgcolor: '#2A3150' } }}>
                <StopRoundedIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>
          ) : (
            <IconButton
              onClick={submit}
              disabled={!canSend}
              aria-label="Send to Nexora"
              sx={{
                width: 38,
                height: 38,
                color: '#fff',
                background: canSend ? nexora.gradient : '#E4E7F0',
                transition: `transform 200ms ${nexora.spring}, box-shadow 200ms ease, background 200ms ease`,
                '&:hover': { background: canSend ? nexora.gradientHover : '#E4E7F0', transform: canSend ? 'translateY(-1px) scale(1.04)' : 'none', boxShadow: canSend ? '0 10px 22px -10px rgba(70,81,222,0.9)' : 'none' },
                '&:active': { transform: 'scale(0.94)' },
                '&.Mui-disabled': { color: '#8A91AB' },
              }}
            >
              <ArrowUpwardRoundedIcon sx={{ fontSize: 20 }} />
            </IconButton>
          )}
        </Stack>
      </Box>
    </Box>
  );
});

export default Composer;

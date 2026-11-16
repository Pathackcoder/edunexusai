import React, { useId } from 'react';
import Box from '@mui/material/Box';

/**
 * The Nexora mark: a four-point spark with a smaller companion spark, drawn in the Nexora spectrum. `active`
 * adds a slow breathing glow while Nexora is working (disabled for reduced motion by the workspace styles).
 */
export function NexoraMark({ size = 28, active = false, mono = false, className, sx }) {
  const gradientId = useId().replace(/:/g, '');
  const fill = mono ? 'currentColor' : `url(#nx-${gradientId})`;
  return (
    <Box
      component="span"
      aria-hidden
      className={className}
      sx={{
        display: 'inline-flex',
        width: size,
        height: size,
        flexShrink: 0,
        position: 'relative',
        ...(active ? { animation: 'nxPulse 1.8s ease-in-out infinite' } : {}),
        ...sx,
      }}
    >
      <svg viewBox="0 0 32 32" width={size} height={size} fill="none">
        {!mono && (
          <defs>
            <linearGradient id={`nx-${gradientId}`} x1="3" y1="3" x2="29" y2="29" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="var(--enx-primary, #4651DE)" />
              <stop offset="0.55" stopColor="#8B5CF6" />
              <stop offset="1" stopColor="#22D3EE" />
            </linearGradient>
          </defs>
        )}
        <path d="M14 3.5c.6 5.6 3.4 8.4 9 9-5.6.6-8.4 3.4-9 9-.6-5.6-3.4-8.4-9-9 5.6-.6 8.4-3.4 9-9Z" fill={fill} />
        <path d="M24.5 19c.32 2.95 1.8 4.43 4.75 4.75-2.95.32-4.43 1.8-4.75 4.75-.32-2.95-1.8-4.43-4.75-4.75 2.95-.32 4.43-1.8 4.75-4.75Z" fill={fill} opacity={mono ? 0.8 : 0.9} />
      </svg>
    </Box>
  );
}

export default NexoraMark;

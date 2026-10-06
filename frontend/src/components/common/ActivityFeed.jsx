import React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme, alpha } from '@mui/material/styles';
import { getTone } from '../../theme/tones';
import { Badge } from './Badge';

export const ActivityFeed = ({ items = [], emptyMessage = 'No recent activity.' }) => {
  const theme = useTheme();

  if (items.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 2.5, textAlign: 'center' }}>
        {emptyMessage}
      </Typography>
    );
  }

  return (
    <Stack spacing={0} sx={{ position: 'relative' }}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        const toneInfo = getTone(theme, item.tone || 'primary');
        const IconComponent = item.icon;

        return (
          <Stack
            key={item.id || index}
            direction="row"
            spacing={1.75}
            sx={{
              position: 'relative',
              pb: isLast ? 0 : 2,
              '&:hover .activity-dot': {
                transform: 'scale(1.18)',
              },
            }}
          >
            {/* Timeline track and marker */}
            <Stack alignItems="center" sx={{ pt: 0.5 }}>
              <Box
                className="activity-dot"
                sx={{
                  width: item.icon ? 26 : 10,
                  height: item.icon ? 26 : 10,
                  borderRadius: '50%',
                  bgcolor: toneInfo.bg,
                  color: toneInfo.solid,
                  border: `2px solid ${toneInfo.solid}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'transform 200ms ease',
                  zIndex: 1,
                  boxShadow: `0 0 0 3px ${theme.palette.background.paper}`,
                }}
              >
                {IconComponent && <IconComponent sx={{ fontSize: 14 }} />}
              </Box>
              {!isLast && (
                <Box
                  sx={{
                    width: 2,
                    flex: 1,
                    bgcolor: alpha(theme.palette.divider, 0.9),
                    mt: 0.5,
                  }}
                />
              )}
            </Stack>

            {/* Content */}
            <Box sx={{ flex: 1, minWidth: 0, pt: 0.25 }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} useFlexGap flexWrap="wrap">
                <Typography variant="subtitle2" component="h4" sx={{ fontWeight: 600, color: 'text.primary', lineHeight: 1.3 }}>
                  {item.title}
                </Typography>
                {item.timestamp && (
                  <Typography variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {item.timestamp}
                  </Typography>
                )}
              </Stack>

              {item.description && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, fontSize: '0.8125rem', lineHeight: 1.45 }}>
                  {item.description}
                </Typography>
              )}

              {item.meta && (
                <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 0.75 }} useFlexGap flexWrap="wrap">
                  {typeof item.meta === 'string' ? (
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {item.meta}
                    </Typography>
                  ) : Array.isArray(item.meta) ? (
                    item.meta.map((m, i) => (
                      <Badge key={i} variant={m.variant || 'neutral'}>
                        {m.label}
                      </Badge>
                    ))
                  ) : null}
                </Stack>
              )}
            </Box>
          </Stack>
        );
      })}
    </Stack>
  );
};

export default ActivityFeed;

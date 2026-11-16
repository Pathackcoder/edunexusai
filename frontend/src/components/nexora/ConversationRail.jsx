import React from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import ButtonBase from '@mui/material/ButtonBase';
import Tooltip from '@mui/material/Tooltip';
import Skeleton from '@mui/material/Skeleton';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import { nexora } from './nexoraStyle';

const DAY = 86_400_000;
function groupOf(iso) {
  const age = Date.now() - new Date(iso).getTime();
  if (age < DAY) return 'Today';
  if (age < 2 * DAY) return 'Yesterday';
  if (age < 7 * DAY) return 'Previous 7 days';
  return 'Older';
}

/** Conversation history: start a new conversation, reopen or delete an earlier one. */
export function ConversationRail({ conversations, loading, activeId, onSelect, onNew, onDelete }) {
  const groups = [];
  for (const c of conversations ?? []) {
    const label = groupOf(c.lastMessageAt ?? c.updatedAt ?? c.createdAt);
    const group = groups.find((g) => g.label === label) ?? (groups.push({ label, items: [] }), groups[groups.length - 1]);
    group.items.push(c);
  }
  return (
    <Stack sx={{ height: '100%', minHeight: 0 }}>
      <Box sx={{ p: 1.5, pb: 1 }}>
        <Button
          fullWidth
          onClick={onNew}
          startIcon={<AddRoundedIcon />}
          sx={{
            justifyContent: 'flex-start',
            borderRadius: 3,
            py: 1,
            px: 1.5,
            fontWeight: 650,
            color: nexora.ink,
            bgcolor: 'background.paper',
            border: 1,
            borderColor: nexora.hairline,
            boxShadow: '0 6px 16px -14px rgba(18,24,51,0.5)',
            transition: `transform 180ms ${nexora.ease}, box-shadow 180ms ease`,
            '&:hover': { bgcolor: 'background.paper', transform: 'translateY(-1px)', boxShadow: '0 10px 22px -16px rgba(70,81,222,0.7)' },
          }}
        >
          New conversation
        </Button>
      </Box>
      <Box component="nav" aria-label="Nexora conversations" sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 1, pb: 2 }}>
        {loading && !conversations?.length && [0, 1, 2, 3].map((i) => <Skeleton key={i} variant="rounded" height={34} sx={{ mx: 0.5, my: 0.75, borderRadius: 2 }} />)}
        {!loading && !conversations?.length && (
          <Typography variant="caption" component="p" sx={{ px: 1.5, py: 2, color: nexora.muted }}>
            Your conversations will appear here.
          </Typography>
        )}
        {groups.map((group) => (
          <Box key={group.label} sx={{ mt: 1 }}>
            <Typography variant="caption" sx={{ px: 1.25, fontWeight: 700, color: '#8A91AB', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.66rem' }}>
              {group.label}
            </Typography>
            {group.items.map((c) => {
              const active = c.id === activeId;
              return (
                <Box
                  key={c.id}
                  sx={{
                    position: 'relative',
                    mt: 0.25,
                    borderRadius: 2.5,
                    bgcolor: active ? 'rgba(70, 81, 222, 0.10)' : 'transparent',
                    transition: 'background-color 160ms ease',
                    '&:hover': { bgcolor: active ? 'rgba(70, 81, 222, 0.12)' : 'rgba(18, 24, 51, 0.045)' },
                    '&:hover .nx-delete, &:focus-within .nx-delete': { opacity: 1 },
                  }}
                >
                  <ButtonBase
                    onClick={() => onSelect(c.id)}
                    aria-current={active ? 'page' : undefined}
                    sx={{ width: '100%', justifyContent: 'flex-start', gap: 1, pl: 1.25, pr: 4.5, py: 0.9, borderRadius: 'inherit', textAlign: 'left', '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' } }}
                  >
                    <ChatBubbleOutlineRoundedIcon sx={{ fontSize: 15, color: active ? 'primary.main' : '#9AA1B9', flexShrink: 0 }} />
                    <Typography variant="body2" noWrap sx={{ fontWeight: active ? 650 : 500, color: active ? 'primary.dark' : nexora.ink, fontSize: '0.85rem' }}>
                      {c.title}
                    </Typography>
                  </ButtonBase>
                  <Tooltip title="Delete conversation">
                    <IconButton
                      className="nx-delete"
                      size="small"
                      aria-label={`Delete conversation ${c.title}`}
                      onClick={() => onDelete(c)}
                      sx={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', opacity: { xs: 1, md: 0 }, transition: 'opacity 160ms ease', color: '#9AA1B9', '&:hover': { color: 'error.main' } }}
                    >
                      <DeleteOutlineRoundedIcon sx={{ fontSize: 17 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              );
            })}
          </Box>
        ))}
      </Box>
      <Box sx={{ px: 2, py: 1.5, borderTop: 1, borderColor: nexora.hairline }}>
        <Typography variant="caption" sx={{ color: '#8A91AB', lineHeight: 1.45, display: 'block' }}>
          Nexora uses your portal access. It can make mistakes — check important details.
        </Typography>
      </Box>
    </Stack>
  );
}

export default ConversationRail;

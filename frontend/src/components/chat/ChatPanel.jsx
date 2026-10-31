import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Avatar from '@mui/material/Avatar';
import Button from '@mui/material/Button';
import InputBase from '@mui/material/InputBase';
import Skeleton from '@mui/material/Skeleton';
import Tooltip from '@mui/material/Tooltip';
import ButtonBase from '@mui/material/ButtonBase';
import CircularProgress from '@mui/material/CircularProgress';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import PersonSearchOutlinedIcon from '@mui/icons-material/PersonSearchOutlined';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import DoneAllRoundedIcon from '@mui/icons-material/DoneAllRounded';
import DoneRoundedIcon from '@mui/icons-material/DoneRounded';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import { DarkSurface } from '../common/DarkSurface';
import { IconTile } from '../common/IconTile';
import { heroChipSx } from '../dashboard/HeroBanner';
import { useChat } from '../../context/ChatContext';

/**
 * The messaging panel: one right-hand panel with the inbox and, inside it, a conversation. Opened from
 * the header's message icon (inbox) or from a People Search profile ("Chat"), so there is never a drawer
 * on top of a drawer. Full screen on phones.
 */

const MAX_LENGTH = 4000;
const TYPE_LABEL = { student: 'Student', faculty: 'Faculty', staff: 'Staff' };
const GROUP_GAP_MS = 5 * 60_000;

const time = (value) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
function dayLabel(value) {
  const date = new Date(value);
  const diff = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(date);
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }).format(date);
}
/** Inbox timestamp: the time today, otherwise the day. */
const shortWhen = (value) => (dayLabel(value) === 'Today' ? time(value) : dayLabel(value) === 'Yesterday' ? 'Yesterday' : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(new Date(value)));

function PersonAvatar({ person, size = 40 }) {
  return (
    <Avatar aria-hidden="true" sx={{ width: size, height: size, bgcolor: person?.avatarBg || 'primary.main', color: '#fff', fontSize: size * 0.36, fontWeight: 600, flexShrink: 0 }}>
      {person?.initials || '?'}
    </Avatar>
  );
}

const subtitleOf = (person) => [person?.role ?? TYPE_LABEL[person?.type], person?.department].filter(Boolean).join(' · ');

/* ------------------------------------------------------------------ inbox */

function ConversationRow({ conversation, me, onOpen }) {
  const { participant, lastMessage, unread } = conversation;
  const mine = lastMessage?.senderId === me;
  return (
    <ButtonBase
      component="li"
      onClick={() => onOpen(conversation.id)}
      aria-label={`${participant?.name ?? 'Conversation'}${unread ? `, ${unread} unread` : ''}`}
      sx={{ width: '100%', display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5, textAlign: 'left', borderRadius: 3, transition: 'background-color 120ms', '&:hover, &.Mui-focusVisible': { bgcolor: 'action.hover' } }}
    >
      <PersonAvatar person={participant} size={44} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Stack direction="row" alignItems="baseline" spacing={1}>
          <Typography variant="subtitle2" noWrap sx={{ flex: 1, fontWeight: unread ? 700 : 600 }}>{participant?.name ?? 'Conversation'}</Typography>
          {lastMessage && <Typography variant="caption" sx={{ flexShrink: 0, color: unread ? 'primary.main' : 'text.secondary', fontWeight: unread ? 600 : 400 }}>{shortWhen(lastMessage.createdAt)}</Typography>}
        </Stack>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 0.25 }}>
          <Typography variant="body2" noWrap sx={{ flex: 1, color: unread ? 'text.primary' : 'text.secondary', fontWeight: unread ? 500 : 400 }}>
            {lastMessage ? `${mine ? 'You: ' : ''}${lastMessage.body}` : 'No messages yet'}
          </Typography>
          {unread > 0 && (
            <Box component="span" sx={{ flexShrink: 0, minWidth: 20, height: 20, px: 0.75, borderRadius: 10, bgcolor: 'error.main', color: '#fff', fontSize: '0.7rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              {unread > 99 ? '99+' : unread}
            </Box>
          )}
        </Stack>
      </Box>
    </ButtonBase>
  );
}

function InboxView({ chat, onFindPeople }) {
  const { inbox, me, openConversation, loadInbox } = chat;
  if (inbox.loading) {
    return (
      <Stack spacing={0.5} sx={{ p: 1 }} role="status" aria-label="Loading conversations">
        {[0, 1, 2, 3].map((i) => (
          <Stack key={i} direction="row" spacing={1.5} alignItems="center" sx={{ px: 1, py: 1.25 }}>
            <Skeleton variant="circular" width={44} height={44} />
            <Box sx={{ flex: 1 }}><Skeleton width="45%" /><Skeleton width="80%" /></Box>
          </Stack>
        ))}
      </Stack>
    );
  }
  if (inbox.error && !inbox.conversations.length) {
    return (
      <Stack alignItems="center" spacing={1.25} sx={{ p: 4, textAlign: 'center' }} role="alert">
        <ErrorOutlineRoundedIcon color="error" />
        <Typography variant="subtitle2">Your conversations could not be loaded</Typography>
        <Button size="small" variant="outlined" onClick={loadInbox}>Try again</Button>
      </Stack>
    );
  }
  if (!inbox.conversations.length) {
    return (
      <Stack alignItems="center" spacing={1.5} sx={{ px: 4, py: 7, textAlign: 'center' }}>
        <IconTile icon={ForumOutlinedIcon} tone="primary" size={64} sx={{ borderRadius: '50%' }} />
        <Typography variant="h6" component="h3">No conversations yet</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 300 }}>
          Find a classmate, instructor or staff member in People Search and choose Chat to send your first message.
        </Typography>
        <Button variant="contained" startIcon={<PersonSearchOutlinedIcon />} onClick={onFindPeople}>Find people</Button>
      </Stack>
    );
  }
  return (
    <Box component="ul" aria-label="Conversations" sx={{ listStyle: 'none', m: 0, p: 1 }}>
      {inbox.conversations.map((c) => <ConversationRow key={c.id} conversation={c} me={me} onOpen={(id) => openConversation(id, c)} />)}
    </Box>
  );
}

/* ------------------------------------------------------------------ conversation */

function MessageStatus({ message, seen, onRetry }) {
  if (message.status === 'sending') return <Stack direction="row" alignItems="center" spacing={0.5}><ScheduleRoundedIcon sx={{ fontSize: 13 }} /><span>Sending…</span></Stack>;
  if (message.status === 'failed') {
    return (
      <Stack direction="row" alignItems="center" spacing={0.75} sx={{ color: 'error.main' }}>
        <ErrorOutlineRoundedIcon sx={{ fontSize: 14 }} />
        <span>{message.error || 'Not sent.'}</span>
        <Box component="button" type="button" onClick={onRetry} sx={{ border: 0, background: 'none', p: 0, color: 'primary.main', font: 'inherit', fontWeight: 600, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}>Retry</Box>
      </Stack>
    );
  }
  return (
    <Stack direction="row" alignItems="center" spacing={0.5}>
      <span>{time(message.createdAt)}</span>
      {seen ? <DoneAllRoundedIcon titleAccess="Seen" sx={{ fontSize: 14, color: 'primary.main' }} /> : <DoneRoundedIcon titleAccess="Sent" sx={{ fontSize: 14 }} />}
    </Stack>
  );
}

function Bubble({ message, mine, first, last, seen, onRetry }) {
  const r = 18;
  const tight = 6;
  return (
    <Stack alignItems={mine ? 'flex-end' : 'flex-start'} sx={{ mt: first ? 1.25 : 0.375 }}>
      <Box
        sx={{
          maxWidth: '82%',
          px: 1.75,
          py: 1,
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          typography: 'body2',
          lineHeight: 1.5,
          borderRadius: `${r}px`,
          ...(mine
            ? { bgcolor: 'primary.main', color: 'primary.contrastText', borderTopRightRadius: first ? r : tight, borderBottomRightRadius: tight, opacity: message.status === 'sending' ? 0.75 : 1 }
            : { bgcolor: 'background.paper', color: 'text.primary', border: 1, borderColor: 'divider', borderTopLeftRadius: first ? r : tight, borderBottomLeftRadius: tight }),
          ...(message.status === 'failed' ? { bgcolor: 'background.paper', color: 'text.primary', border: 1, borderColor: 'error.light' } : {}),
          boxShadow: mine ? '0 6px 16px -10px rgba(40, 44, 140, 0.55)' : 'none',
        }}
      >
        {message.body}
      </Box>
      {(last || message.status === 'sending' || message.status === 'failed') && (
        <Box sx={{ mt: 0.5, px: 0.5, typography: 'caption', color: 'text.secondary', fontSize: '0.72rem' }}>
          {mine ? <MessageStatus message={message} seen={seen} onRetry={onRetry} /> : time(message.createdAt)}
        </Box>
      )}
    </Stack>
  );
}

function MessageList({ chat, conversationId, participant }) {
  const thread = chat.threads[conversationId] ?? { messages: [] };
  const scroller = useRef(null);
  const stick = useRef(true);
  const count = thread.messages.length;
  const lastMine = thread.messages.at(-1)?.senderId === chat.me;

  // Stay at the bottom as messages arrive, unless the reader scrolled up to older ones.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && (stick.current || lastMine)) el.scrollTop = el.scrollHeight;
  }, [count, lastMine, thread.loading]);

  const rows = useMemo(() => {
    const out = [];
    let previous = null;
    thread.messages.forEach((m, i) => {
      const next = thread.messages[i + 1];
      if (!previous || dayLabel(previous.createdAt) !== dayLabel(m.createdAt)) out.push({ day: dayLabel(m.createdAt), key: `day-${m.id}` });
      const first = !previous || previous.senderId !== m.senderId || new Date(m.createdAt) - new Date(previous.createdAt) > GROUP_GAP_MS || dayLabel(previous.createdAt) !== dayLabel(m.createdAt);
      const last = !next || next.senderId !== m.senderId || new Date(next.createdAt) - new Date(m.createdAt) > GROUP_GAP_MS || dayLabel(next.createdAt) !== dayLabel(m.createdAt);
      out.push({ message: m, first, last, key: m.clientId ? `c-${m.clientId}` : m.id });
      previous = m;
    });
    return out;
  }, [thread.messages]);

  const readAt = thread.participantReadAt ? new Date(thread.participantReadAt) : null;

  if (thread.loading && !count) {
    return (
      <Stack sx={{ flex: 1, p: 2.5 }} spacing={1.5} role="status" aria-label="Loading messages">
        <Skeleton variant="rounded" width="55%" height={38} sx={{ borderRadius: 4 }} />
        <Skeleton variant="rounded" width="40%" height={38} sx={{ borderRadius: 4, alignSelf: 'flex-end' }} />
        <Skeleton variant="rounded" width="62%" height={56} sx={{ borderRadius: 4 }} />
      </Stack>
    );
  }
  if (thread.error && !count) {
    return (
      <Stack sx={{ flex: 1, p: 4, textAlign: 'center' }} alignItems="center" justifyContent="center" spacing={1.25} role="alert">
        <ErrorOutlineRoundedIcon color="error" />
        <Typography variant="subtitle2">This conversation could not be loaded</Typography>
        <Button size="small" variant="outlined" onClick={() => chat.loadThread(conversationId)}>Try again</Button>
      </Stack>
    );
  }

  return (
    <Box
      ref={scroller}
      onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}
      role="log"
      aria-live="polite"
      aria-label={`Messages with ${participant?.name ?? 'this person'}`}
      sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: { xs: 2, sm: 2.5 }, pt: 1, pb: 2 }}
    >
      {thread.hasMore && (
        <Stack alignItems="center" sx={{ py: 1 }}>
          <Button size="small" onClick={() => chat.loadOlder(conversationId)} disabled={thread.loadingOlder}>{thread.loadingOlder ? 'Loading…' : 'Load earlier messages'}</Button>
        </Stack>
      )}
      {!count && (
        <Stack alignItems="center" spacing={1.25} sx={{ pt: 6, px: 3, textAlign: 'center' }}>
          <PersonAvatar person={participant} size={64} />
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Start your conversation with {participant?.name ?? 'this person'}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 300 }}>Messages are private to the two of you and stay here when you come back.</Typography>
        </Stack>
      )}
      {rows.map((row) => (row.day ? (
        <Stack key={row.key} direction="row" alignItems="center" spacing={1.5} sx={{ my: 1.5 }} aria-hidden="true">
          <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider' }} />
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: '0.02em' }}>{row.day}</Typography>
          <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider' }} />
        </Stack>
      ) : (
        <Bubble
          key={row.key}
          message={row.message}
          mine={row.message.senderId === chat.me}
          first={row.first}
          last={row.last}
          seen={Boolean(readAt && row.message.status !== 'sending' && row.message.status !== 'failed' && readAt >= new Date(row.message.createdAt))}
          onRetry={() => chat.retry(conversationId, row.message)}
        />
      )))}
    </Box>
  );
}

function Composer({ chat, conversationId, participant }) {
  const [text, setText] = useState('');
  const input = useRef(null);
  const disabled = participant && participant.active === false;
  useEffect(() => {
    setText('');
    const t = setTimeout(() => input.current?.focus(), 360); // after the panel's slide-in
    return () => clearTimeout(t);
  }, [conversationId]);
  const submit = () => {
    if (!text.trim() || text.length > MAX_LENGTH || disabled) return;
    chat.send(conversationId, text);
    setText('');
    input.current?.focus();
  };
  const first = participant?.name?.split(' ').find((w) => !/^(Dr|Prof)\.?$/.test(w)) ?? '';
  return (
    <Box component="form" onSubmit={(e) => { e.preventDefault(); submit(); }} sx={{ flexShrink: 0, px: { xs: 1.5, sm: 2 }, pt: 1.25, pb: 'max(12px, env(safe-area-inset-bottom))', borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
      {disabled ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 1, textAlign: 'center' }}>{participant.name} can no longer receive messages.</Typography>
      ) : (
        <Stack direction="row" alignItems="flex-end" spacing={1}>
          <InputBase
            inputRef={input}
            multiline
            maxRows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter is a new line (and nothing is sent while an IME is composing).
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={first ? `Message ${first}…` : 'Write a message…'}
            inputProps={{ 'aria-label': 'Message', maxLength: MAX_LENGTH + 200 }}
            sx={{ flex: 1, px: 1.75, py: 1, borderRadius: 5, bgcolor: 'background.default', border: 1, borderColor: 'divider', typography: 'body2', transition: 'border-color 120ms', '&.Mui-focused': { borderColor: 'primary.main' } }}
          />
          <Tooltip title="Send (Enter)">
            <span>
              <IconButton type="submit" aria-label="Send message" disabled={!text.trim() || text.length > MAX_LENGTH} sx={{ width: 42, height: 42, bgcolor: 'primary.main', color: 'primary.contrastText', '&:hover': { bgcolor: 'primary.dark' }, '&.Mui-disabled': { bgcolor: 'action.disabledBackground', color: 'action.disabled' } }}>
                <SendRoundedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      )}
      {text.length > MAX_LENGTH - 400 && (
        <Typography variant="caption" sx={{ display: 'block', mt: 0.5, px: 1, color: text.length > MAX_LENGTH ? 'error.main' : 'text.secondary' }}>
          {text.length} / {MAX_LENGTH} characters
        </Typography>
      )}
    </Box>
  );
}

/* ------------------------------------------------------------------ panel */

function ConnectionNote({ status }) {
  if (status === 'connected' || status === 'idle' || status === 'connecting') return null;
  return (
    <Box role="status" sx={{ ...heroChipSx, mt: 1.25, display: 'inline-flex', alignItems: 'center', gap: 0.75, px: 1.25, py: 0.375, borderRadius: 999, typography: 'caption', color: 'rgba(255,255,255,0.9)' }}>
      {status === 'reconnecting' ? <CircularProgress size={10} thickness={6} sx={{ color: 'inherit' }} /> : <ErrorOutlineRoundedIcon sx={{ fontSize: 14 }} />}
      {status === 'reconnecting' ? 'Reconnecting… messages will still be sent' : 'Live updates are off. Messages are still sent.'}
    </Box>
  );
}

export function ChatPanel() {
  const chat = useChat();
  const navigate = useNavigate();
  if (!chat) return null;
  const { panel, threads, inbox, status, closePanel, backToInbox, unreadTotal } = chat;
  const id = panel.conversationId;
  const conversation = id ? threads[id]?.conversation ?? inbox.conversations.find((c) => c.id === id) ?? null : null;
  const participant = conversation?.participant ?? null;
  const findPeople = () => { closePanel(); navigate('/campus/people'); };

  return (
    <Drawer
      anchor="right"
      open={panel.open}
      onClose={closePanel}
      PaperProps={{
        role: 'dialog',
        'aria-labelledby': 'chat-panel-title',
        sx: { width: { xs: '100%', sm: 440 }, maxWidth: '100vw', border: 0, bgcolor: 'background.default', boxShadow: '-24px 0 60px -30px rgba(20, 24, 80, 0.45)', display: 'flex', flexDirection: 'column' },
      }}
      transitionDuration={{ enter: 320, exit: 220 }}
    >
      <DarkSurface glow="tr" sx={{ flexShrink: 0, px: { xs: 2, sm: 2.5 }, pt: 2, pb: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ pr: 5 }}>
          {id ? (
            <>
              <IconButton onClick={backToInbox} aria-label="Back to all conversations" size="small" sx={{ ml: -0.5 }}>
                <ArrowBackRoundedIcon fontSize="small" />
              </IconButton>
              <PersonAvatar person={participant} size={44} />
              <Box sx={{ minWidth: 0 }}>
                <Typography id="chat-panel-title" variant="h6" component="h2" noWrap sx={{ color: '#fff', lineHeight: 1.25 }}>{participant?.name ?? 'Conversation'}</Typography>
                <Typography variant="caption" noWrap component="p" sx={{ color: 'text.secondary' }}>{subtitleOf(participant) || 'EdunexusAI member'}</Typography>
              </Box>
            </>
          ) : (
            <Box>
              <Typography id="chat-panel-title" variant="h5" component="h2" sx={{ color: '#fff' }}>Messages</Typography>
              <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }}>
                {unreadTotal ? `${unreadTotal} unread ${unreadTotal === 1 ? 'message' : 'messages'}` : 'Private one-to-one conversations'}
              </Typography>
            </Box>
          )}
        </Stack>
        <IconButton onClick={closePanel} aria-label="Close messages" size="small" sx={{ position: 'absolute', top: 14, right: 12 }}>
          <CloseRoundedIcon fontSize="small" />
        </IconButton>
        <ConnectionNote status={status} />
      </DarkSurface>

      {panel.opening ? (
        <Stack sx={{ flex: 1 }} alignItems="center" justifyContent="center" spacing={1.5} role="status">
          <CircularProgress size={28} />
          <Typography variant="body2" color="text.secondary">Opening the conversation…</Typography>
        </Stack>
      ) : panel.error && !id ? (
        <Stack sx={{ flex: 1, p: 4, textAlign: 'center' }} alignItems="center" justifyContent="center" spacing={1.25} role="alert">
          <ErrorOutlineRoundedIcon color="error" />
          <Typography variant="subtitle2">{panel.error.message ?? 'The conversation could not be opened.'}</Typography>
          <Button size="small" variant="outlined" onClick={backToInbox}>Go to messages</Button>
        </Stack>
      ) : id ? (
        <>
          <MessageList chat={chat} conversationId={id} participant={participant} />
          <Composer chat={chat} conversationId={id} participant={participant} />
        </>
      ) : (
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <InboxView chat={chat} onFindPeople={findPeople} />
        </Box>
      )}
    </Drawer>
  );
}

export default ChatPanel;

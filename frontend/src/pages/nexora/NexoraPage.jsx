import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Tooltip from '@mui/material/Tooltip';
import Drawer from '@mui/material/Drawer';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Skeleton from '@mui/material/Skeleton';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import MenuOpenRoundedIcon from '@mui/icons-material/MenuOpenRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import EditNoteRoundedIcon from '@mui/icons-material/EditNoteRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
import SchoolRoundedIcon from '@mui/icons-material/SchoolRounded';
import AssignmentTurnedInRoundedIcon from '@mui/icons-material/AssignmentTurnedInRounded';
import WorkspacePremiumRoundedIcon from '@mui/icons-material/WorkspacePremiumRounded';
import EventAvailableRoundedIcon from '@mui/icons-material/EventAvailableRounded';
import CelebrationRoundedIcon from '@mui/icons-material/CelebrationRounded';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import ForumRoundedIcon from '@mui/icons-material/ForumRounded';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import SupportAgentRoundedIcon from '@mui/icons-material/SupportAgentRounded';
import CampaignRoundedIcon from '@mui/icons-material/CampaignRounded';
import GppMaybeRoundedIcon from '@mui/icons-material/GppMaybeRounded';
import QueryStatsRoundedIcon from '@mui/icons-material/QueryStatsRounded';
import PersonSearchRoundedIcon from '@mui/icons-material/PersonSearchRounded';
import { useApiQuery } from '../../hooks/useApiQuery';
import { nexoraApi } from '../../services/api';
import { useReadOnly } from '../../viewAs/ReadOnly';
import { useToast } from '../../components/common/Toast';
import { NexoraMark } from '../../components/nexora/NexoraMark';
import { NexoraMarkdown } from '../../components/nexora/NexoraMarkdown';
import { ActionCard } from '../../components/nexora/ActionCard';
import { Composer } from '../../components/nexora/Composer';
import { ConversationRail } from '../../components/nexora/ConversationRail';
import { EventNote, SlotPicker, ToolTrail, TypingIndicator } from '../../components/nexora/MessageParts';
import { keyframes, nexora, reducedMotion } from '../../components/nexora/nexoraStyle';
import { useNexoraSession } from '../../components/nexora/NexoraSession';
import { layout } from '../../theme/theme';

const SUGGESTION_ICONS = {
  schedule: CalendarMonthRoundedIcon,
  grades: SchoolRoundedIcon,
  assignments: AssignmentTurnedInRoundedIcon,
  credits: WorkspacePremiumRoundedIcon,
  advising: EventAvailableRoundedIcon,
  events: CelebrationRoundedIcon,
  report: InsightsRoundedIcon,
  message: ForumRoundedIcon,
  hours: AccessTimeRoundedIcon,
  support: SupportAgentRoundedIcon,
  announce: CampaignRoundedIcon,
  holds: GppMaybeRoundedIcon,
  analytics: QueryStatsRoundedIcon,
  people: PersonSearchRoundedIcon,
};

const RAIL_WIDTH = 268;

const greeting = () => {
  const hour = new Date().getHours();
  return hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
};

/** Tool chips for a stored message: names and outcomes only (what the portal persisted). */
const storedTools = (message, labelOf) =>
  (message.toolActivity ?? []).map((t, i) => ({ id: `${message.id}-${i}`, name: t.name, label: labelOf(t.name), state: ['error', 'denied', 'invalid'].includes(t.outcome) ? 'error' : 'done' }));

/**
 * Nexora: the AI workspace. History on the left, the conversation in the centre, the composer docked at the bottom
 * (or centred, large, on an empty workspace). Answers stream in; actions arrive as cards that need confirmation.
 */
/**
 * Read-only View-As: Nexora is not offered. Its conversations are private to the person, and it can take actions;
 * neither may happen on someone else's behalf. (The server refuses both as well.)
 */
function NexoraViewAsNotice() {
  return (
    <Stack alignItems="center" justifyContent="center" spacing={1.5} sx={{ flex: 1, minHeight: 360, px: 3, textAlign: 'center' }}>
      <NexoraMark size={44} />
      <Typography variant="h5" component="h1">Nexora is not available in View-As</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: '52ch' }}>
        Nexora conversations are private to the person, and Nexora can take actions such as booking appointments or
        sending messages. In a read-only View-As session neither is possible, so this workspace is closed.
      </Typography>
    </Stack>
  );
}

export function NexoraPage() {
  if (useReadOnly()) return <NexoraViewAsNotice />;
  return <NexoraWorkspace />;
}

function NexoraWorkspace() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'), { noSsr: true });
  const { showToast } = useToast();
  const { data: session, loading: sessionLoading } = useApiQuery(() => nexoraApi.session());
  const [conversations, setConversations] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [streaming, setStreaming] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const abortRef = useRef(null);
  const draftRef = useRef(null);
  const freshIdRef = useRef(null);
  const scrollRef = useRef(null);
  const stickRef = useRef(true);
  const composerRef = useRef(null);

  const labels = useMemo(() => Object.fromEntries((session?.capabilities ?? []).map((c) => [c.name, c.label])), [session]);
  const labelOf = useCallback((name) => labels[name] ?? 'Checked the portal', [labels]);
  const available = session?.available !== false;

  const loadConversations = useCallback(async () => {
    try {
      setConversations(await nexoraApi.conversations());
    } catch {
      /* the rail simply stays as it was */
    } finally {
      setListLoading(false);
    }
  }, []);
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Open the conversation in the URL (skipped for one this page just created and is streaming into).
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return undefined;
    }
    if (freshIdRef.current === conversationId) return undefined;
    let cancelled = false;
    setThreadLoading(true);
    nexoraApi
      .conversation(conversationId)
      .then((c) => !cancelled && setMessages(c.messages))
      .catch(() => {
        if (cancelled) return;
        showToast('That conversation could not be opened.', 'error');
        navigate('/nexora', { replace: true });
      })
      .finally(() => !cancelled && setThreadLoading(false));
    stickRef.current = true;
    return () => {
      cancelled = true;
    };
  }, [conversationId, navigate, showToast]);

  // Follow the answer as it streams, unless the person scrolled up to read.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTo({ top: el.scrollHeight, behavior: streaming ? 'auto' : 'smooth' });
  }, [messages, streaming]);
  const onScroll = () => {
    const el = scrollRef.current;
    if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  useEffect(() => () => abortRef.current?.abort(), []);

  const patchAction = useCallback((action) => {
    const patch = (list) => list.map((m) => (m.blocks?.some((b) => b.type === 'action' && b.actionId === action.id) ? { ...m, blocks: m.blocks.map((b) => (b.type === 'action' && b.actionId === action.id ? { ...b, action } : b)) } : m));
    setMessages(patch);
  }, []);

  const send = useCallback(
    async (text, selection = null) => {
      if (streaming || !text.trim()) return;
      let id = conversationId;
      try {
        if (!id) {
          const created = await nexoraApi.createConversation();
          id = created.id;
          freshIdRef.current = id;
          setConversations((prev) => [{ ...created, title: text.slice(0, 70) }, ...prev]);
          navigate(`/nexora/${id}`);
        }
      } catch (error) {
        showToast(error.message ?? 'Nexora could not start a conversation.', 'error');
        return;
      }
      const localId = `local-${Date.now()}`;
      setMessages((prev) => [...prev, { id: localId, role: 'user', content: text, blocks: selection ? [{ type: 'selection', ...selection }] : [] }]);
      draftRef.current = { content: '', tools: [], blocks: [] };
      setStreaming(draftRef.current);
      stickRef.current = true;
      const controller = new AbortController();
      abortRef.current = controller;
      const update = (fn) => {
        draftRef.current = fn(draftRef.current);
        setStreaming(draftRef.current);
      };
      try {
        await nexoraApi.streamMessage(id, { message: text, selection }, {
          signal: controller.signal,
          onEvent: (event, data) => {
            if (event === 'start') setMessages((prev) => prev.map((m) => (m.id === localId ? data.userMessage : m)));
            else if (event === 'text') update((d) => ({ ...d, content: d.content + data.delta }));
            else if (event === 'tool') update((d) => ({ ...d, tools: d.tools.some((t) => t.id === data.id) ? d.tools.map((t) => (t.id === data.id ? { ...t, state: data.state } : t)) : [...d.tools, data] }));
            else if (event === 'block') update((d) => ({ ...d, blocks: [...d.blocks, data.block] }));
            else if (event === 'done') {
              const liveTools = draftRef.current.tools;
              draftRef.current = null;
              setMessages((prev) => [...prev, { ...data.message, liveTools }]);
              setStreaming(null);
            } else if (event === 'error') {
              draftRef.current = null;
              setMessages((prev) => [...prev, { id: data.messageId ?? `err-${Date.now()}`, role: 'assistant', status: 'ERROR', content: data.message, retryable: data.retryable, retryText: text }]);
              setStreaming(null);
            }
          },
        });
      } catch (error) {
        const draft = draftRef.current;
        if (error.name === 'AbortError') {
          if (draft) setMessages((prev) => [...prev, { id: `stopped-${Date.now()}`, role: 'assistant', status: 'INTERRUPTED', content: draft.content, blocks: draft.blocks, liveTools: draft.tools }]);
        } else {
          setMessages((prev) => [...prev, { id: `err-${Date.now()}`, role: 'assistant', status: 'ERROR', content: error.message, retryable: error.status !== 409 || error.details?.reason !== 'CONVERSATION_FULL', retryText: text, full: error.details?.reason === 'CONVERSATION_FULL' }]);
        }
      } finally {
        draftRef.current = null;
        setStreaming(null);
        abortRef.current = null;
        freshIdRef.current = null;
        loadConversations();
      }
    },
    [conversationId, loadConversations, navigate, showToast, streaming],
  );

  const stop = () => abortRef.current?.abort();

  const decide = useCallback(
    async (actionId, decision) => {
      try {
        const { action, event } = await nexoraApi.decide(actionId, decision);
        patchAction(action);
        setMessages((prev) => [...prev, event]);
        if (action.status === 'EXECUTED') showToast(action.result?.summary ?? 'Done.', 'success');
        else if (action.status === 'FAILED') showToast(action.errorMessage ?? 'The portal could not complete this.', 'error');
      } catch (error) {
        if (error.details?.action) patchAction(error.details.action);
        showToast(error.message ?? 'That could not be completed.', 'error');
      }
    },
    [patchAction, showToast],
  );

  const openConversation = (id) => {
    setHistoryOpen(false);
    if (id !== conversationId) navigate(`/nexora/${id}`);
  };
  const newConversation = () => {
    abortRef.current?.abort();
    setHistoryOpen(false);
    navigate('/nexora');
    requestAnimationFrame(() => composerRef.current?.focus());
  };
  const confirmDelete = async () => {
    const target = toDelete;
    setToDelete(null);
    try {
      await nexoraApi.deleteConversation(target.id);
      setConversations((prev) => prev.filter((c) => c.id !== target.id));
      if (target.id === conversationId) navigate('/nexora', { replace: true });
    } catch (error) {
      showToast(error.message ?? 'The conversation could not be deleted.', 'error');
    }
  };
  const { close: leave } = useNexoraSession();

  const empty = !conversationId && !messages.length && !streaming;
  const title = conversations.find((c) => c.id === conversationId)?.title ?? (conversationId ? 'Conversation' : 'New conversation');

  const rail = (
    <ConversationRail conversations={conversations} loading={listLoading} activeId={conversationId} onSelect={openConversation} onNew={newConversation} onDelete={setToDelete} />
  );

  return (
    <Box
      sx={{
        ...keyframes,
        ...reducedMotion,
        position: 'relative',
        display: 'flex',
        height: `calc(100vh - ${layout.headerHeight}px)`,
        minHeight: 0,
        overflow: 'hidden',
        isolation: 'isolate',
        animation: `nxWorkspaceIn 420ms ${nexora.ease} both`,
        bgcolor: '#F7F8FC',
      }}
    >
      {/* Aurora atmosphere */}
      <Box aria-hidden sx={{ position: 'absolute', inset: 0, zIndex: -1, pointerEvents: 'none', background: nexora.aurora, opacity: empty ? 1 : 0.55, transition: 'opacity 600ms ease' }} />

      {isDesktop ? (
        <Box component="aside" sx={{ width: RAIL_WIDTH, flexShrink: 0, borderRight: 1, borderColor: nexora.hairline, bgcolor: 'rgba(255,255,255,0.55)', backdropFilter: 'blur(14px)' }}>
          {rail}
        </Box>
      ) : (
        <Drawer open={historyOpen} onClose={() => setHistoryOpen(false)} PaperProps={{ sx: { width: RAIL_WIDTH + 24, maxWidth: '86vw', bgcolor: '#FBFBFE' } }}>
          {rail}
        </Drawer>
      )}

      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Workspace bar */}
        <Stack direction="row" alignItems="center" spacing={1} sx={{ px: { xs: 1, sm: 2 }, py: 1, minHeight: 52 }}>
          {!isDesktop && (
            <Tooltip title="Conversations">
              <IconButton onClick={() => setHistoryOpen(true)} aria-label="Open conversation history">
                <MenuOpenRoundedIcon />
              </IconButton>
            </Tooltip>
          )}
          <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0, flex: 1 }}>
            <NexoraMark size={22} active={Boolean(streaming)} />
            <Typography sx={{ fontWeight: 750, letterSpacing: '-0.01em', fontSize: '1rem', background: nexora.spectrum, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Nexora</Typography>
            {!empty && (
              <Typography variant="body2" noWrap sx={{ color: nexora.muted, pl: 1, ml: 0.5, borderLeft: 1, borderColor: nexora.hairline, minWidth: 0 }}>
                {title}
              </Typography>
            )}
          </Stack>
          {!empty && (
            <Tooltip title="New conversation">
              <IconButton onClick={newConversation} aria-label="New conversation">
                <EditNoteRoundedIcon />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Close Nexora">
            <IconButton onClick={leave} aria-label="Close Nexora">
              <CloseRoundedIcon />
            </IconButton>
          </Tooltip>
        </Stack>

        {empty ? (
          <EmptyWorkspace session={session} loading={sessionLoading} available={available} onSend={send} composerRef={composerRef} />
        ) : (
          <>
            <Box ref={scrollRef} onScroll={onScroll} sx={{ flex: 1, minHeight: 0, overflowY: 'auto', scrollBehavior: 'smooth' }} aria-live="polite" aria-busy={Boolean(streaming)}>
              <Box sx={{ maxWidth: 800, mx: 'auto', px: { xs: 2, sm: 3 }, pt: 2, pb: 4 }}>
                {threadLoading && !messages.length && <ThreadSkeleton />}
                {messages.map((m) =>
                  m.role === 'user' ? (
                    <UserMessage key={m.id} message={m} />
                  ) : m.role === 'event' ? (
                    <EventNote key={m.id} message={m} />
                  ) : (
                    <AssistantMessage key={m.id} message={m} tools={m.liveTools ?? storedTools(m, labelOf)} onDecide={decide} onSelectSlot={(slot) => send(`I'd like ${slot.when}.`, { kind: 'advising_slot', ref: slot.slotRef, label: slot.when })} busy={Boolean(streaming)} onRetry={m.retryText ? () => send(m.retryText) : null} onNew={newConversation} />
                  ),
                )}
                {streaming && <AssistantMessage message={{ id: 'draft', content: streaming.content, blocks: streaming.blocks }} tools={streaming.tools} streaming onDecide={decide} busy />}
              </Box>
            </Box>
            <Box sx={{ position: 'relative', px: { xs: 1.5, sm: 3 }, pb: { xs: 1.5, sm: 2.25 }, pt: 1 }}>
              <Box aria-hidden sx={{ position: 'absolute', left: 0, right: 0, bottom: '100%', height: 28, background: 'linear-gradient(180deg, rgba(247,248,252,0), #F7F8FC)', pointerEvents: 'none' }} />
              <Box sx={{ maxWidth: 800, mx: 'auto' }}>
                <Composer ref={composerRef} onSend={send} onStop={stop} streaming={Boolean(streaming)} disabled={!available} placeholder={available ? 'Ask a follow-up…' : 'Nexora is not available right now'} />
              </Box>
            </Box>
          </>
        )}
      </Box>

      <Dialog open={Boolean(toDelete)} onClose={() => setToDelete(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Delete this conversation?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            “{toDelete?.title}” and its messages will be removed from your Nexora history. Anything already sent or booked stays as it is.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setToDelete(null)} color="inherit">Keep</Button>
          <Button onClick={confirmDelete} color="error" variant="contained" disableElevation>Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function EmptyWorkspace({ session, loading, available, onSend, composerRef }) {
  return (
    <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex' }}>
      <Box sx={{ m: 'auto', width: '100%', maxWidth: 760, px: { xs: 2, sm: 3 }, py: { xs: 3, md: 6 } }}>
        <Stack alignItems="center" textAlign="center" spacing={1.5} sx={{ mb: { xs: 3, md: 4 } }}>
          <Box sx={{ position: 'relative', mb: 1, animation: 'nxDrift 6s ease-in-out infinite' }}>
            <Box aria-hidden sx={{ position: 'absolute', inset: -18, borderRadius: '50%', background: nexora.spectrum, filter: 'blur(26px)', opacity: 0.32 }} />
            <Box sx={{ position: 'relative', width: 68, height: 68, borderRadius: 5, display: 'grid', placeItems: 'center', bgcolor: 'rgba(255,255,255,0.9)', border: 1, borderColor: nexora.hairline, boxShadow: '0 18px 40px -22px rgba(70,81,222,0.7)' }}>
              <NexoraMark size={38} />
            </Box>
          </Box>
          {loading ? (
            <Skeleton width={280} height={44} />
          ) : (
            <Typography component="h1" sx={{ fontWeight: 750, letterSpacing: '-0.025em', lineHeight: 1.15, fontSize: { xs: '1.75rem', sm: '2.25rem' }, color: nexora.ink, animation: 'nxFadeUp 500ms ease both' }}>
              {greeting()}
              {session?.firstName ? (
                <>
                  ,{' '}
                  <Box component="span" sx={{ background: nexora.spectrum, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
                    {session.firstName}
                  </Box>
                </>
              ) : null}
            </Typography>
          )}
          <Typography sx={{ color: nexora.muted, fontSize: { xs: '0.98rem', sm: '1.06rem' }, maxWidth: 520, animation: 'nxFadeUp 500ms 80ms ease both' }}>
            Ask about your classes, records and campus — or have Nexora take care of it for you, with your confirmation.
          </Typography>
        </Stack>

        {!available && !loading && (
          <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: 2, p: 1.5, borderRadius: 3, bgcolor: 'warning.lighter', color: 'warning.dark' }}>
            <ErrorOutlineRoundedIcon sx={{ fontSize: 20, mt: '1px' }} />
            <Typography variant="body2" sx={{ fontWeight: 550 }}>{session?.unavailableReason ?? 'Nexora is not available right now.'}</Typography>
          </Stack>
        )}

        <Box sx={{ animation: 'nxFadeUp 520ms 140ms ease both' }}>
          <Composer ref={composerRef} large onSend={onSend} disabled={!available} />
        </Box>

        <Box sx={{ mt: 3, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 1.25 }}>
          {(session?.suggestions ?? []).map((s, i) => {
            const Icon = SUGGESTION_ICONS[s.icon] ?? ForumRoundedIcon;
            return (
              <ButtonBase
                key={s.label}
                disabled={!available}
                onClick={() => onSend(s.label)}
                sx={{
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  gap: 1.25,
                  p: 1.5,
                  borderRadius: 3.5,
                  border: 1,
                  borderColor: nexora.hairline,
                  bgcolor: 'rgba(255,255,255,0.72)',
                  backdropFilter: 'blur(8px)',
                  animation: `nxFadeUp 420ms ${200 + i * 55}ms ease both`,
                  transition: `transform 220ms ${nexora.spring}, box-shadow 220ms ease, border-color 220ms ease, background-color 220ms ease`,
                  '&:hover': { transform: 'translateY(-2px)', borderColor: 'primary.light', bgcolor: '#fff', boxShadow: '0 16px 30px -22px rgba(70,81,222,0.75)' },
                  '&:hover .nx-icon': { background: nexora.gradient, color: '#fff' },
                  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                  '&.Mui-disabled': { opacity: 0.5 },
                }}
              >
                <Box className="nx-icon" sx={{ width: 34, height: 34, borderRadius: 2.5, display: 'grid', placeItems: 'center', flexShrink: 0, bgcolor: 'primary.lighter', color: 'primary.dark', transition: 'background 220ms ease, color 220ms ease' }}>
                  <Icon sx={{ fontSize: 18 }} />
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 600, color: nexora.ink, lineHeight: 1.35 }}>{s.label}</Typography>
              </ButtonBase>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}

function UserMessage({ message }) {
  const selection = message.blocks?.find((b) => b.type === 'selection');
  return (
    <Stack alignItems="flex-end" sx={{ my: 2, animation: 'nxFadeUp 280ms ease both' }}>
      <Box sx={{ maxWidth: { xs: '88%', sm: '76%' }, px: 2, py: 1.25, borderRadius: '20px 20px 6px 20px', color: nexora.ink, background: 'linear-gradient(135deg, rgba(70,81,222,0.12), rgba(139,92,246,0.12))', border: 1, borderColor: 'rgba(70,81,222,0.14)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.96rem', lineHeight: 1.6 }}>
        {message.content}
      </Box>
      {selection && (
        <Typography variant="caption" sx={{ mt: 0.5, color: nexora.muted, fontWeight: 600 }}>
          Selected: {selection.label}
        </Typography>
      )}
    </Stack>
  );
}

function AssistantMessage({ message, tools, streaming = false, onDecide, onSelectSlot, busy, onRetry, onNew }) {
  const failed = message.status === 'ERROR';
  const showTyping = streaming && !message.content && !(message.blocks ?? []).length;
  return (
    <Stack direction="row" spacing={1.5} sx={{ my: 2.5, animation: 'nxFadeUp 320ms ease both' }}>
      <Box sx={{ width: 32, height: 32, borderRadius: 2.5, display: 'grid', placeItems: 'center', flexShrink: 0, bgcolor: '#fff', border: 1, borderColor: nexora.hairline, boxShadow: '0 6px 16px -12px rgba(70,81,222,0.7)', mt: '2px' }}>
        <NexoraMark size={18} active={streaming} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0, pt: '4px' }}>
        <ToolTrail tools={tools} />
        {showTyping && <TypingIndicator label={tools?.some((t) => t.state === 'running') ? 'Working on it' : 'Nexora is thinking'} />}
        {failed ? (
          <Box sx={{ p: 1.75, borderRadius: 3, border: 1, borderColor: 'warning.light', bgcolor: 'warning.lighter' }}>
            <Stack direction="row" spacing={1} alignItems="flex-start">
              <ErrorOutlineRoundedIcon sx={{ color: 'warning.dark', fontSize: 20, mt: '1px' }} />
              <Typography variant="body2" sx={{ color: 'warning.dark', fontWeight: 600, flex: 1 }}>{message.content}</Typography>
            </Stack>
            {message.full ? (
              <Button size="small" onClick={onNew} sx={{ mt: 1, ml: 3.5, fontWeight: 650 }}>Start a new conversation</Button>
            ) : onRetry && message.retryable !== false ? (
              <Button size="small" startIcon={<RefreshRoundedIcon />} onClick={onRetry} disabled={busy} sx={{ mt: 1, ml: 3.5, fontWeight: 650 }}>Try again</Button>
            ) : null}
          </Box>
        ) : (
          message.content && (
            <Box sx={{ position: 'relative', '& > div > :last-child::after': streaming ? { content: '"▍"', ml: '2px', color: 'primary.main', animation: 'nxCaret 1s steps(1) infinite' } : {} }}>
              <NexoraMarkdown>{message.content}</NexoraMarkdown>
            </Box>
          )
        )}
        {(message.blocks ?? []).map((block, i) =>
          block.type === 'action' ? (
            <ActionCard key={block.actionId} action={block.action} onDecide={onDecide} />
          ) : block.type === 'slots' ? (
            <SlotPicker key={`slots-${i}`} block={block} onSelect={onSelectSlot} disabled={busy || !onSelectSlot} />
          ) : null,
        )}
        {message.status === 'INTERRUPTED' && (
          <Typography variant="caption" sx={{ display: 'block', mt: 0.75, color: nexora.muted, fontStyle: 'italic' }}>Stopped</Typography>
        )}
      </Box>
    </Stack>
  );
}

function ThreadSkeleton() {
  return (
    <Box sx={{ py: 2 }}>
      <Skeleton variant="rounded" height={42} sx={{ ml: 'auto', width: '45%', borderRadius: 4, mb: 3 }} />
      <Stack direction="row" spacing={1.5}>
        <Skeleton variant="rounded" width={32} height={32} sx={{ borderRadius: 2.5 }} />
        <Box sx={{ flex: 1 }}>
          <Skeleton width="85%" />
          <Skeleton width="70%" />
          <Skeleton width="55%" />
        </Box>
      </Stack>
    </Box>
  );
}

export default NexoraPage;

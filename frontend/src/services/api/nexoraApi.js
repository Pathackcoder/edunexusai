import { apiClient, ApiError, assertViewAsAllows, authHeaders, refreshAccessToken } from './client.js';

/**
 * Nexora, the AI workspace. Conversations and actions are plain REST through apiClient; a message is answered as a
 * stream of server-sent events, read here with fetch (EventSource cannot POST or send the Authorization header).
 */

async function openStream(path, body, signal, retry = true) {
  // A View-As tab is read-only: no message is sent (and never as the administrator, which a bare token would be).
  assertViewAsAllows('POST', path);
  let response;
  try {
    response = await fetch(`${apiClient.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...authHeaders() },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError({ message: 'Cannot reach EdunexusAI. Check your connection and try again.', code: 'NETWORK_ERROR', status: 0 });
  }
  // An expired access token is refreshed once, as for every other request.
  if (response.status === 401 && retry && (await refreshAccessToken())) return openStream(path, body, signal, false);
  if (!response.ok || !response.headers.get('content-type')?.includes('text/event-stream')) {
    const payload = await response.json().catch(() => null);
    throw new ApiError({ message: payload?.error?.message ?? `Request failed with status ${response.status}.`, code: payload?.error?.code, status: response.status, details: payload?.error?.details });
  }
  return response;
}

/** Send a message and call onEvent(name, data) for every event until the stream ends. */
async function streamMessage(conversationId, { message, selection }, { onEvent, signal }) {
  const response = await openStream(`/nexora/conversations/${conversationId}/messages`, { message, ...(selection ? { selection } : {}) }, signal);
  const reader = response.body.getReader();
  const decoder = new window.TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      let event = 'message';
      let data = '';
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (!data) continue; // keep-alive comment
      try {
        onEvent(event, JSON.parse(data));
      } catch {
        /* a malformed event is skipped; the final "done" carries the stored message */
      }
    }
  }
}

export const nexoraApi = {
  session: () => apiClient.get('/nexora/session'),
  conversations: () => apiClient.get('/nexora/conversations'),
  createConversation: () => apiClient.post('/nexora/conversations'),
  conversation: (id) => apiClient.get(`/nexora/conversations/${id}`),
  renameConversation: (id, title) => apiClient.patch(`/nexora/conversations/${id}`, { title }),
  deleteConversation: (id) => apiClient.delete(`/nexora/conversations/${id}`),
  decide: (actionId, decision) => apiClient.post(`/nexora/actions/${actionId}/${decision}`),
  streamMessage,
};

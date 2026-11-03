import { apiClient } from './client.js';

/** Portal messaging over REST. Realtime delivery is the socket in context/ChatContext.jsx. */
export const chatApi = {
  conversations: () => apiClient.get('/chat/conversations'),
  unread: () => apiClient.get('/chat/unread'),
  open: (profileId) => apiClient.post('/chat/conversations', { profileId }),
  messages: (conversationId, { before } = {}) => apiClient.get(`/chat/conversations/${encodeURIComponent(conversationId)}/messages`, { query: { before } }),
  send: (conversationId, { body, clientId }) => apiClient.post(`/chat/conversations/${encodeURIComponent(conversationId)}/messages`, { body, clientId }),
  markRead: (conversationId) => apiClient.post(`/chat/conversations/${encodeURIComponent(conversationId)}/read`),
};

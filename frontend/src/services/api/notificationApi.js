import { apiClient, metaOf } from './client.js';

export const notificationApi = {
  async list({ unreadOnly = false } = {}) {
    const data = await apiClient.get('/notifications', { query: { unreadOnly } });
    return { notifications: data ?? [], unreadCount: metaOf(data).unreadCount ?? 0 };
  },
  markRead: (id) => apiClient.patch(`/notifications/${id}/read`),
  markAllRead: () => apiClient.patch('/notifications/read-all'),
  /** Urgent announcements still waiting for this person's OK, oldest first. */
  pendingUrgent: () => apiClient.get('/notifications/urgent/pending'),
  acknowledgeUrgent: (id) => apiClient.post(`/notifications/urgent/${id}/acknowledge`),
};

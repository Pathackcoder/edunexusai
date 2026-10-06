import { apiClient, metaOf } from './client.js';

export const notificationApi = {
  async list({ unreadOnly = false } = {}) {
    const data = await apiClient.get('/notifications', { query: { unreadOnly } });
    return { notifications: data ?? [], unreadCount: metaOf(data).unreadCount ?? 0 };
  },
  markRead: (id) => apiClient.patch(`/notifications/${id}/read`),
  markAllRead: () => apiClient.patch('/notifications/read-all'),
};

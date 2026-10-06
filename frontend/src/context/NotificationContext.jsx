import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { notificationApi } from '../services/api';
import { useAuth } from './AuthContext';

const NotificationContext = createContext(null);

/**
 * Notifications now live in PostgreSQL, scoped to the signed-in user, instead of in
 * localStorage. Read state is a database write, so it survives a different browser and
 * is visible to the institution.
 */
export const NotificationProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!isAuthenticated) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { notifications: rows, unreadCount: unread } = await notificationApi.list();
      setNotifications(rows);
      setUnreadCount(unread);
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    load();
  }, [load]);

  // Cross-persona workflows (an admin approving a request, support replying to a
  // ticket) create notifications for someone else. A light poll keeps the bell current
  // without a websocket; it pauses while the tab is hidden.
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 30000);
    return () => clearInterval(timer);
  }, [isAuthenticated, load]);

  const markAsRead = useCallback(async (id) => {
    // Optimistic: the badge updates immediately, then the server confirms.
    setNotifications((current) =>
      current.map((item) => (item.id === id ? { ...item, isRead: true } : item)),
    );
    setUnreadCount((count) => Math.max(0, count - 1));
    try {
      await notificationApi.markRead(id);
    } catch {
      load();
    }
  }, [load]);

  const markAllAsRead = useCallback(async () => {
    setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
    setUnreadCount(0);
    try {
      await notificationApi.markAllRead();
    } catch {
      load();
    }
  }, [load]);

  const value = useMemo(
    () => ({
      notifications,
      unreadCount,
      loading,
      error,
      markAsRead,
      markAllAsRead,
      refreshNotifications: load,
    }),
    [notifications, unreadCount, loading, error, markAsRead, markAllAsRead, load],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

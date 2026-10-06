import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AdminCommunicationCenter } from '../components/admin/AdminCommunicationCenter';
import { AdminAudienceSegmentationWidget } from '../components/admin/AdminAudienceSegmentationWidget';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import DoneAllRoundedIcon from '@mui/icons-material/DoneAllRounded';
import { useNotifications } from '../context/NotificationContext';
import { NotificationItem } from '../components/notifications/NotificationItem';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { EmptyState } from '../components/common/EmptyState';
import { PageHeader } from '../components/common/PageHeader';
import { FilterChips } from '../components/common/FilterChips';
import { useToast } from '../components/common/Toast';
import { useAuth } from '../context/AuthContext';

export const NotificationsPage = () => {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [filter, setFilter] = useState('all'); // 'all', 'unread', 'academic', 'finance'
  const { showToast } = useToast();

  const filteredNotifications = notifications.filter(n => {
    if (filter === 'unread') return !n.isRead;
    if (filter === 'academic') return n.category === 'academic';
    if (filter === 'finance') return n.category === 'finance' || n.category === 'financial-aid';
    return true;
  });

  const handleMarkAllRead = () => {
    markAllAsRead();
    showToast('All notifications marked as read');
  };

  const handleSingleRead = (id) => {
    markAsRead(id);
    showToast('Notification marked as read');
  };

  return (
    <Box>
      <PageHeader
        title={
          <Stack component="span" direction="row" alignItems="center" useFlexGap flexWrap="wrap" spacing={1.25}>
            <span>{isAdmin ? 'Communication Center' : 'Notifications Hub'}</span>
            {unreadCount > 0 && <Badge variant="primary" dot>{unreadCount} Unread</Badge>}
          </Stack>
        }
        description={`Centralized stream of academic deadlines, bursar billing notices, and department updates for ${user?.fullName ?? 'your account'}.`}
        actions={
          unreadCount > 0 && (
            <Button variant="outline" size="sm" icon={DoneAllRoundedIcon} onClick={handleMarkAllRead}>
              Mark all as read
            </Button>
          )
        }
      />

      <Stack spacing={2.5}>
        {isAdmin && <>
          <AdminCommunicationCenter key={location.search} />
          <AdminAudienceSegmentationWidget onSelectSegment={(segment) => navigate(`/notifications?${new URLSearchParams(segment)}`)} />
        </>}

        {/* Filter tabs */}
        <FilterChips
          ariaLabel="Filter notifications"
          value={filter}
          onChange={setFilter}
          options={[
            { id: 'all', label: `All Notifications (${notifications.length})` },
            { id: 'unread', label: `Unread Only (${unreadCount})` },
            { id: 'academic', label: 'Academics' },
            { id: 'finance', label: 'Finance & Aid' },
          ]}
        />

        {/* Notifications list */}
        <Stack spacing={1.25}>
          {filteredNotifications.length === 0 ? (
            <Card sx={{ borderStyle: 'dashed' }}>
              <EmptyState
                title="All caught up!"
                description={
                  filter === 'unread'
                    ? "You have zero unread notifications. Check back later for new course or financial updates."
                    : "No notifications match this category."
                }
              />
            </Card>
          ) : (
            filteredNotifications.map(notification => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onMarkRead={handleSingleRead}
              />
            ))
          )}
        </Stack>
      </Stack>
    </Box>
  );
};

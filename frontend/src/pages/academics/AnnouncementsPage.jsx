import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import DoneAllRoundedIcon from '@mui/icons-material/DoneAllRounded';
import { AnnouncementCard } from '../../components/announcements/AnnouncementCard';
import { AnnouncementModal } from '../../components/announcements/AnnouncementModal';
import { useToast } from '../../components/common/Toast';
import { PageHeader } from '../../components/common/PageHeader';
import { Button } from '../../components/common/Button';
import { useApiQuery } from '../../hooks/useApiQuery';
import { academicApi } from '../../services/api';
import { DataState } from '../../components/common/DataState';

export const AnnouncementsPage = () => {
  const { data, loading, error, refetch, setData } = useApiQuery(() => academicApi.getAnnouncements());
  const announcements = data ?? [];
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const { showToast } = useToast();

  // Read state is a per-user database row, not browser state, so it follows the student
  // to another device.
  const handleAnnouncementRead = async (id) => {
    setData((prev) => (prev ?? []).map((a) => (a.id === id ? { ...a, isRead: true } : a)));
    try {
      await academicApi.markAnnouncementRead(id);
      showToast('Announcement marked as read');
    } catch {
      showToast('Could not mark the announcement as read');
      refetch();
    }
  };

  const handleMarkAllRead = async () => {
    const unread = announcements.filter((a) => !a.isRead);
    setData((prev) => (prev ?? []).map((a) => ({ ...a, isRead: true })));
    try {
      await Promise.all(unread.map((a) => academicApi.markAnnouncementRead(a.id)));
      showToast('All announcements marked as read');
    } catch {
      showToast('Some announcements could not be updated');
      refetch();
    }
  };

  const unreadCount = announcements.filter(a => !a.isRead).length;

  return (
    <DataState
      loading={loading}
      error={error}
      onRetry={refetch}
      loadingLabel="Loading announcements…"
      isEmpty={announcements.length === 0}
      emptyTitle="No announcements"
      emptyMessage="Announcements posted by your instructors will appear here."
    >
      {() => (
        <Box>
          <PageHeader
            title="Course & Faculty Announcements"
            description="Important updates, lecture rescheduling notices, and exam logistics from your instructors."
            actions={
              unreadCount > 0 && (
                <Button variant="secondary" size="sm" icon={DoneAllRoundedIcon} onClick={handleMarkAllRead}>
                  Mark All as Read ({unreadCount})
                </Button>
              )
            }
          />

          {/* Announcements List */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 1.5 }}>
            {announcements.map(announcement => (
              <AnnouncementCard
                key={announcement.id}
                announcement={announcement}
                onClick={() => setSelectedAnnouncement(announcement)}
              />
            ))}
          </Box>

          {/* Detail Modal */}
          <AnnouncementModal
            isOpen={!!selectedAnnouncement}
            onClose={() => setSelectedAnnouncement(null)}
            announcement={selectedAnnouncement}
            onMarkRead={handleAnnouncementRead}
          />
        </Box>
      )}
    </DataState>
  );
};

export default AnnouncementsPage;

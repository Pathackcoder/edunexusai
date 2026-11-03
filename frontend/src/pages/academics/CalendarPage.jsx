import React, { useState } from 'react';
import Box from '@mui/material/Box';
import { CalendarGrid } from '../../components/calendar/CalendarGrid';
import { CalendarEventModal } from '../../components/calendar/CalendarEventModal';
import { PageHeader } from '../../components/common/PageHeader';
import { useApiQuery } from '../../hooks/useApiQuery';
import { sisApi } from '../../services/api';
import { toCalendarEvents } from '../../components/sis/sisData';
import { DataState } from '../../components/common/DataState';
import { CalendarSyncPanel } from '../../components/calendar/CalendarSyncPanel';
import { useAuth } from '../../context/AuthContext';

export const CalendarPage = () => {
  const [selectedCalendarEvent, setSelectedCalendarEvent] = useState(null);
  const { isAdmin, isStudent, can } = useAuth();
  const showSync = !isAdmin && (!isStudent || can('feature.calendar_sync'));
  // Official academic calendar: CampusCore SIS.
  const { data, loading, error, refetch } = useApiQuery(() => sisApi.calendar());
  const academicCalendarEvents = toCalendarEvents(data ?? []);

  return (
    <DataState
      loading={loading}
      error={error}
      onRetry={refetch}
      loadingLabel="Loading the academic calendar…"
      isEmpty={academicCalendarEvents.length === 0}
      emptyTitle="No calendar events"
      emptyMessage="Official term dates will appear here once the registrar publishes them."
    >
      {() => (
        <Box>
          <PageHeader
            title="University Academic Calendar"
            description="Official term dates, registration deadlines, examination periods and holidays from CampusCore SIS."
          />

          {showSync && (
            <Box sx={{ mb: 2.5 }}>
              <CalendarSyncPanel />
            </Box>
          )}

          {/* Main Calendar Grid & List View */}
          <CalendarGrid
            events={academicCalendarEvents}
            onSelectEvent={setSelectedCalendarEvent}
          />

          {/* Event Details Modal */}
          <CalendarEventModal
            isOpen={!!selectedCalendarEvent}
            onClose={() => setSelectedCalendarEvent(null)}
            event={selectedCalendarEvent}
          />
        </Box>
      )}
    </DataState>
  );
};

export default CalendarPage;

import React from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined';
import MarkEmailUnreadOutlinedIcon from '@mui/icons-material/MarkEmailUnreadOutlined';
import HourglassBottomOutlinedIcon from '@mui/icons-material/HourglassBottomOutlined';
import { ChartTable } from '../../../components/charts/Charts';
import { SERIES, TrendChart } from '../../../components/analytics/charts';
import { Grid2, Kpi, KpiGrid, Panel, RankTable } from '../../../components/analytics/parts';
import { formatDay, formatDayLong, formatDuration, formatInstant, formatNumber, formatPercent, formatRange } from '../../../components/analytics/format.js';
import { ReportState, roleLabel, useReport } from './shared';

const SOURCE_LABELS = { BROADCAST: 'Broadcasts', SYSTEM: 'System notices', REQUEST: 'Request updates', TICKET: 'Help desk updates', COURSE: 'Course announcements', FORM: 'Form updates', ADVISING: 'Advising', INTERVENTION: 'Student follow-ups' };
const AUDIENCE_LABELS = { ALL: 'Everyone', ROLE: 'A role', TIER: 'A student tier', COURSE: 'A course', DEPARTMENT: 'A department' };
const title = (value) => String(value ?? '').toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

const readColumns = (first, firstLabel, format = (row) => row.label, compact = false) => [
  { key: 'label', label: firstLabel, primary: true, render: format },
  { key: 'sent', label: 'Sent', align: 'right', format: formatNumber },
  { key: 'recipients', label: 'Recipients', align: 'right', format: formatNumber },
  ...(compact ? [] : [{ key: 'read', label: 'Read', align: 'right', format: formatNumber, secondary: true }]),
  { key: 'readRate', label: 'Read rate', align: 'right', format: formatPercent, bar: !compact },
];

export function CommunicationTab({ filters, refreshKey }) {
  const query = useReport('communication', filters, refreshKey, { role: true, device: false });
  return (
    <ReportState query={query}>
      {(data) => {
        const { meta, totals } = data;
        const value = (number) => ({ value: number });
        const daily = data.daily.map((row) => ({ label: formatDay(row.date), tip: formatDayLong(row.date), sent: row.sent, read: row.read, note: undefined }));
        return (
          <Stack spacing={2}>
            <Alert severity="info" variant="outlined" sx={{ py: 0.25 }}>
              These figures come from the portal's own in-app notifications and their read state, and are available whether or not usage collection is on. The portal keeps no email or SMS delivery receipts and has no acknowledgement step, so neither is reported here.
            </Alert>
            {totals.sent === 0 ? (
              <Panel title="Communication"><Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>No notifications were sent between {formatRange(meta.from, meta.to)}{meta.role ? ` to ${roleLabel(meta.role).toLowerCase()}` : ''}.</Typography></Panel>
            ) : (
              <>
                <KpiGrid>
                  <Kpi title="Notifications sent" kpi={value(totals.sent)} format={formatNumber} icon={SendOutlinedIcon} tone="communication" info="In-app notifications created in the period, one per recipient (a broadcast to 300 people is 300 notifications)." footnote={totals.recipients != null ? `to ${formatNumber(totals.recipients)} people` : undefined} />
                  <Kpi title="Read rate" kpi={value(totals.readRate)} format={formatPercent} icon={MarkEmailReadOutlinedIcon} tone="communication" info="Notifications sent in the period that have been marked read (opened in the portal, or marked read by the person) ÷ notifications sent." footnote={totals.read != null ? `${formatNumber(totals.read)} read` : undefined} />
                  <Kpi title="Still unread" kpi={value(totals.unread)} format={formatNumber} icon={MarkEmailUnreadOutlinedIcon} tone="warning" info="Notifications sent in the period that nobody has opened yet." />
                  <Kpi title="Time to read" kpi={value(totals.averageMsToRead)} format={formatDuration} icon={HourglassBottomOutlinedIcon} tone="info" info="Average time between a notification being sent and being read, for those that were read." footnote={totals.readWithinDayRate != null ? `${formatPercent(totals.readWithinDayRate)} read within a day` : undefined} />
                </KpiGrid>

                <Panel title="Sent and read per day" subtitle={formatRange(meta.from, meta.to)}
                  info="Sent: notifications created that day. Read: how many of that day's notifications have been read since (so recent days are still rising)."
                  table={<ChartTable columns={[{ key: 'tip', label: 'Day' }, { key: 'sent', label: 'Sent' }, { key: 'read', label: 'Read so far' }]} rows={daily.map((row) => ({ tip: row.tip, sent: formatNumber(row.sent), read: formatNumber(row.read) }))} />}>
                  <TrendChart data={daily} width={1100} height={200} series={[{ key: 'sent', label: 'Sent', color: SERIES[0] }, { key: 'read', label: 'Read so far', color: SERIES[1] }]} ariaLabel="Notifications sent and read per day" />
                </Panel>

                <Grid2>
                  <Panel title="By kind of notification" info="What produced the notification: a broadcast from the Communication Center, a request or help desk update, a course announcement, and so on.">
                    <RankTable ariaLabel="Notifications by kind" rows={data.bySource.map((row) => ({ ...row, label: SOURCE_LABELS[row.key] ?? title(row.key) }))} initialSort={{ key: 'sent', direction: 'desc' }} columns={readColumns('label', 'Kind', undefined, true)} />
                  </Panel>
                  <Panel title="By audience" subtitle="Recipients holding each role" info="Notifications grouped by the roles their recipients hold. A recipient with two roles is counted under both, so the rows overlap.">
                    {data.byRole.length ? <RankTable ariaLabel="Notifications by recipient role" rows={data.byRole.map((row) => ({ ...row, label: roleLabel(row.key) }))} initialSort={{ key: 'sent', direction: 'desc' }} columns={readColumns('label', 'Role', undefined, true)} />
                      : <Typography variant="body2" color="text.secondary">Remove the role filter to compare audiences.</Typography>}
                  </Panel>
                </Grid2>

                <Panel title="By category" info="The category chosen when the notification was created.">
                  <RankTable ariaLabel="Notifications by category" rows={data.byCategory.map((row) => ({ ...row, label: title(row.key) }))} initialSort={{ key: 'sent', direction: 'desc' }} pageSize={8} columns={readColumns('label', 'Category')} />
                </Panel>
              </>
            )}

            <Panel title="Broadcasts" subtitle="Sent from the Communication Center in this period" info="Each broadcast with the number of people it was delivered to in the portal and how many have read it.">
              <RankTable
                ariaLabel="Broadcasts"
                rows={data.broadcasts.map((row) => ({ ...row, key: row.id, sentAtMs: new Date(row.sentAt).getTime() }))}
                initialSort={{ key: 'sentAtMs', direction: 'desc' }}
                pageSize={10}
                columns={[
                  { key: 'title', label: 'Broadcast', primary: true, render: (row) => <Box><Box>{row.title}</Box><Typography variant="caption" color="text.secondary">{title(row.category)}{row.priority && row.priority !== 'normal' ? ` · ${title(row.priority)}` : ''}</Typography></Box> },
                  { key: 'audienceLabel', label: 'Audience', numeric: false, secondary: true },
                  { key: 'sentAtMs', label: 'Sent', align: 'right', render: (row) => formatInstant(row.sentAt, meta.timezone) },
                  { key: 'recipients', label: 'Recipients', align: 'right', format: formatNumber },
                  { key: 'read', label: 'Read', align: 'right', format: formatNumber },
                  { key: 'readRate', label: 'Read rate', align: 'right', format: formatPercent, bar: true },
                ]}
                emptyText="No broadcasts were sent in this period."
              />
              {data.byAudience.length > 1 && (
                <Box sx={{ mt: 2.5 }}>
                  <Typography variant="subtitle2" sx={{ mb: 0.5 }}>By type of audience</Typography>
                  <RankTable ariaLabel="Broadcasts by audience type" rows={data.byAudience.map((row) => ({ ...row, label: AUDIENCE_LABELS[row.key] ?? title(row.key), sent: row.broadcasts }))} columns={readColumns('label', 'Audience').map((column) => (column.key === 'sent' ? { ...column, label: 'Broadcasts' } : column))} />
                </Box>
              )}
            </Panel>

            {data.courseAnnouncements.posted > 0 && (
              <Panel title="Course announcements" info="Announcements posted in the portal's own course pages in the period, and how many times they were marked read. Announcements published in CampusCore or Moodle are not counted here.">
                <Typography variant="body2">
                  <strong>{formatNumber(data.courseAnnouncements.posted)}</strong> posted · <><strong>{formatNumber(data.courseAnnouncements.reads)}</strong> reads recorded</>
                </Typography>
              </Panel>
            )}
          </Stack>
        );
      }}
    </ReportState>
  );
}

export default CommunicationTab;

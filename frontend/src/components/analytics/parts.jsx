import React, { useMemo, useState } from 'react';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import ButtonBase from '@mui/material/ButtonBase';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableSortLabel from '@mui/material/TableSortLabel';
import MuiButton from '@mui/material/Button';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import BarChartRoundedIcon from '@mui/icons-material/BarChartRounded';
import TableRowsOutlinedIcon from '@mui/icons-material/TableRowsOutlined';
import QueryStatsOutlinedIcon from '@mui/icons-material/QueryStatsOutlined';
import { IconTile } from '../common/IconTile';
import { getTone } from '../../theme/tones';
import { CellBar } from './charts';
import { DASH, formatChange, formatDay, formatRange } from './format.js';

/** A small "i" that explains a metric in plain words. Keyboard-focusable; the text is also the accessible name. */
export function InfoTip({ text }) {
  if (!text) return null;
  return (
    <Tooltip title={<Box sx={{ maxWidth: 300, lineHeight: 1.5 }}>{text}</Box>} arrow enterTouchDelay={0} leaveTouchDelay={6000}>
      <IconButton size="small" aria-label={`About this figure: ${text}`} sx={{ p: 0.25, color: 'text.disabled', '&:hover, &:focus-visible': { color: 'primary.main' } }}>
        <InfoOutlinedIcon sx={{ fontSize: 16 }} />
      </IconButton>
    </Tooltip>
  );
}

/**
 * The standard analytics card: a title that states what is shown, an optional explanation, an optional action,
 * and (when `table` is given) a chart/table switch so no chart depends on colour or hover alone.
 */
export function Panel({ title, subtitle, info, action, table, children, sx, dense = false }) {
  // Content-driven height; a card only stretches to its neighbour's height inside a Grid2 that asks for it.
  const [view, setView] = useState('chart');
  return (
    <Card component="section" sx={{ p: dense ? 1.75 : { xs: 1.75, md: 2.25 }, display: 'flex', flexDirection: 'column', minWidth: 0, ...sx }}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1.5} sx={{ mb: 1.25 }}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Typography variant="h6" component="h2" sx={{ fontSize: '1rem', lineHeight: 1.3 }}>{title}</Typography>
            <InfoTip text={info} />
          </Stack>
          {subtitle && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>{subtitle}</Typography>}
        </Box>
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
          {action}
          {table && (
            <Stack direction="row" role="group" aria-label={`${title}: chart or table`} sx={{ border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
              {[['chart', BarChartRoundedIcon, 'Chart'], ['table', TableRowsOutlinedIcon, 'Table']].map(([id, Icon, label]) => (
                <Tooltip key={id} title={label}>
                  <ButtonBase onClick={() => setView(id)} aria-pressed={view === id} aria-label={`Show as ${label.toLowerCase()}`} sx={{ width: 30, height: 28, color: view === id ? 'primary.main' : 'text.disabled', bgcolor: view === id ? 'primary.lighter' : 'transparent' }}>
                    <Icon sx={{ fontSize: 17 }} />
                  </ButtonBase>
                </Tooltip>
              ))}
            </Stack>
          )}
        </Stack>
      </Stack>
      <Box sx={{ flex: 1, minWidth: 0 }}>{table && view === 'table' ? table : children}</Box>
    </Card>
  );
}

/**
 * KPI card: what the figure is (label and an explanation), the figure itself, and one line of context saying what
 * it is made of. A trend chip appears only when the API supplied a real previous-period value to compare with;
 * it is never invented. `context` is a short phrase (or node) under the value.
 */
export function Kpi({ title, kpi, format, icon: Icon, tone = 'analytics', info, comparison = 'vs previous period', goodWhenUp = true, footnote, context }) {
  const theme = useTheme();
  const colors = getTone(theme, tone);
  const change = formatChange(kpi?.change);
  const good = change && change.direction !== 'flat' ? (change.direction === 'up') === goodWhenUp : null;
  const detail = context ?? footnote;
  return (
    <Card component="article" sx={{ p: { xs: 1.75, md: 2 }, display: 'flex', flexDirection: 'column', gap: 0.75, minWidth: 0, height: '100%', boxShadow: 'none', borderColor: 'divider' }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
        {Icon && (
          <Box aria-hidden sx={{ width: 28, height: 28, borderRadius: 1.75, display: 'grid', placeItems: 'center', bgcolor: colors.bg, color: colors.fg, flexShrink: 0 }}>
            <Icon sx={{ fontSize: 16 }} />
          </Box>
        )}
        <Typography variant="body2" component="h3" sx={{ fontWeight: 600, color: 'text.secondary', minWidth: 0, lineHeight: 1.3 }}>{title}</Typography>
        <Box sx={{ ml: 'auto !important', flexShrink: 0 }}><InfoTip text={info} /></Box>
      </Stack>
      <Stack direction="row" alignItems="baseline" spacing={1} useFlexGap flexWrap="wrap">
        <Typography component="div" variant="metric" sx={{ fontSize: { xs: '1.625rem', md: '1.875rem' }, lineHeight: 1.15, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
          {kpi?.value == null ? DASH : format(kpi.value)}
        </Typography>
        {change && (
          <Tooltip title={comparison} arrow>
            <Box component="span" tabIndex={0} sx={{ display: 'inline-flex', alignItems: 'center', px: 0.75, py: 0.125, borderRadius: 1.5, typography: 'caption', fontWeight: 700, bgcolor: good === null ? 'grey.100' : good ? 'success.lighter' : 'error.lighter', color: good === null ? 'text.secondary' : good ? 'success.dark' : 'error.dark' }}>
              {change.text}
            </Box>
          </Tooltip>
        )}
      </Stack>
      {detail && <Typography variant="caption" color="text.secondary" component="div" sx={{ lineHeight: 1.45 }}>{detail}</Typography>}
    </Card>
  );
}

/** A labelled row of KPI cards ("Audience", "Engagement"). */
export function KpiGroup({ label, children, columns = 4 }) {
  return (
    <Box component="section" aria-label={label}>
      <Typography variant="overline" color="text.secondary" component="h2" sx={{ display: 'block', mb: 0.75, lineHeight: 1.4 }}>{label}</Typography>
      <KpiGrid columns={columns}>{children}</KpiGrid>
    </Box>
  );
}

export const KpiGrid = ({ children, columns = 4 }) => (
  <Box sx={{ display: 'grid', gap: { xs: 1.25, md: 1.5 }, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: `repeat(${Math.min(columns, 4)}, minmax(0, 1fr))` } }}>{children}</Box>
);

/**
 * Two (or more) cards side by side from large screens up, stacked below. `align="start"` lets each card keep its
 * own height when the two hold very different amounts of content; the default stretches them to one height.
 */
export const Grid2 = ({ children, ratio = '1fr 1fr', align = 'stretch', breakpoint = 'lg' }) => (
  <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', [breakpoint]: ratio.split(' ').map((part) => `minmax(0, ${part})`).join(' ') }, alignItems: align, ...(align === 'stretch' ? { '& > .MuiCard-root': { height: '100%' } } : {}) }}>{children}</Box>
);

/**
 * Honest empty state: says why there is nothing (collection never switched on, switched on later than the range,
 * or simply no activity) instead of showing zeros or sample data.
 */
export function NoData({ meta, title, what = 'usage', onOpenHealth, compact = false }) {
  let heading = title ?? `No ${what} recorded in this period`;
  let text = `Nothing was recorded between ${formatRange(meta?.from, meta?.to)} for the filters you chose. Try a wider date range or reset the filters.`;
  if (meta && !meta.collectingSince) {
    heading = 'Usage collection has not been switched on';
    text = 'Portal usage is not being measured for your institution, so there is nothing to report yet. An administrator with analytics access can switch collection on under Data health, once your privacy notice covers it.';
  } else if (meta && meta.collectingSince > meta.to) {
    heading = 'This period is before collection began';
    text = `Usage has been collected since ${formatDay(meta.collectingSince, { year: true })}. Choose a period on or after that date.`;
  } else if (meta && !meta.collecting) {
    text += ' Collection is currently switched off, so no new activity is being recorded.';
  }
  return (
    <Stack alignItems="center" spacing={1.25} sx={{ py: compact ? 3 : 5, px: 2, textAlign: 'center' }}>
      <IconTile icon={QueryStatsOutlinedIcon} tone="analytics" size={compact ? 40 : 52} />
      <Typography variant="h6" component="h3" sx={{ fontSize: '1rem' }}>{heading}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 480 }}>{text}</Typography>
      {onOpenHealth && meta && !meta.collecting && <MuiButton size="small" onClick={onOpenHealth}>Open Data health</MuiButton>}
    </Stack>
  );
}

const cellText = (column, row) => {
  const value = row[column.key];
  if (column.render) return column.render(row);
  if (value === null || value === undefined) return DASH;
  return column.format ? column.format(value, row) : value;
};

/**
 * Ranked, sortable table. columns: [{ key, label, align, format, render, sortable, bar, info, width, secondary }].
 * `secondary` columns are left out on phones, so the table fits the screen without sideways scrolling.
 * Values are shown exactly as the API returns them; a missing value is a dash, never a zero.
 * `onRowClick` makes rows a drill-down (keyboard-operable). Long lists are cut to `pageSize` with "Show all".
 */
export function RankTable({ columns, rows, initialSort, pageSize = 12, onRowClick, rowLabel, emptyText = 'Nothing to show.', dense = true, ariaLabel }) {
  const [sort, setSort] = useState(initialSort ?? null);
  const [expanded, setExpanded] = useState(false);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const direction = sort.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      // Missing values always sort last.
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (typeof av === 'string' ? av.localeCompare(bv) : av - bv) * direction;
    });
  }, [rows, sort]);
  const visible = expanded ? sorted : sorted.slice(0, pageSize);
  const maxima = useMemo(() => Object.fromEntries(columns.filter((column) => column.bar).map((column) => [column.key, Math.max(0, ...rows.map((row) => row[column.key] ?? 0))])), [columns, rows]);
  if (!rows.length) return <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>{emptyText}</Typography>;
  const toggle = (key) => setSort((current) => (current?.key === key ? { key, direction: current.direction === 'desc' ? 'asc' : 'desc' } : { key, direction: 'desc' }));
  return (
    <Box>
      <TableContainer sx={{ mx: -0.5, px: 0.5 }}>
        <Table size={dense ? 'small' : 'medium'} aria-label={ariaLabel} sx={{ minWidth: { xs: 0, sm: columns.length > 5 ? Math.min(600, 92 * columns.length) : 0 }, '& td, & th': { borderColor: 'divider' } }}>
          <TableHead>
            <TableRow>
              {columns.map((column) => (
                <TableCell key={column.key} align={column.align} sortDirection={sort?.key === column.key ? sort.direction : false} sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.75rem', whiteSpace: 'nowrap', width: column.width, ...(column.secondary ? { display: { xs: 'none', sm: 'table-cell' } } : {}) }}>
                  <Stack direction="row" alignItems="center" spacing={0.25} justifyContent={column.align === 'right' ? 'flex-end' : 'flex-start'}>
                    {column.sortable === false ? column.label : (
                      <TableSortLabel active={sort?.key === column.key} direction={sort?.key === column.key ? sort.direction : 'desc'} onClick={() => toggle(column.key)}>{column.label}</TableSortLabel>
                    )}
                    <InfoTip text={column.info} />
                  </Stack>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {visible.map((row, index) => (
              <TableRow
                key={row.key ?? row.id ?? index}
                hover={Boolean(onRowClick)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={onRowClick ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onRowClick(row); } } : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                role={onRowClick ? 'button' : undefined}
                aria-label={onRowClick && rowLabel ? rowLabel(row) : undefined}
                sx={{ cursor: onRowClick ? 'pointer' : 'default', '&:last-child td': { borderBottom: 0 } }}
              >
                {columns.map((column) => (
                  <TableCell key={column.key} align={column.align} sx={{ fontVariantNumeric: 'tabular-nums', py: 0.75, ...(column.primary ? { fontWeight: 600 } : {}), ...(column.secondary ? { display: { xs: 'none', sm: 'table-cell' } } : {}) }}>
                    {(
                      column.bar ? (
                        <Stack direction="row" alignItems="center" spacing={1} justifyContent="flex-end">
                          <Box sx={{ flex: 1, maxWidth: 110, display: { xs: 'none', sm: 'block' } }}><CellBar value={row[column.key]} max={maxima[column.key]} /></Box>
                          <Box sx={{ minWidth: 44, textAlign: 'right' }}>{cellText(column, row)}</Box>
                        </Stack>
                      ) : cellText(column, row)
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {sorted.length > pageSize && (
        <MuiButton size="small" onClick={() => setExpanded((value) => !value)} sx={{ mt: 1 }}>
          {expanded ? 'Show fewer' : `Show all ${sorted.length}`}
        </MuiButton>
      )}
    </Box>
  );
}

/** A labelled fact for status panels (Data health, Integrations). */
export const Fact = ({ label, children, info }) => (
  <Box sx={{ minWidth: 0 }}>
    <Stack direction="row" alignItems="center" spacing={0.5}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>{label}</Typography>
      <InfoTip text={info} />
    </Stack>
    <Typography variant="body2" component="div" sx={{ fontWeight: 600, mt: 0.25, overflowWrap: 'anywhere' }}>{children}</Typography>
  </Box>
);

export const FactGrid = ({ children, min = 170 }) => (
  <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))` }}>{children}</Box>
);

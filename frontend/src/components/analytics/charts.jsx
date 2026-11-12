import React, { useEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { WEEKDAYS, WEEKDAYS_LONG, formatHour, formatNumber, niceMax, tickIndexes } from './format.js';

/**
 * Charts for Admin → Analytics, in the same hand-drawn SVG style as components/charts (no chart dependency).
 *
 * Conventions: one y-axis starting at zero; 2px lines; recessive grid; text in ink tokens, never the series
 * colour; a legend whenever there are two or more series; a tooltip on every chart; a gap (never a zero) where a
 * value was not measured (for example before collection began). Every chart is paired with a table by the panel that hosts it.
 *
 * Colours follow the entity, not its position, so a filter never repaints a series. The sets were checked with a
 * colour-vision validator (adjacent pairs stay distinct under deuteranopia, protanopia and tritanopia); the two
 * light hues (yellow, pink) fall below 3:1 against the surface, which is why legends carry labels and each chart
 * has a table view.
 */
export const ENTITY_COLORS = {
  STUDENT: '#4651DE', FACULTY: '#eb6834', STAFF: '#0D9488', ALUMNI: '#eda100', ADMIN: '#e87ba4', SHARED: '#008300',
  DESKTOP: '#4651DE', MOBILE: '#eb6834', TABLET: '#0D9488',
};
export const SERIES = ['#4651DE', '#eb6834', '#0D9488'];
/** One hue, light to dark, for magnitude (the peak-hours grid). */
const SEQUENTIAL = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];

function Tip({ x, y = 0, children }) {
  if (x == null) return null;
  return (
    <Box role="tooltip" sx={{ position: 'absolute', left: x, top: y, transform: 'translate(-50%, calc(-100% - 8px))', bgcolor: 'grey.900', color: '#fff', px: 1.25, py: 0.75, borderRadius: 1.5, fontSize: '0.75rem', lineHeight: 1.5, pointerEvents: 'none', whiteSpace: 'nowrap', boxShadow: 3, zIndex: 3 }}>
      {children}
    </Box>
  );
}

export function ChartLegend({ series }) {
  if (series.length < 2) return null;
  return (
    <Stack component="ul" direction="row" spacing={2} useFlexGap flexWrap="wrap" sx={{ listStyle: 'none', p: 0, m: 0, mb: 1 }}>
      {series.map((item) => (
        <Stack component="li" key={item.key} direction="row" spacing={0.75} alignItems="center">
          <Box aria-hidden sx={{ width: 10, height: 10, borderRadius: 0.75, bgcolor: item.color }} />
          <Typography variant="caption" color="text.secondary">{item.label}</Typography>
        </Stack>
      ))}
    </Stack>
  );
}

const clampTip = (percent) => `${Math.min(88, Math.max(12, percent))}%`;

/**
 * The chart draws at its container's real width (in CSS pixels), so its height and text size stay the same on a
 * phone and on a wide screen instead of being scaled with the card. `fallback` is used until the first measurement.
 */
function useMeasuredWidth(fallback) {
  const ref = useRef(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width);
      if (next > 0) setWidth(Math.max(280, next));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/**
 * Trend over days. data: [{ label, tip?, note?, partial?, [seriesKey]: number | null }]; a null value leaves a
 * gap. `note` explains a gap in the tooltip (e.g. "Before collection began"). A `partial` point (today) is drawn
 * hollow, because the day is not over.
 */
// `width` is only the starting width; the chart then draws at its container's measured width.
export function TrendChart({ data, series, height = 220, width: initialWidth = 720, format = formatNumber, ariaLabel }) {
  const theme = useTheme();
  const ref = useRef(null);
  const [box, width] = useMeasuredWidth(initialWidth);
  const [hover, setHover] = useState(null);
  const pad = { l: 44, r: 16, t: 12, b: 28 };
  const values = data.flatMap((row) => series.map((item) => row[item.key])).filter((value) => value != null);
  const max = niceMax(Math.max(0, ...values));
  const inner = width - pad.l - pad.r;
  const x = (index) => pad.l + (data.length <= 1 ? inner / 2 : (index * inner) / (data.length - 1));
  const y = (value) => pad.t + (1 - value / max) * (height - pad.t - pad.b);
  // Quarter steps only when they are whole numbers (people are not shown as 12.5).
  const ticks = Number.isInteger(max / 4) ? [0, max / 4, max / 2, (3 * max) / 4, max] : [0, max / 2, max];
  const labels = useMemo(() => tickIndexes(data.length, width < 520 ? 4 : 7), [data.length, width]);
  const dense = data.length > 45;

  const onMove = (event) => {
    const rect = ref.current.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * width;
    setHover(Math.min(data.length - 1, Math.max(0, Math.round(((px - pad.l) / inner) * (data.length - 1)))));
  };

  /** Consecutive runs of measured points, so an unmeasured day breaks the line instead of dipping to zero. */
  const runs = (key) => {
    const out = [];
    let current = [];
    data.forEach((row, index) => {
      if (row[key] == null) { if (current.length) out.push(current); current = []; } else current.push([x(index), y(row[key]), index]);
    });
    if (current.length) out.push(current);
    return out;
  };

  return (
    <Box ref={box} sx={{ position: 'relative' }}>
      <ChartLegend series={series} />
      <Box component="svg" ref={ref} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} sx={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible', touchAction: 'pan-y' }} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={pad.l} x2={width - pad.r} y1={y(tick)} y2={y(tick)} stroke={theme.palette.divider} strokeDasharray={tick === 0 ? undefined : '3 4'} />
            <text x={pad.l - 8} y={y(tick) + 4} textAnchor="end" fontSize="11" fill={theme.palette.text.secondary}>{format(tick)}</text>
          </g>
        ))}
        {labels.map((index) => (
          <text key={index} x={x(index)} y={height - 8} textAnchor={index === 0 ? 'start' : index === data.length - 1 ? 'end' : 'middle'} fontSize="11" fill={theme.palette.text.secondary}>{data[index].label}</text>
        ))}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={height - pad.b} stroke={theme.palette.text.disabled} />}
        {series.map((item) => (
          <g key={item.key}>
            {runs(item.key).map((run) => (
              <React.Fragment key={run[0][2]}>
                {run.length > 1 && <polyline points={run.map(([px, py]) => `${px},${py}`).join(' ')} fill="none" stroke={item.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
                {run.map(([px, py, index]) => {
                  const partial = data[index].partial;
                  // Markers on every point only when there is room; otherwise on isolated, hovered and partial points.
                  if (dense && run.length > 1 && hover !== index && !partial) return null;
                  return <circle key={index} cx={px} cy={py} r={hover === index ? 5 : 3.5} fill={partial ? theme.palette.background.paper : item.color} stroke={partial ? item.color : theme.palette.background.paper} strokeWidth="2" />;
                })}
              </React.Fragment>
            ))}
          </g>
        ))}
      </Box>
      {hover != null && (
        <Tip x={clampTip((x(hover) / width) * 100)}>
          <strong>{data[hover].tip ?? data[hover].label}</strong>
          {series.map((item) => (
            <Box key={item.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: item.color }} />
              {item.label}: {data[hover][item.key] == null ? (data[hover].note ?? '—') : format(data[hover][item.key])}
            </Box>
          ))}
          {data[hover].partial && <Box sx={{ opacity: 0.75 }}>Today so far</Box>}
        </Tip>
      )}
    </Box>
  );
}

/**
 * Stacked daily bars for values that genuinely add up (each visit has one device; each page view one workspace).
 * data: [{ label, tip?, [seriesKey]: number | null }]. A 2px gap separates segments.
 */
export function StackedBars({ data, series, height = 220, width: initialWidth = 720, format = formatNumber, ariaLabel }) {
  const theme = useTheme();
  const [hover, setHover] = useState(null);
  const [box, width] = useMeasuredWidth(initialWidth);
  const pad = { l: 44, r: 12, t: 12, b: 28 };
  const totals = data.map((row) => series.reduce((sum, item) => sum + (row[item.key] ?? 0), 0));
  const max = niceMax(Math.max(0, ...totals));
  const slot = (width - pad.l - pad.r) / Math.max(1, data.length);
  const bar = Math.max(2, Math.min(28, slot * 0.68));
  const base = height - pad.b;
  const scale = (value) => (value / max) * (base - pad.t);
  const ticks = [0, max / 2, max];
  const labels = tickIndexes(data.length, width < 520 ? 4 : 7);
  return (
    <Box ref={box} sx={{ position: 'relative' }}>
      <ChartLegend series={series} />
      <Box component="svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} sx={{ width: '100%', height: 'auto', display: 'block' }} onPointerLeave={() => setHover(null)}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={pad.l} x2={width - pad.r} y1={base - scale(tick)} y2={base - scale(tick)} stroke={theme.palette.divider} strokeDasharray={tick === 0 ? undefined : '3 4'} />
            <text x={pad.l - 8} y={base - scale(tick) + 4} textAnchor="end" fontSize="11" fill={theme.palette.text.secondary}>{format(tick)}</text>
          </g>
        ))}
        {data.map((row, index) => {
          const cx = pad.l + slot * index + slot / 2;
          let top = base;
          return (
            <g key={row.label + index} onPointerEnter={() => setHover(index)} opacity={hover === null || hover === index ? 1 : 0.5} style={{ transition: 'opacity 150ms ease' }}>
              <rect x={cx - slot / 2} y={pad.t} width={slot} height={base - pad.t} fill="transparent" />
              {series.map((item) => {
                const h = scale(row[item.key] ?? 0);
                if (h <= 0) return null;
                top -= h;
                return <rect key={item.key} x={cx - bar / 2} y={top + (h > 3 ? 1 : 0)} width={bar} height={Math.max(1, h - (h > 3 ? 2 : 0))} rx={Math.min(2, bar / 2)} fill={item.color} />;
              })}
            </g>
          );
        })}
        {labels.map((index) => (
          <text key={index} x={pad.l + slot * index + slot / 2} y={height - 8} textAnchor="middle" fontSize="11" fill={theme.palette.text.secondary}>{data[index].label}</text>
        ))}
      </Box>
      {hover != null && (
        <Tip x={clampTip(((pad.l + slot * hover + slot / 2) / width) * 100)}>
          <strong>{data[hover].tip ?? data[hover].label}</strong>
          {series.map((item) => (
            <Box key={item.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box component="span" sx={{ width: 8, height: 8, borderRadius: 0.5, bgcolor: item.color }} />
              {item.label}: {format(data[hover][item.key] ?? 0)}
            </Box>
          ))}
        </Tip>
      )}
    </Box>
  );
}

/**
 * Peak usage: weekdays down, hours across; darker = more people active in that hour on an average such day.
 * cells: [{ weekday: 1–7, hour: 0–23, value: number }].
 */
export function Heatmap({ cells, ariaLabel, format = (value) => formatNumber(value) }) {
  const theme = useTheme();
  const [hover, setHover] = useState(null);
  const byKey = new Map(cells.map((cell) => [`${cell.weekday}-${cell.hour}`, cell]));
  const max = Math.max(0, ...cells.map((cell) => cell.value ?? 0));
  const cellW = 26;
  const cellH = 24;
  const gap = 2;
  const pad = { l: 40, t: 20 };
  const width = pad.l + 24 * (cellW + gap);
  const height = pad.t + 7 * (cellH + gap);
  const color = (value) => (value > 0 && max > 0 ? SEQUENTIAL[Math.min(SEQUENTIAL.length - 1, Math.floor((value / max) * (SEQUENTIAL.length - 0.001)))] : theme.palette.grey[100]);
  const hovered = hover ? byKey.get(hover.key) : null;
  return (
    <Box>
      <Box sx={{ position: 'relative', overflowX: 'auto', pb: 0.5 }}>
        <Box component="svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} sx={{ width: '100%', minWidth: 560, height: 'auto', display: 'block' }} onPointerLeave={() => setHover(null)}>
          {[0, 3, 6, 9, 12, 15, 18, 21].map((hour) => (
            <text key={hour} x={pad.l + hour * (cellW + gap)} y={12} fontSize="10.5" fill={theme.palette.text.secondary}>{formatHour(hour)}</text>
          ))}
          {WEEKDAYS.map((label, row) => (
            <text key={label} x={pad.l - 8} y={pad.t + row * (cellH + gap) + cellH / 2 + 4} textAnchor="end" fontSize="11" fill={theme.palette.text.secondary}>{label}</text>
          ))}
          {WEEKDAYS.map((_, row) => Array.from({ length: 24 }, (__, hour) => {
            const key = `${row + 1}-${hour}`;
            const cell = byKey.get(key);
            const px = pad.l + hour * (cellW + gap);
            const py = pad.t + row * (cellH + gap);
            return (
              <rect key={key} x={px} y={py} width={cellW} height={cellH} rx="3"
                fill={color(cell?.value ?? 0)}
                stroke={hover?.key === key ? theme.palette.text.primary : 'none'} strokeWidth="1.5"
                onPointerEnter={() => setHover({ key, x: ((px + cellW / 2) / width) * 100, row, hour })} />
            );
          }))}
        </Box>
        {hover && (
          <Tip x={clampTip(hover.x)} y={((pad.t + hover.row * (cellH + gap)) / height) * 100 + '%'}>
            <strong>{WEEKDAYS_LONG[hover.row]}, {formatHour(hover.hour)}–{formatHour((hover.hour + 1) % 24)}</strong>
            <Box>{hovered?.value ? `${format(hovered.value)} people on an average ${WEEKDAYS_LONG[hover.row]}` : 'No activity'}</Box>
          </Tip>
        )}
      </Box>
      <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
        <Typography variant="caption" color="text.secondary">Fewer people</Typography>
        <Stack direction="row" spacing={0.25} aria-hidden>
          {SEQUENTIAL.map((step) => <Box key={step} sx={{ width: 18, height: 10, borderRadius: 0.5, bgcolor: step }} />)}
        </Stack>
        <Typography variant="caption" color="text.secondary">More people{max ? ` (up to ${format(max)})` : ''}</Typography>
      </Stack>
    </Box>
  );
}

/** Inline bar for a table cell: the value as a share of the column's largest value. */
export function CellBar({ value, max, color = SERIES[0] }) {
  if (value == null) return null;
  return (
    <Box aria-hidden sx={{ height: 6, borderRadius: 3, bgcolor: 'grey.100', overflow: 'hidden', minWidth: 48 }}>
      <Box sx={{ height: '100%', width: `${max > 0 ? Math.max(value > 0 ? 3 : 0, Math.min(100, (value / max) * 100)) : 0}%`, bgcolor: color, borderRadius: 3 }} />
    </Box>
  );
}

/** Labelled horizontal bars for a handful of shares that add up to the whole (devices, sources). */
export function ShareBars({ rows, format = formatNumber }) {
  const max = Math.max(0, ...rows.map((row) => row.value ?? 0));
  return (
    <Stack spacing={1.25}>
      {rows.map((row) => (
        <Box key={row.label}>
          <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1} sx={{ mb: 0.5 }}>
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
              {row.color && <Box aria-hidden sx={{ width: 10, height: 10, borderRadius: 0.75, bgcolor: row.color, flexShrink: 0 }} />}
              <Typography variant="body2" fontWeight={600} noWrap>{row.label}</Typography>
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              {`${format(row.value)}${row.suffix ? ` · ${row.suffix}` : ''}`}
            </Typography>
          </Stack>
          <Box sx={{ height: 8, borderRadius: 4, bgcolor: 'grey.100', overflow: 'hidden' }}>
            <Box sx={{ height: '100%', width: `${max > 0 && row.value ? Math.max(2, (row.value / max) * 100) : 0}%`, bgcolor: row.color ?? SERIES[0], borderRadius: 4 }} />
          </Box>
        </Box>
      ))}
    </Stack>
  );
}

import React, { useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';

/**
 * Small SVG chart kit (no chart dependency). Conventions: thin 2px lines, 8px markers
 * with a surface ring, 4px rounded bar ends on the baseline, recessive grid, text in
 * ink tokens (never the series colour), a legend for 2+ series, and a hover tooltip on
 * every chart. Series colours are validated for colour-vision deficiency.
 */
export const SERIES_COLORS = ['#4651DE', '#0D9488'];

function Tooltip({ x, y, children }) {
  if (x == null) return null;
  const left = x;
  return (
    <Box
      role="tooltip"
      sx={{
        position: 'absolute',
        left,
        top: y,
        transform: 'translate(-50%, calc(-100% - 10px))',
        bgcolor: 'grey.900',
        color: '#fff',
        px: 1.25,
        py: 0.75,
        borderRadius: 1.5,
        fontSize: '0.75rem',
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
        boxShadow: 3,
        zIndex: 2,
      }}
    >
      {children}
    </Box>
  );
}

export function Legend({ series }) {
  if (series.length < 2) return null;
  return (
    <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap" sx={{ mb: 1 }}>
      {series.map((item, index) => (
        <Stack key={item.key} direction="row" spacing={0.75} alignItems="center">
          <Box sx={{ width: 14, height: 3, borderRadius: 2, bgcolor: SERIES_COLORS[index] }} />
          <Typography variant="caption" color="text.secondary">{item.label}</Typography>
        </Stack>
      ))}
    </Stack>
  );
}

/** Multi-series line chart with a crosshair tooltip. data: [{ label, [seriesKey]: number }] */
export function LineChart({ data, series, height = 220, yDomain, format = (v) => v, ariaLabel }) {
  const theme = useTheme();
  const ref = useRef(null);
  const [hover, setHover] = useState(null);
  const width = 640;
  const pad = { l: 40, r: 56, t: 16, b: 30 };
  const values = data.flatMap((row) => series.map((s) => row[s.key])).filter((v) => v != null);
  const [min, max] = yDomain ?? [Math.min(...values) - 0.1, Math.max(...values) + 0.1];
  const x = (i) => pad.l + (data.length === 1 ? (width - pad.l - pad.r) / 2 : (i * (width - pad.l - pad.r)) / (data.length - 1));
  const y = (v) => pad.t + (1 - (v - min) / (max - min || 1)) * (height - pad.t - pad.b);
  const ticks = useMemo(() => Array.from({ length: 4 }, (_, i) => min + ((max - min) * i) / 3), [min, max]);

  const onMove = (event) => {
    const rect = ref.current.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * width;
    let best = 0;
    data.forEach((_, i) => {
      if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    });
    setHover(best);
  };

  return (
    <Box sx={{ position: 'relative' }}>
      <Legend series={series} />
      <Box component="svg" ref={ref} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} sx={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={pad.l} x2={width - pad.r} y1={y(tick)} y2={y(tick)} stroke={theme.palette.divider} strokeDasharray="3 4" />
            <text x={pad.l - 8} y={y(tick) + 4} textAnchor="end" fontSize="11" fill={theme.palette.text.secondary}>{format(tick)}</text>
          </g>
        ))}
        {data.map((row, i) => (
          <text key={row.label} x={x(i)} y={height - 8} textAnchor="middle" fontSize="11" fill={theme.palette.text.secondary}>{row.label}</text>
        ))}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={height - pad.b} stroke={theme.palette.text.disabled} />}
        {series.map((s, index) => {
          const points = data.map((row, i) => (row[s.key] == null ? null : [x(i), y(row[s.key])])).filter(Boolean);
          const last = points[points.length - 1];
          const lastRow = [...data].reverse().find((row) => row[s.key] != null);
          return (
            <g key={s.key}>
              <polyline points={points.map((p) => p.join(',')).join(' ')} fill="none" stroke={SERIES_COLORS[index]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {points.map(([px, py], i) => (
                <circle key={i} cx={px} cy={py} r={hover === i ? 5 : 4} fill={SERIES_COLORS[index]} stroke={theme.palette.background.paper} strokeWidth="2" />
              ))}
              {last && (
                <text x={last[0] + 8} y={last[1] + 4} fontSize="11" fontWeight="600" fill={theme.palette.text.primary}>{format(lastRow[s.key])}</text>
              )}
            </g>
          );
        })}
        <rect x={pad.l} y={pad.t} width={width - pad.l - pad.r} height={height - pad.t - pad.b} fill="transparent" />
      </Box>
      {hover != null && (
        <Tooltip x={`${(x(hover) / width) * 100}%`} y={0}>
          <strong>{data[hover].label}</strong>
          {series.map((s, index) => (
            <Box key={s.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: SERIES_COLORS[index] }} />
              {s.label}: {data[hover][s.key] == null ? '—' : format(data[hover][s.key])}
            </Box>
          ))}
        </Tooltip>
      )}
    </Box>
  );
}

/** Single-series vertical bar chart. data: [{ label, value, muted? }] */
export function BarChart({ data, height = 190, width = 420, format = (v) => v, ariaLabel, color = SERIES_COLORS[0] }) {
  const theme = useTheme();
  const [hover, setHover] = useState(null);
  const pad = { l: 12, r: 12, t: 22, b: 30 };
  const max = Math.max(1, ...data.map((row) => row.value));
  const slot = (width - pad.l - pad.r) / Math.max(1, data.length);
  const barWidth = Math.min(56, slot * 0.6);
  const y = (v) => pad.t + (1 - v / max) * (height - pad.t - pad.b);
  const base = height - pad.b;
  return (
    <Box sx={{ position: 'relative' }}>
      <Box component="svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel} sx={{ width: '100%', height: 'auto', display: 'block' }}>
        <line x1={pad.l} x2={width - pad.r} y1={base} y2={base} stroke={theme.palette.divider} />
        {data.map((row, i) => {
          const cx = pad.l + slot * i + slot / 2;
          const top = y(row.value);
          const h = Math.max(0, base - top);
          const r = Math.min(4, h);
          return (
            <g key={row.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={cx - slot / 2} y={pad.t} width={slot} height={base - pad.t} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${cx - barWidth / 2},${base} V${top + r} Q${cx - barWidth / 2},${top} ${cx - barWidth / 2 + r},${top} H${cx + barWidth / 2 - r} Q${cx + barWidth / 2},${top} ${cx + barWidth / 2},${top + r} V${base} Z`}
                  fill={color}
                  opacity={row.muted ? 0.4 : hover === null || hover === i ? 1 : 0.55}
                  style={{ transition: 'opacity 150ms ease' }}
                />
              )}
              <text x={cx} y={top - 6} textAnchor="middle" fontSize="11" fontWeight="600" fill={theme.palette.text.primary}>{row.value ? format(row.value) : ''}</text>
              <text x={cx} y={height - 9} textAnchor="middle" fontSize="11" fill={theme.palette.text.secondary}>{row.label}</text>
            </g>
          );
        })}
      </Box>
      {hover != null && (
        <Tooltip x={`${((pad.l + slot * hover + slot / 2) / width) * 100}%`} y={0}>
          <strong>{data[hover].label}</strong>: {format(data[hover].value)}{data[hover].note ? ` · ${data[hover].note}` : ''}
        </Tooltip>
      )}
    </Box>
  );
}

/** Horizontal progress bars for comparing a few labelled values against a max. */
export function HBarList({ rows, max = 100, format = (v) => v, color = SERIES_COLORS[0] }) {
  return (
    <Stack spacing={1.5}>
      {rows.map((row) => (
        <Box key={row.label} title={`${row.label}: ${format(row.value)}`}>
          <Stack direction="row" justifyContent="space-between" spacing={1} sx={{ mb: 0.5 }}>
            <Typography variant="body2" fontWeight={600} noWrap>{row.label}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{row.value == null ? '—' : format(row.value)}{row.suffix ? ` · ${row.suffix}` : ''}</Typography>
          </Stack>
          <Box sx={{ height: 8, borderRadius: 4, bgcolor: 'grey.100', overflow: 'hidden' }}>
            <Box sx={{ height: '100%', width: `${Math.min(100, ((row.value ?? 0) / max) * 100)}%`, bgcolor: color, borderRadius: 4, transition: 'width 600ms cubic-bezier(.2,.8,.2,1)' }} />
          </Box>
        </Box>
      ))}
    </Stack>
  );
}

/** Ring gauge for a single headline percentage. */
export function ProgressRing({ value, secondary = 0, size = 150, stroke = 12, label, sublabel }) {
  const theme = useTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const main = Math.min(100, value);
  const extra = Math.min(100 - main, secondary);
  return (
    <Box sx={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} role="img" aria-label={`${label ?? ''} ${value}%`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={theme.palette.grey[100]} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={SERIES_COLORS[1]} strokeOpacity={0.45} strokeWidth={stroke} strokeDasharray={`${((main + extra) / 100) * c} ${c}`} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={SERIES_COLORS[0]} strokeWidth={stroke} strokeDasharray={`${(main / 100) * c} ${c}`} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dasharray 800ms cubic-bezier(.2,.8,.2,1)' }} />
      </svg>
      <Stack alignItems="center" justifyContent="center" sx={{ position: 'absolute', inset: 0 }}>
        <Typography variant="metric" sx={{ fontSize: size > 120 ? '2rem' : '1.4rem', lineHeight: 1 }}>{value}%</Typography>
        {sublabel && <Typography variant="caption" color="text.secondary">{sublabel}</Typography>}
      </Stack>
    </Box>
  );
}

/** Toggleable table view so no chart relies on colour or hover alone. */
export function ChartTable({ columns, rows }) {
  return (
    <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', '& th, & td': { textAlign: 'left', py: 0.75, px: 1, borderBottom: 1, borderColor: 'divider' }, '& th': { color: 'text.secondary', fontWeight: 600 } }}>
      <thead><tr>{columns.map((col) => <th key={col.key}>{col.label}</th>)}</tr></thead>
      <tbody>{rows.map((row, i) => <tr key={i}>{columns.map((col) => <td key={col.key}>{row[col.key] ?? '—'}</td>)}</tr>)}</tbody>
    </Box>
  );
}

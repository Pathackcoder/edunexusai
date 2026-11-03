import React, { useLayoutEffect, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ButtonBase from '@mui/material/ButtonBase';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { alpha } from '@mui/material/styles';
import { getTone } from '../../theme/tones';

/**
 * A list that fits its card. In a fixed-height dashboard slot it shows as many whole
 * rows as the space allows (never a clipped half row) and replaces the rest with a
 * "+N more" link to the full page. With natural height (phones) it shows up to `max`.
 *
 * items: array · renderItem(item, index) · getKey(item, index) · max: cap on items shown
 * columns: optional grid columns (number or responsive object) for wide cards.
 * renderSpotlight(item): richer presentation used when there is exactly one item, so a
 * single real record fills the card meaningfully instead of leaving an empty band. A
 * lone row without a spotlight is centred in the space.
 */
// "+N more" link height including its top margin.
const MORE_LINK_HEIGHT = 30;

export function FitList({ items, renderItem, renderSpotlight, getKey = (item, index) => item?.id ?? index, max, gap = 1, columns, moreTo, moreLabel = 'more', sx }) {
  const capped = items.slice(0, max ?? items.length);
  const beyondCap = items.length - capped.length;
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const [fit, setFit] = useState(capped.length);
  // When rows are hidden, the list is sized to exactly the rows it shows.
  const [listHeight, setListHeight] = useState(null);
  // Lots of room left over: centre the rows (and the "+N more" link) instead of leaving one
  // empty band at the bottom of the card.
  const [roomy, setRoomy] = useState(false);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const el = listRef.current;
    if (!root || !el) return undefined;
    const measure = () => {
      const rows = [...el.children].filter((child) => child.dataset.fitItem !== undefined);
      const avail = root.clientHeight;
      const bottom = (i) => rows[i].offsetTop + rows[i].offsetHeight;
      // Items are in reading order, so the first one that does not fit ends the visible run.
      const fitsWithin = (limit) => {
        const n = rows.findIndex((_, i) => bottom(i) > limit + 1);
        return n === -1 ? rows.length : n;
      };
      let n = fitsWithin(avail);
      const needsMore = Boolean(moreTo) && (n < rows.length || beyondCap > 0);
      if (needsMore) n = fitsWithin(avail - MORE_LINK_HEIGHT);
      const used = n ? bottom(n - 1) + 2 : 0;
      const nextHeight = n < rows.length ? used : null;
      const total = used + (needsMore ? MORE_LINK_HEIGHT : 0);
      const nextRoomy = avail > 0 && total < avail * 0.8;
      setFit((current) => (current === n ? current : n));
      setListHeight((current) => (current === nextHeight ? current : nextHeight));
      setRoomy((current) => (current === nextRoomy ? current : nextRoomy));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    observer.observe(el);
    return () => observer.disconnect();
  }, [capped.length, beyondCap, moreTo]);

  const hidden = capped.length - Math.min(fit, capped.length) + beyondCap;
  const single = items.length === 1;
  if (items.length === 0) return null;

  if (single && renderSpotlight) {
    return (
      <Box sx={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', ...sx }}>
        {renderSpotlight(items[0])}
      </Box>
    );
  }

  return (
    <Box ref={rootRef} sx={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: single || roomy ? 'center' : 'flex-start', ...sx }}>
      <Box
        ref={listRef}
        sx={{
          position: 'relative',
          flex: '0 1 auto',
          height: listHeight ?? 'auto',
          minHeight: 0,
          overflow: 'hidden',
          gap,
          p: '2px',
          m: '-2px',
          alignContent: 'start',
          ...(columns
            ? { display: 'grid', gridTemplateColumns: typeof columns === 'number' ? `repeat(${columns}, minmax(0, 1fr))` : Object.fromEntries(Object.entries(columns).map(([bp, n]) => [bp, `repeat(${n}, minmax(0, 1fr))`])) }
            : { display: 'flex', flexDirection: 'column' }),
        }}
      >
        {capped.map((item, index) => (
          <Box key={getKey(item, index)} data-fit-item="" sx={{ flexShrink: 0, minWidth: 0, visibility: index < fit ? 'visible' : 'hidden' }}>
            {renderItem(item, index)}
          </Box>
        ))}
      </Box>
      {hidden > 0 && moreTo && (
        <ButtonBase
          component={RouterLink}
          to={moreTo}
          sx={{
            alignSelf: 'flex-start',
            flexShrink: 0,
            mt: 0.75,
            px: 1,
            py: 0.25,
            gap: 0.5,
            borderRadius: '999px',
            typography: 'caption',
            fontWeight: 600,
            color: 'primary.main',
            '& svg': { fontSize: 14, transition: 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)' },
            '&:hover': { bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08), '& svg': { transform: 'translateX(2px)' } },
          }}
        >
          +{hidden} {moreLabel}
          <ArrowForwardRoundedIcon />
        </ButtonBase>
      )}
    </Box>
  );
}

/**
 * Composed empty state for a dashboard card: a soft icon disc, a short title, one line
 * of guidance and an optional action, centred in the space the card has. Real guidance
 * only, never placeholder data.
 */
export function WidgetEmpty({ icon: Icon, tone = 'primary', title, children, action, sx }) {
  return (
    <Stack alignItems="center" justifyContent="center" spacing={0.75} sx={{ flex: '1 1 auto', textAlign: 'center', py: 1.5, px: 1, minHeight: 0, ...sx }}>
      {Icon && (
        <Box
          sx={(theme) => {
            const t = getTone(theme, tone);
            return {
              width: 44,
              height: 44,
              borderRadius: '14px',
              display: 'grid',
              placeItems: 'center',
              color: t.solid,
              bgcolor: alpha(t.solid, 0.1),
              boxShadow: `inset 0 0 0 1px ${alpha(t.solid, 0.14)}`,
              mb: 0.5,
              '& svg': { fontSize: 22 },
            };
          }}
        >
          <Icon />
        </Box>
      )}
      {title && <Typography variant="subtitle2">{title}</Typography>}
      {children && (
        <Typography variant="caption" component="p" sx={{ maxWidth: 280, lineHeight: 1.5 }}>
          {children}
        </Typography>
      )}
      {action && <Box sx={{ pt: 0.75 }}>{action}</Box>}
    </Stack>
  );
}

export default FitList;

/**
 * Spotlight presentation of a single record: eyebrow, title, a supporting line, metadata
 * chips and an optional action. Works on light cards and on featured (navy) cards.
 */
export function Spotlight({ eyebrow, title, subtitle, meta = [], aside, action, tone = 'primary', children }) {
  return (
    <Box
      sx={(theme) => {
        const t = getTone(theme, tone);
        return {
          position: 'relative',
          p: 1.75,
          borderRadius: '16px',
          border: 1,
          borderColor: alpha(t.solid, 0.18),
          background: `linear-gradient(140deg, ${alpha(t.solid, 0.1)} 0%, ${alpha(t.solid, 0.02)} 70%)`,
          overflow: 'hidden',
        };
      }}
    >
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
        <Box sx={{ minWidth: 0 }}>
          {eyebrow && (
            <Typography variant="overline" component="p" noWrap sx={(theme) => ({ color: getTone(theme, tone).solid, lineHeight: 1.6 })}>
              {eyebrow}
            </Typography>
          )}
          <Typography variant="h5" component="h3" sx={{ lineHeight: 1.3 }}>
            {title}
          </Typography>
        </Box>
        {aside && <Box sx={{ flexShrink: 0 }}>{aside}</Box>}
      </Stack>
      {subtitle && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {subtitle}
        </Typography>
      )}
      {children}
      {meta.filter(Boolean).length > 0 && (
        <Stack direction="row" useFlexGap flexWrap="wrap" spacing={0.75} sx={{ mt: 1.25 }}>
          {meta.filter(Boolean).map(({ icon: MetaIcon, label }) => (
            <Stack
              key={label}
              direction="row"
              alignItems="center"
              spacing={0.5}
              sx={{ px: 0.875, py: 0.375, borderRadius: '8px', bgcolor: (theme) => alpha(theme.palette.text.primary, 0.05), typography: 'caption', color: 'text.secondary', maxWidth: '100%' }}
            >
              {MetaIcon && <MetaIcon sx={{ fontSize: 14, flexShrink: 0 }} />}
              <Box component="span" sx={{ overflowWrap: 'anywhere' }}>{label}</Box>
            </Stack>
          ))}
        </Stack>
      )}
      {action && <Box sx={{ mt: 1.25 }}>{action}</Box>}
    </Box>
  );
}

import React, { useEffect, useRef } from 'react';
import { keyframes } from '@emotion/react';
import Box from '@mui/material/Box';
import GlobalStyles from '@mui/material/GlobalStyles';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
import AssignmentTurnedInRoundedIcon from '@mui/icons-material/AssignmentTurnedInRounded';
import NotificationsActiveRoundedIcon from '@mui/icons-material/NotificationsActiveRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import PlaceRoundedIcon from '@mui/icons-material/PlaceRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import SchoolRoundedIcon from '@mui/icons-material/SchoolRounded';
import AccountBalanceWalletRoundedIcon from '@mui/icons-material/AccountBalanceWalletRounded';

/**
 * Login hero: "one platform for campus life".
 *
 * A vector campus building sits on a lit platform while the portal's own surfaces —
 * today's class, GPA, an assignment, an approval notification, a tuition receipt and
 * the AI assistant — float around it, joined by lines that carry data to the centre.
 * Card contents mirror the demo dataset; nothing here claims real metrics.
 *
 * Motion budget: transform/opacity only, long easing periods, staggered so nothing
 * moves in unison. Pointer parallax is a few pixels per layer. Everything stops under
 * prefers-reduced-motion (see the root `sx` and the effect below).
 */

const enter = keyframes`
  from { opacity: 0; transform: translate3d(0, 14px, 0) scale(0.96); }
  to   { opacity: 1; transform: none; }
`;
const float = keyframes`
  0%, 100% { transform: translate3d(0, 0, 0); }
  50%      { transform: translate3d(0, -8px, 0); }
`;
const drift = keyframes`
  0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
  33%      { transform: translate3d(4%, -3%, 0) scale(1.06); }
  66%      { transform: translate3d(-3%, 4%, 0) scale(0.97); }
`;
const spin = keyframes`
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
`;
const pulse = keyframes`
  0%   { transform: scale(1); opacity: 0.7; }
  70%  { transform: scale(2.4); opacity: 0; }
  100% { transform: scale(2.4); opacity: 0; }
`;
const rise = keyframes`
  0%   { transform: translate3d(0, 0, 0); opacity: 0; }
  15%  { opacity: 0.9; }
  85%  { opacity: 0.6; }
  100% { transform: translate3d(0, -140px, 0); opacity: 0; }
`;
const notify = keyframes`
  0%, 6%    { opacity: 0; transform: translate3d(0, -8px, 0) scale(0.97); }
  12%, 62%  { opacity: 1; transform: none; }
  70%, 100% { opacity: 0; transform: translate3d(0, -8px, 0) scale(0.97); }
`;
const typing = keyframes`
  0%, 80%, 100% { opacity: 0.25; transform: translateY(0); }
  40%           { opacity: 1; transform: translateY(-2px); }
`;

/**
 * Keyframes referenced from SVG `style` attributes must exist as named global rules —
 * Emotion only injects `keyframes` objects that are used through `sx`/`css`.
 */
const svgKeyframes = (
  <GlobalStyles
    styles={{
      '@keyframes enxGlow': { '0%, 100%': { opacity: 0.55 }, '50%': { opacity: 1 } },
      '@keyframes enxFlow': { to: { strokeDashoffset: -40 } },
      '@keyframes enxFill': { from: { strokeDashoffset: 113 } },
      '@media (prefers-reduced-motion: reduce)': {
        '.enx-scene *': { animation: 'none !important' },
      },
    }}
  />
);

const glass = {
  background: 'linear-gradient(145deg, rgba(255,255,255,0.16), rgba(255,255,255,0.06))',
  border: '1px solid rgba(255,255,255,0.22)',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  boxShadow: '0 18px 40px -18px rgba(8, 6, 40, 0.65), inset 0 1px 0 rgba(255,255,255,0.18)',
  color: '#fff',
};
const solid = {
  background: '#FFFFFF',
  border: '1px solid rgba(255,255,255,0.9)',
  boxShadow: '0 24px 50px -20px rgba(8, 6, 40, 0.7)',
  color: '#121833',
};

/**
 * A positioned element: an outer layer for parallax (depth in px), an inner layer that
 * enters and then floats. Separate layers so the transforms never fight.
 */
function Floating({ sx, depth = 8, delay = 0, period = 7, children, hide }) {
  return (
    <Box
      className="parallax"
      sx={{
        position: 'absolute',
        zIndex: 3,
        transform: `translate3d(calc(var(--px, 0) * ${depth}px), calc(var(--py, 0) * ${depth}px), 0)`,
        transition: 'transform 600ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        display: hide ? { md: 'none', lg: 'block' } : 'block',
        ...sx,
      }}
    >
      <Box
        sx={{
          animation: `${enter} 700ms cubic-bezier(0.2, 0.8, 0.2, 1) ${delay}ms both, ${float} ${period}s ease-in-out ${delay + 700}ms infinite`,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

const Card = ({ variant = 'glass', sx, children }) => (
  <Box
    sx={{
      ...(variant === 'solid' ? solid : glass),
      borderRadius: '16px',
      p: 1.5,
      transition: 'transform 300ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 300ms ease',
      '&:hover': { transform: 'translateY(-3px) scale(1.02)' },
      ...sx,
    }}
  >
    {children}
  </Box>
);

const IconBadge = ({ icon: Icon, from, to, size = 30 }) => (
  <Box
    sx={{
      width: size,
      height: size,
      borderRadius: '10px',
      display: 'grid',
      placeItems: 'center',
      flexShrink: 0,
      color: '#fff',
      background: `linear-gradient(135deg, ${from}, ${to})`,
      boxShadow: `0 6px 14px -6px ${to}`,
      '& svg': { fontSize: size * 0.56 },
    }}
  >
    <Icon />
  </Box>
);

const LiveDot = ({ color = '#34D399', sx }) => (
  <Box sx={{ position: 'relative', width: 8, height: 8, flexShrink: 0, ...sx }}>
    <Box sx={{ position: 'absolute', inset: 0, borderRadius: '50%', bgcolor: color, animation: `${pulse} 2.4s ease-out infinite` }} />
    <Box sx={{ position: 'absolute', inset: 0, borderRadius: '50%', bgcolor: color }} />
  </Box>
);

/** The campus building, drawn for the dark scene: lit glass, brand-gradient pediment. */
const CampusBuilding = () => (
  <svg viewBox="0 0 400 300" width="100%" height="100%" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="enx-ped" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#6366F1" />
        <stop offset="1" stopColor="#A855F7" />
      </linearGradient>
      <linearGradient id="enx-wall" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#FFFFFF" />
        <stop offset="1" stopColor="#DCDDFB" />
      </linearGradient>
      <linearGradient id="enx-wing" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#EEF0FF" />
        <stop offset="1" stopColor="#C9CBF5" />
      </linearGradient>
      <linearGradient id="enx-window" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#67E8F9" />
        <stop offset="1" stopColor="#818CF8" />
      </linearGradient>
      <radialGradient id="enx-platform" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#67E8F9" stopOpacity="0.55" />
        <stop offset="0.55" stopColor="#818CF8" stopOpacity="0.22" />
        <stop offset="1" stopColor="#818CF8" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="enx-beam" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stopColor="#A5F3FC" stopOpacity="0.7" />
        <stop offset="1" stopColor="#A5F3FC" stopOpacity="0" />
      </linearGradient>
    </defs>

    {/* Lit platform */}
    <ellipse cx="200" cy="262" rx="178" ry="34" fill="url(#enx-platform)" />
    <ellipse cx="200" cy="258" rx="136" ry="20" fill="none" stroke="#A5B4FC" strokeOpacity="0.45" strokeDasharray="3 6" />
    <ellipse cx="200" cy="258" rx="96" ry="12" fill="none" stroke="#67E8F9" strokeOpacity="0.35" />

    {/* Beacon beam */}
    <rect x="197" y="0" width="6" height="52" fill="url(#enx-beam)" style={{ animation: `enxGlow 4s ease-in-out infinite` }} />

    {/* Tower + dome */}
    <rect x="176" y="62" width="48" height="58" rx="4" fill="url(#enx-wing)" />
    <path d="M172 64 Q200 30 228 64 Z" fill="url(#enx-ped)" />
    <line x1="200" y1="44" x2="200" y2="26" stroke="#C7D2FE" strokeWidth="2" />
    <circle cx="200" cy="24" r="4.5" fill="#67E8F9" style={{ animation: `enxGlow 2.6s ease-in-out infinite` }} />
    <rect x="190" y="78" width="20" height="24" rx="10" fill="url(#enx-window)" opacity="0.9" />

    {/* Side wings */}
    <rect x="52" y="168" width="64" height="74" rx="4" fill="url(#enx-wing)" />
    <rect x="284" y="168" width="64" height="74" rx="4" fill="url(#enx-wing)" />
    {[0, 1].map((col) =>
      [0, 1, 2].map((row) => (
        <React.Fragment key={`${col}-${row}`}>
          <rect x={62 + col * 24} y={178 + row * 20} width="16" height="12" rx="2" fill="url(#enx-window)" style={{ animation: `enxGlow ${3 + row + col}s ease-in-out ${row * 0.6}s infinite` }} />
          <rect x={294 + col * 24} y={178 + row * 20} width="16" height="12" rx="2" fill="url(#enx-window)" style={{ animation: `enxGlow ${4 + row}s ease-in-out ${col * 0.8}s infinite` }} />
        </React.Fragment>
      )),
    )}

    {/* Main hall */}
    <rect x="104" y="146" width="192" height="96" rx="4" fill="url(#enx-wall)" />
    {[0, 1, 2, 3, 4, 5].map((i) => (
      <React.Fragment key={i}>
        <rect x={116 + i * 30} y="156" width="12" height="82" rx="3" fill="#FFFFFF" />
        <rect x={116 + i * 30} y="156" width="4" height="82" rx="2" fill="#C7C9F2" opacity="0.7" />
        {i < 5 && <rect x={132 + i * 30} y="170" width="10" height="44" rx="2" fill="url(#enx-window)" opacity="0.75" style={{ animation: `enxGlow ${3.4 + (i % 3)}s ease-in-out ${i * 0.5}s infinite` }} />}
      </React.Fragment>
    ))}
    {/* Pediment */}
    <path d="M94 148 L200 98 L306 148 Z" fill="url(#enx-ped)" />
    <path d="M122 142 L200 108 L278 142 Z" fill="#FFFFFF" opacity="0.14" />
    <circle cx="200" cy="130" r="9" fill="#FFFFFF" opacity="0.95" />
    <path d="M195 130 L199 134 L206 125" stroke="#7C3AED" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />

    {/* Steps */}
    <rect x="96" y="240" width="208" height="8" rx="2" fill="#E7E8FF" />
    <rect x="84" y="247" width="232" height="8" rx="2" fill="#D3D5FA" />

    {/* Trees */}
    <circle cx="36" cy="222" r="16" fill="#2DD4BF" opacity="0.85" />
    <circle cx="26" cy="232" r="11" fill="#5EEAD4" opacity="0.8" />
    <rect x="34" y="232" width="3" height="20" rx="1.5" fill="#99F6E4" opacity="0.7" />
    <circle cx="366" cy="220" r="15" fill="#A78BFA" opacity="0.85" />
    <circle cx="376" cy="232" r="10" fill="#C4B5FD" opacity="0.85" />
    <rect x="364" y="230" width="3" height="22" rx="1.5" fill="#DDD6FE" opacity="0.7" />
  </svg>
);

const PARTICLES = Array.from({ length: 14 }, (_, i) => ({
  left: `${(i * 73) % 100}%`,
  bottom: `${(i * 37) % 40}%`,
  size: 2 + (i % 3),
  duration: 9 + (i % 5) * 2,
  delay: (i * 0.9) % 9,
}));

export function CampusScene() {
  const root = useRef(null);

  // Pointer parallax: a few pixels per layer, rAF-throttled, off for reduced motion.
  useEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    let frame = 0;
    const onMove = (event) => {
      const rect = el.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        el.style.setProperty('--px', x.toFixed(3));
        el.style.setProperty('--py', y.toFixed(3));
      });
    };
    const onLeave = () => {
      cancelAnimationFrame(frame);
      el.style.setProperty('--px', '0');
      el.style.setProperty('--py', '0');
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return (
    <Box
      ref={root}
      className="enx-scene"
      sx={{
        position: 'relative',
        width: '100%',
        height: '100%',
        borderRadius: '28px',
        overflow: 'hidden',
        isolation: 'isolate',
        color: '#fff',
        background: 'linear-gradient(155deg, #161A52 0%, #241C66 45%, #3A2A8E 100%)',
        display: 'flex',
        flexDirection: 'column',
        '@media (prefers-reduced-motion: reduce)': {
          '& *, & *::before, & *::after': { animation: 'none !important', transition: 'none !important' },
        },
      }}
    >
      {svgKeyframes}
      {/* Ambient light: slow-moving colour fields */}
      {[
        { c: 'rgba(34, 211, 238, 0.35)', s: { top: '-18%', right: '-12%', width: '62%' }, d: 22 },
        { c: 'rgba(168, 85, 247, 0.38)', s: { bottom: '-22%', left: '-16%', width: '70%' }, d: 26 },
        { c: 'rgba(45, 212, 191, 0.18)', s: { top: '38%', left: '30%', width: '44%' }, d: 30 },
        { c: 'rgba(245, 158, 11, 0.14)', s: { bottom: '6%', right: '4%', width: '30%' }, d: 24 },
      ].map((blob, i) => (
        <Box key={i} aria-hidden sx={{ position: 'absolute', aspectRatio: '1', borderRadius: '50%', background: `radial-gradient(circle, ${blob.c} 0%, transparent 68%)`, animation: `${drift} ${blob.d}s ease-in-out ${i * -4}s infinite`, zIndex: 0, ...blob.s }} />
      ))}

      {/* Faint campus grid */}
      <Box
        aria-hidden
        sx={{
          position: 'absolute',
          inset: 0,
          zIndex: 0,
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.055) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          maskImage: 'radial-gradient(ellipse 70% 60% at 50% 42%, #000 20%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 50% 42%, #000 20%, transparent 75%)',
        }}
      />

      {/* Particles */}
      {PARTICLES.map((p, i) => (
        <Box key={i} aria-hidden sx={{ position: 'absolute', left: p.left, bottom: p.bottom, width: p.size, height: p.size, borderRadius: '50%', bgcolor: i % 3 ? '#C7D2FE' : '#67E8F9', boxShadow: '0 0 8px rgba(165,243,252,0.8)', animation: `${rise} ${p.duration}s linear ${p.delay}s infinite`, opacity: 0, zIndex: 1 }} />
      ))}

      {/* Brand tag */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ position: 'relative', zIndex: 4, px: { md: 3.5, lg: 4.5 }, pt: { md: 3, lg: 3.5 } }}>
        <LiveDot />
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.78)' }}>
          EdunexusAI · Digital campus
        </Typography>
      </Stack>

      {/* Scene */}
      <Box sx={{ position: 'relative', zIndex: 2, flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', px: { md: 2, lg: 4 } }}>
        <Box
          sx={{
            position: 'relative',
            width: 'min(100%, 640px, calc((100vh - 300px) * 1.18))',
            aspectRatio: '1.18',
          }}
        >
          {/* Orbit rings, seen in perspective */}
          <Box aria-hidden sx={{ position: 'absolute', left: '8%', right: '8%', top: '14%', aspectRatio: '1', transform: 'rotateX(72deg)', transformStyle: 'preserve-3d', zIndex: 1 }}>
            <Box sx={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid rgba(199,210,254,0.22)', animation: `${spin} 60s linear infinite` }}>
              {[0, 120, 240].map((deg) => {
                const rad = (deg * Math.PI) / 180;
                return (
                  <Box key={deg} sx={{ position: 'absolute', left: `${50 + 50 * Math.sin(rad)}%`, top: `${50 - 50 * Math.cos(rad)}%`, width: 9, height: 9, ml: '-4.5px', mt: '-4.5px', borderRadius: '50%', bgcolor: deg ? '#A5B4FC' : '#67E8F9', boxShadow: '0 0 12px #67E8F9' }} />
                );
              })}
            </Box>
            <Box sx={{ position: 'absolute', inset: '14%', borderRadius: '50%', border: '1px dashed rgba(165,243,252,0.25)', animation: `${spin} 90s linear infinite reverse` }} />
          </Box>

          {/* Data lines: every surface feeds the campus core */}
          <Box component="svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 2, overflow: 'visible' }}>
            {[
              'M50 46 C 42 38, 36 28, 30 20',
              'M50 46 C 58 36, 66 26, 76 19',
              'M50 50 C 40 52, 34 54, 30 55',
              'M50 48 C 60 44, 66 42, 74 41',
              'M50 54 C 46 64, 42 72, 38 78',
              'M50 54 C 58 66, 66 78, 74 84',
            ].map((d, i) => (
              <path key={i} d={d} fill="none" stroke={i % 2 ? '#A5B4FC' : '#67E8F9'} strokeOpacity="0.45" strokeWidth="1.2" strokeDasharray="2 6" vectorEffect="non-scaling-stroke" style={{ animation: `enxFlow ${3 + (i % 3)}s linear infinite` }} />
            ))}
          </Box>

          {/* Campus core */}
          <Box
            className="parallax"
            sx={{
              position: 'absolute',
              left: '19%',
              right: '19%',
              top: '21%',
              zIndex: 2,
              transform: 'translate3d(calc(var(--px, 0) * -4px), calc(var(--py, 0) * -4px), 0)',
              transition: 'transform 700ms cubic-bezier(0.2, 0.8, 0.2, 1)',
              animation: `${enter} 900ms cubic-bezier(0.2, 0.8, 0.2, 1) 80ms both`,
              filter: 'drop-shadow(0 30px 40px rgba(10, 6, 50, 0.55))',
            }}
          >
            <CampusBuilding />
          </Box>

          {/* Today's class — the solid, anchoring card */}
          <Floating sx={{ top: '2%', left: '0%' }} depth={10} delay={250} period={8}>
            <Card variant="solid" sx={{ width: 256 }}>
              <Stack direction="row" spacing={1.25} alignItems="center">
                <IconBadge icon={CalendarMonthRoundedIcon} from="#4651DE" to="#7A4FD8" />
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: '0.6875rem', color: '#6B7391', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Next class · CS 501</Typography>
                  <Typography sx={{ fontSize: '0.8125rem', fontWeight: 700, lineHeight: 1.3 }} noWrap>Advanced Database Systems</Typography>
                </Box>
              </Stack>
              <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 1, color: '#6B7391' }}>
                <PlaceRoundedIcon sx={{ fontSize: 14 }} />
                <Typography sx={{ fontSize: '0.71875rem' }}>10:00 AM · Science Building 204</Typography>
                <Box sx={{ flex: 1 }} />
                <LiveDot color="#13845A" />
              </Stack>
            </Card>
          </Floating>

          {/* GPA */}
          <Floating sx={{ top: '4%', right: '1%' }} depth={12} delay={400} period={9}>
            <Card sx={{ width: 168, display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <Box sx={{ position: 'relative', width: 46, height: 46, flexShrink: 0 }}>
                <svg viewBox="0 0 44 44" width="46" height="46" aria-hidden="true">
                  <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="5" />
                  <circle cx="22" cy="22" r="18" fill="none" stroke="url(#enx-gpa)" strokeWidth="5" strokeLinecap="round" strokeDasharray="113" strokeDashoffset="28" transform="rotate(-90 22 22)" style={{ animation: `enxFill 1.6s cubic-bezier(0.2,0.8,0.2,1) 700ms both` }} />
                  <defs>
                    <linearGradient id="enx-gpa" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0" stopColor="#67E8F9" />
                      <stop offset="1" stopColor="#A78BFA" />
                    </linearGradient>
                  </defs>
                </svg>
                <SchoolRoundedIcon sx={{ position: 'absolute', inset: 0, m: 'auto', fontSize: 16, color: '#E0E7FF' }} />
              </Box>
              <Box>
                <Typography sx={{ fontFamily: '"Rubik", sans-serif', fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.1 }}>3.72</Typography>
                <Typography sx={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.72)' }}>Cumulative GPA</Typography>
              </Box>
            </Card>
          </Floating>

          {/* Notification that arrives and leaves */}
          <Floating sx={{ top: '33%', right: '0%' }} depth={14} delay={700} period={10} hide>
            <Box sx={{ animation: `${notify} 9s ease-in-out 1.6s infinite` }}>
              <Card sx={{ width: 196, py: 1.25 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <IconBadge icon={NotificationsActiveRoundedIcon} from="#F59E0B" to="#F97316" size={26} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }} noWrap>Request approved</Typography>
                    <Typography sx={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.72)' }} noWrap>Address change · Registrar</Typography>
                  </Box>
                </Stack>
              </Card>
            </Box>
          </Floating>

          {/* Assignment */}
          <Floating sx={{ top: '46%', left: '0%' }} depth={9} delay={550} period={8.5}>
            <Card sx={{ width: 190 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <IconBadge icon={AssignmentTurnedInRoundedIcon} from="#14B8A6" to="#0EA5E9" size={26} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }} noWrap>Schema Design</Typography>
                  <Typography sx={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.72)' }}>Due Sep 28 · CS 501</Typography>
                </Box>
              </Stack>
              <Box sx={{ mt: 1, height: 5, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.16)', overflow: 'hidden' }}>
                <Box sx={{ width: '72%', height: '100%', borderRadius: 3, background: 'linear-gradient(90deg, #2DD4BF, #67E8F9)' }} />
              </Box>
            </Card>
          </Floating>

          {/* Tuition receipt */}
          <Floating sx={{ bottom: '9%', right: '3%' }} depth={11} delay={850} period={9.5} hide>
            <Card variant="solid" sx={{ width: 178, py: 1.25 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <IconBadge icon={AccountBalanceWalletRoundedIcon} from="#13845A" to="#2DD4BF" size={26} />
                <Box>
                  <Typography sx={{ fontSize: '0.6875rem', color: '#6B7391' }}>Payment received</Typography>
                  <Typography sx={{ fontFamily: '"Rubik", sans-serif', fontSize: '0.9375rem', fontWeight: 600 }}>$3,000.00</Typography>
                </Box>
                <CheckCircleRoundedIcon sx={{ fontSize: 18, color: '#13845A', ml: 'auto !important' }} />
              </Stack>
            </Card>
          </Floating>

          {/* AI assistant */}
          <Floating sx={{ bottom: '4%', left: '6%' }} depth={13} delay={1000} period={10.5}>
            <Card sx={{ width: 228 }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
                <IconBadge icon={AutoAwesomeRoundedIcon} from="#6366F1" to="#C084FC" size={24} />
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>Ask EdunexusAI</Typography>
              </Stack>
              <Box sx={{ px: 1.25, py: 0.75, borderRadius: '10px 10px 10px 3px', bgcolor: 'rgba(255,255,255,0.12)', fontSize: '0.71875rem', color: 'rgba(255,255,255,0.9)' }}>What is due this week?</Box>
              <Stack direction="row" spacing={0.5} sx={{ mt: 0.75, ml: 'auto', width: 'fit-content', px: 1, py: 0.6, borderRadius: '10px 10px 3px 10px', bgcolor: 'rgba(103,232,249,0.18)' }}>
                {[0, 1, 2].map((i) => <Box key={i} sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: '#A5F3FC', animation: `${typing} 1.2s ease-in-out ${i * 0.16}s infinite` }} />)}
              </Stack>
            </Card>
          </Floating>

          {/* Small surface chips around the orbit */}
          {[
            { icon: PlaceRoundedIcon, label: 'Campus map', sx: { top: '24%', left: '27%' }, from: '#0EA5E9', to: '#22D3EE', delay: 1150 },
            { icon: GroupsRoundedIcon, label: 'Groups & events', sx: { top: '22%', right: '27%' }, from: '#A855F7', to: '#EC4899', delay: 1250 },
          ].map((chip) => (
            <Floating key={chip.label} sx={chip.sx} depth={16} delay={chip.delay} period={7.5}>
              <Box title={chip.label} sx={{ ...glass, borderRadius: '12px', p: 0.75, display: 'flex' }}>
                <IconBadge icon={chip.icon} from={chip.from} to={chip.to} size={26} />
              </Box>
            </Floating>
          ))}
        </Box>
      </Box>

      {/* Story */}
      <Box sx={{ position: 'relative', zIndex: 4, px: { md: 3.5, lg: 4.5 }, pb: { md: 3.5, lg: 4.5 }, maxWidth: 560, animation: `${enter} 800ms cubic-bezier(0.2, 0.8, 0.2, 1) 300ms both` }}>
        <Typography component="h2" sx={{ fontFamily: '"Rubik", sans-serif', fontWeight: 600, fontSize: { md: '1.5rem', lg: '1.75rem' }, lineHeight: 1.2, letterSpacing: '-0.015em', mb: 1 }}>
          One unified portal for{' '}
          <Box component="span" sx={{ background: 'linear-gradient(90deg, #67E8F9, #C4B5FD)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
            student life
          </Box>
        </Typography>
        <Typography sx={{ fontSize: '0.875rem', lineHeight: 1.6, color: 'rgba(255,255,255,0.72)' }}>
          Seamlessly check daily schedules, upcoming deadlines, grade reports, and settle tuition in one cohesive student interface.
        </Typography>
      </Box>
    </Box>
  );
}

export default CampusScene;

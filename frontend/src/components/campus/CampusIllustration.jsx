import React, { memo, useMemo } from 'react';

/**
 * Illustrated aerial view of the Feddrick University campus (SVG, no map library).
 *
 * Laid out after a classic American campus: a central quad with diagonal walks and a
 * flagpole, a stone gate on the main street, a lake and river, athletics fields with a
 * stadium and tennis courts, parking lots and autumn trees. Buildings come from the
 * tenant's CampusBuilding rows: their stored 0–100 map position is scaled into this world.
 *
 * World units: WORLD_W × WORLD_H. Data positions map as x·WORLD_W/100, y·WORLD_H/100.
 */
export const WORLD_W = 1600;
export const WORLD_H = 1000;
export const toWorld = (x, y) => ({ x: (x * WORLD_W) / 100, y: (y * WORLD_H) / 100 });
export const GATE = { x: 800, y: 958 };

const C = {
  grass: '#DCE7C6',
  lawn: '#C5DCA4',
  lawnEdge: '#B3D08E',
  path: '#F1EADB',
  pathEdge: '#DDD1B8',
  road: '#C9CCD2',
  roadLine: '#F4F5F7',
  water: '#8FC3E3',
  waterEdge: '#6FAED6',
  track: '#C8654C',
  field: '#73B45E',
  court: '#5E9C8C',
  parking: '#D6D9DF',
  roofSlate: '#7E848E',
  roofSlateHi: '#9AA0A9',
  brick: '#A75A44',
  stone: '#B9B2A5',
  shadow: 'rgba(30, 36, 20, 0.22)',
};

/** Footprint and style per building code; unknown codes get a sensible default. */
const SHAPES = {
  SCI: { w: 190, h: 120, style: 'gothic' },
  TEC: { w: 170, h: 110, style: 'modern' },
  ENG: { w: 180, h: 120, style: 'modern' },
  LIB: { w: 170, h: 110, style: 'classical' },
  STU: { w: 180, h: 110, style: 'hall' },
  ADM: { w: 160, h: 100, style: 'classical' },
  HLT: { w: 140, h: 95, style: 'modern' },
  REC: { w: 170, h: 130, style: 'hall' },
  SEC: { w: 100, h: 60, style: 'modern' },
};
export const shapeOf = (code) => SHAPES[code] ?? { w: 140, h: 90, style: 'hall' };

/* ---------- landscape ---------- */

// Walkways as polylines (stone paths). Kept as data so trees can avoid them.
const WALKS = [
  [[800, 958], [800, 470]], // central promenade, gate → quad
  [[600, 200], [880, 470]], // quad diagonals
  [[880, 200], [600, 470]],
  [[600, 335], [880, 335]],
  [[740, 200], [740, 120], [520, 120]],
  [[600, 300], [500, 320]], // → Science
  [[880, 260], [930, 260]], // → Technology
  [[880, 400], [1250, 400]], // → Engineering
  [[800, 560], [760, 560]], // → Library
  [[800, 700], [360, 700]], // → Student Union
  [[800, 680], [1030, 680]], // → Administration
  [[1030, 680], [1340, 720]], // → Health
  [[600, 400], [190, 400]], // → Recreation
  [[800, 840], [740, 840]], // → Safety
  [[520, 120], [330, 230]], // lake loop link
];

const RECTS_NO_TREES = [
  [600, 200, 880, 470], // quad lawn (trees only along its edge)
  [1150, 70, 1560, 290], // athletics
  [1390, 330, 1560, 470], // tennis
  [40, 230, 170, 340], // parking P1
  [1450, 520, 1565, 650], // parking P2
  [60, 820, 240, 920], // parking P3
  [640, 610, 960, 800], // lower lawn
];

function nearSegment(px, py, [ax, ay], [bx, by], margin) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) < margin;
}

/** Deterministic autumn trees that stay off buildings, water, fields, parking and walks. */
function plantTrees(buildings) {
  const palette = ['#5E9B4A', '#4F8A3F', '#6FA552', '#D9822B', '#C4502D', '#E0B23A', '#8BAF45', '#B9442F', '#4C7F3A'];
  let seed = 7;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const trees = [];
  for (let gy = 40; gy < 950; gy += 34) {
    for (let gx = 30; gx < 1580; gx += 36) {
      const x = gx + (rand() - 0.5) * 26;
      const y = gy + (rand() - 0.5) * 22;
      const r = 9 + rand() * 7;
      if (rand() < 0.42) continue;
      if (x > 40 && x < 1560 && (Math.abs(y - 48) < 16 || Math.abs(y - 948) < 16)) continue; // ring road
      if ((Math.abs(x - 48) < 16 || Math.abs(x - 1552) < 16) && y > 40 && y < 950) continue;
      if (y > 968) continue; // main street
      if (((x - 330) / 200) ** 2 + ((y - 150) / 92) ** 2 < 1) continue; // lake
      if (x > 1230 && y < 230 && y > 1300 - x - 40 && y < 1300 - x + 120) continue; // river bank
      if (RECTS_NO_TREES.some(([x1, y1, x2, y2]) => x > x1 - 6 && x < x2 + 6 && y > y1 - 6 && y < y2 + 6) && rand() > 0.12) continue;
      if (buildings.some((b) => Math.abs(x - b.x) < b.w / 2 + 18 && Math.abs(y - b.y) < b.h / 2 + 18)) continue;
      if (WALKS.some((walk) => walk.slice(1).some((p, i) => nearSegment(x, y, walk[i], p, 22)))) continue;
      if (Math.abs(x - 800) < 60 && y > 900) continue; // gate plaza
      trees.push({ x, y, r, fill: palette[Math.floor(rand() * palette.length)] });
    }
  }
  return trees;
}

const Walk = ({ points, width = 16 }) => {
  const d = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
  return (
    <>
      <path d={d} stroke={C.pathEdge} strokeWidth={width + 4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} stroke={C.path} strokeWidth={width} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
};

function ParkingLot({ x, y, w, h }) {
  const rows = Math.floor(h / 30);
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="6" fill={C.parking} stroke="#C2C6CE" />
      {Array.from({ length: rows }, (_, r) => (
        <g key={r}>
          {Array.from({ length: Math.floor(w / 14) }, (_, i) => (
            <line key={i} x1={x + 6 + i * 14} y1={y + 6 + r * 30} x2={x + 6 + i * 14} y2={y + 20 + r * 30} stroke="#FFFFFF" strokeWidth="1.2" />
          ))}
        </g>
      ))}
      {Array.from({ length: 9 }, (_, i) => (
        <rect key={`car-${i}`} x={x + 8 + ((i * 37) % (w - 20))} y={y + 8 + ((i * 53) % Math.max(10, h - 24))} width="9" height="13" rx="2" fill={['#3B4A6B', '#B23A3A', '#E6E6E6', '#2F6F4F', '#5A5A5A'][i % 5]} />
      ))}
      <text x={x + w / 2} y={y + h / 2 + 7} textAnchor="middle" fontSize="20" fontWeight="700" fill="#FFFFFF" opacity="0.9" fontFamily="system-ui, sans-serif">P</text>
    </g>
  );
}

/* ---------- buildings ---------- */

function Building({ b, selected, accent }) {
  const { x, y, w, h, style } = b;
  const left = x - w / 2;
  const top = y - h / 2;
  const roof = style === 'modern' ? '#9AA1AB' : C.roofSlate;
  return (
    <g>
      {/* cast shadow */}
      <rect x={left + 9} y={top + 11} width={w} height={h} rx="4" fill={C.shadow} />
      {/* walls peeking below the roof edge give depth */}
      <rect x={left} y={top + 6} width={w} height={h} rx="4" fill={style === 'modern' ? '#B8BEC6' : C.brick} />
      {style === 'modern' ? (
        <>
          <rect x={left} y={top} width={w} height={h} rx="4" fill={roof} />
          <rect x={left + 10} y={top + 10} width={w - 20} height={h - 20} rx="2" fill="#AEB4BD" />
          <rect x={left + w * 0.18} y={top + h * 0.28} width="22" height="16" fill="#8C939D" />
          <rect x={left + w * 0.55} y={top + h * 0.5} width="30" height="18" fill="#8C939D" />
          <rect x={left + w * 0.7} y={top + h * 0.22} width="16" height="12" fill="#8C939D" />
        </>
      ) : (
        <>
          <rect x={left} y={top} width={w} height={h} rx="4" fill={roof} />
          {/* pitched roof: ridge and lit/shaded planes */}
          <rect x={left} y={top} width={w} height={h / 2} rx="4" fill={C.roofSlateHi} />
          <line x1={left + 6} y1={y} x2={left + w - 6} y2={y} stroke="#6A707A" strokeWidth="2" />
          {Array.from({ length: Math.floor(w / 28) }, (_, i) => (
            <rect key={i} x={left + 14 + i * 28} y={top + 6} width="9" height="8" rx="1" fill="#E7E2D6" opacity="0.85" />
          ))}
        </>
      )}
      {style === 'gothic' && (
        <>
          {/* bell tower */}
          <rect x={x + w / 2 - 44} y={top - 34} width="42" height="58" fill={C.stone} stroke="#8F887B" />
          <rect x={x + w / 2 - 38} y={top - 28} width="30" height="46" fill="#A79F91" />
          <path d={`M${x + w / 2 - 44} ${top - 34} l21 -22 l21 22 Z`} fill="#8A8377" />
        </>
      )}
      {style === 'classical' && (
        <>
          {/* portico with columns facing the walk */}
          <rect x={x - w * 0.28} y={top + h - 4} width={w * 0.56} height="22" fill={C.stone} />
          {Array.from({ length: 6 }, (_, i) => (
            <rect key={i} x={x - w * 0.26 + i * ((w * 0.52) / 5) - 2} y={top + h - 2} width="5" height="18" fill="#F3EFE6" />
          ))}
          <path d={`M${x - w * 0.3} ${top + h - 4} L${x} ${top + h - 22} L${x + w * 0.3} ${top + h - 4} Z`} fill="#CFC8BA" />
        </>
      )}
      {style === 'hall' && <rect x={x - 22} y={top + h - 2} width="44" height="14" rx="2" fill={C.stone} />}
      {selected && <rect x={left - 7} y={top - 7} width={w + 14} height={h + 20} rx="10" fill="none" stroke={accent} strokeWidth="5" strokeDasharray="10 7" />}
    </g>
  );
}

/**
 * buildings: [{ id, code, x, y }] in data units (0–100). selectedId highlights one and
 * draws the walking route from the main gate.
 */
export const CampusIllustration = memo(function CampusIllustration({ buildings, selectedId, accent = '#4651DE', width, height }) {
  const placed = useMemo(
    () => buildings.map((b) => ({ ...b, ...toWorld(b.x, b.y), ...shapeOf(b.code) })),
    [buildings],
  );
  const trees = useMemo(() => plantTrees(placed), [placed]);
  const selected = placed.find((b) => b.id === selectedId);

  return (
    <svg viewBox={`0 0 ${WORLD_W} ${WORLD_H}`} width={width} height={height} style={{ display: 'block' }} aria-hidden="true" focusable="false">
      <defs>
        <pattern id="fu-grass" width="40" height="40" patternUnits="userSpaceOnUse">
          <rect width="40" height="40" fill={C.grass} />
          <circle cx="8" cy="10" r="1.4" fill="#CFDDB4" />
          <circle cx="28" cy="26" r="1.2" fill="#D3E0BA" />
        </pattern>
        <linearGradient id="fu-water" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#A6D2EC" />
          <stop offset="1" stopColor={C.water} />
        </linearGradient>
      </defs>

      {/* ground, town edge and main street */}
      <rect width={WORLD_W} height={WORLD_H} fill="url(#fu-grass)" />
      <rect x="0" y="968" width={WORLD_W} height="32" fill={C.road} />
      <line x1="0" y1="984" x2={WORLD_W} y2="984" stroke={C.roadLine} strokeWidth="2" strokeDasharray="22 16" />
      <rect x="40" y="40" width="1520" height="916" rx="70" fill="none" stroke={C.road} strokeWidth="18" />
      <rect x="40" y="40" width="1520" height="916" rx="70" fill="none" stroke={C.roadLine} strokeWidth="1.5" strokeDasharray="16 14" />

      {/* lake with a walking loop, and the river */}
      <ellipse cx="330" cy="150" rx="212" ry="98" fill="none" stroke={C.path} strokeWidth="8" />
      <path d="M150 160 C 160 90, 300 70, 420 90 S 540 150, 500 200 S 300 250, 210 225 S 140 200, 150 160 Z" fill="url(#fu-water)" stroke={C.waterEdge} strokeWidth="3" />
      <path d="M1250 0 C 1290 60, 1360 90, 1450 120 S 1560 180, 1600 200 L1600 150 C 1540 130, 1460 90, 1400 60 S 1320 20, 1300 0 Z" fill="url(#fu-water)" stroke={C.waterEdge} strokeWidth="2" />

      {/* athletics: stadium, track and field, baseball, tennis */}
      <rect x="1190" y="76" width="320" height="26" rx="4" fill="#8E95A1" />
      <rect x="1190" y="76" width="320" height="10" rx="4" fill="#B1B7C1" />
      <rect x="1170" y="110" width="360" height="170" rx="85" fill={C.track} />
      <rect x="1200" y="134" width="300" height="122" rx="61" fill={C.field} />
      <rect x="1245" y="148" width="210" height="94" fill="none" stroke="#FFFFFF" strokeWidth="2" opacity="0.85" />
      {Array.from({ length: 9 }, (_, i) => <line key={i} x1={1266 + i * 21} y1="148" x2={1266 + i * 21} y2="242" stroke="#FFFFFF" strokeWidth="1" opacity="0.6" />)}
      <path d="M1480 300 L1560 300 L1560 380 A 80 80 0 0 1 1480 300 Z" fill={C.field} />
      <path d="M1525 345 l18 -18 l18 18 l-18 18 Z" fill="#D9A877" />
      <g>
        {Array.from({ length: 4 }, (_, i) => (
          <g key={i}>
            <rect x={1395 + (i % 2) * 82} y={335 + Math.floor(i / 2) * 66} width="76" height="60" fill={C.court} stroke="#FFFFFF" strokeWidth="1.5" />
            <line x1={1395 + (i % 2) * 82} y1={365 + Math.floor(i / 2) * 66} x2={1471 + (i % 2) * 82} y2={365 + Math.floor(i / 2) * 66} stroke="#FFFFFF" strokeWidth="1.5" />
          </g>
        ))}
      </g>

      {/* parking */}
      <ParkingLot x={44} y={234} w={124} h={104} />
      <ParkingLot x={1452} y={524} w={110} h={124} />
      <ParkingLot x={64} y={822} w={174} h={96} />

      {/* the quad and the lower lawn */}
      <rect x="600" y="200" width="280" height="270" rx="12" fill={C.lawn} stroke={C.lawnEdge} strokeWidth="3" />
      <rect x="640" y="610" width="320" height="190" rx="12" fill={C.lawn} stroke={C.lawnEdge} strokeWidth="3" />
      <path d="M660 640 L940 780 M940 640 L660 780" stroke={C.path} strokeWidth="10" />

      {/* walkways */}
      {WALKS.map((points, i) => <Walk key={i} points={points} width={i === 0 ? 24 : 14} />)}
      <circle cx="740" cy="335" r="26" fill={C.path} stroke={C.pathEdge} strokeWidth="3" />
      <line x1="740" y1="335" x2="740" y2="296" stroke="#5B6170" strokeWidth="3" />
      <path d="M740 296 l22 6 l-22 6 Z" fill="#B23A3A" />

      {/* gate plaza and stone arch */}
      <rect x="730" y="905" width="140" height="58" rx="6" fill={C.path} stroke={C.pathEdge} strokeWidth="2" />
      <rect x="752" y="930" width="96" height="22" rx="3" fill={C.stone} stroke="#8F887B" />
      <path d="M770 952 a30 24 0 0 1 60 0 Z" fill={C.path} />
      <rect x="742" y="922" width="16" height="30" fill="#A79F91" />
      <rect x="842" y="922" width="16" height="30" fill="#A79F91" />

      {/* walking route to the selected building: along the promenade, then across */}
      {selected && (
        <path
          d={`M${GATE.x} ${GATE.y} L${GATE.x} ${selected.y} L${selected.x} ${selected.y}`}
          stroke={accent}
          strokeWidth="6"
          fill="none"
          strokeDasharray="14 10"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.9"
        />
      )}

      {/* buildings, then the tree canopy (trees never overlap footprints) */}
      {placed.map((b) => <Building key={b.id} b={b} selected={b.id === selectedId} accent={accent} />)}
      {trees.map((t, i) => (
        <g key={i}>
          <circle cx={t.x + 3} cy={t.y + 4} r={t.r} fill={C.shadow} />
          <circle cx={t.x} cy={t.y} r={t.r} fill={t.fill} />
          <circle cx={t.x - t.r * 0.3} cy={t.y - t.r * 0.3} r={t.r * 0.45} fill="#FFFFFF" opacity="0.14" />
        </g>
      ))}
    </svg>
  );
});

export default CampusIllustration;

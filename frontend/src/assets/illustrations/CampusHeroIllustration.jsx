import React from 'react';

/**
 * Dashboard banner art: a geometric campus building with soft landscaping and two
 * floating interface cards. Flat theme tints only, so it supports the greeting rather
 * than competing with the data below it.
 */
export const CampusHeroIllustration = ({ className = '', style }) => (
  <svg className={className} style={style} viewBox="0 0 520 260" fill="none" role="img" aria-label="Campus building illustration">
    <title>Campus building illustration</title>
    <defs>
      <linearGradient id="enx-campus-roof" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#7079EA" />
        <stop offset="1" stopColor="#7A4FD8" />
      </linearGradient>
    </defs>

    {/* Ground */}
    <ellipse cx="270" cy="236" rx="240" ry="22" fill="#E3E6FA" />
    <circle cx="430" cy="62" r="26" fill="#FFFFFF" opacity="0.9" />
    <circle cx="430" cy="62" r="14" fill="#F6E3BF" />

    {/* Building */}
    <rect x="156" y="104" width="228" height="128" rx="6" fill="#FFFFFF" />
    <path d="M140 108 270 46l130 62Z" fill="url(#enx-campus-roof)" />
    <rect x="148" y="104" width="244" height="10" rx="3" fill="#343EBF" opacity="0.9" />
    {[176, 214, 252, 290, 328].map((x) => (
      <rect key={x} x={x} y="126" width="20" height="82" rx="4" fill="#EEF0FD" />
    ))}
    <rect x="252" y="170" width="36" height="62" rx="6" fill="#4651DE" />
    <rect x="148" y="222" width="244" height="12" rx="3" fill="#C9CDF4" />
    <circle cx="270" cy="82" r="9" fill="#FFFFFF" opacity="0.85" />

    {/* Trees */}
    <rect x="98" y="176" width="6" height="52" rx="3" fill="#9097AE" />
    <circle cx="101" cy="168" r="26" fill="#BFE5D3" />
    <circle cx="86" cy="186" r="16" fill="#A6DCC4" />
    <rect x="430" y="186" width="6" height="44" rx="3" fill="#9097AE" />
    <circle cx="433" cy="178" r="22" fill="#D7CCF5" />
    <circle cx="450" cy="194" r="13" fill="#C6B6F0" />

    {/* Floating cards */}
    <g>
      <rect x="18" y="58" width="112" height="56" rx="12" fill="#FFFFFF" />
      <rect x="30" y="72" width="22" height="22" rx="7" fill="#E8F6EF" />
      <path d="M36 83.5l3.5 3.5 6.5-7" stroke="#13845A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="60" y="74" width="56" height="7" rx="3.5" fill="#121833" />
      <rect x="60" y="88" width="38" height="6" rx="3" fill="#BEC3D3" />
    </g>
    <g>
      <rect x="392" y="112" width="112" height="50" rx="12" fill="#FFFFFF" />
      <rect x="404" y="126" width="54" height="7" rx="3.5" fill="#121833" />
      <rect x="404" y="140" width="84" height="6" rx="3" fill="#ECEEF4" />
      <rect x="404" y="140" width="56" height="6" rx="3" fill="#4651DE" />
    </g>
  </svg>
);

export default CampusHeroIllustration;

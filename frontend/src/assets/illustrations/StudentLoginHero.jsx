import React from 'react';

/**
 * Login hero: an abstract composition of the portal itself — a schedule card, a GPA
 * ring and a calendar tile — floating on soft geometry. Flat shapes in the theme
 * palette; no outlines or characters.
 */
export const StudentLoginHero = ({ className = '', ...props }) => (
  <svg viewBox="0 0 560 440" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} role="img" aria-label="Preview of the EdunexusAI student portal" {...props}>
    <title>Preview of the EdunexusAI student portal</title>
    <defs>
      <linearGradient id="enx-hero-mark" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor="#1C7ED6" />
        <stop offset="1" stopColor="#7A4FD8" />
      </linearGradient>
    </defs>

    {/* Soft geometry */}
    <circle cx="300" cy="220" r="190" fill="#FFFFFF" opacity="0.55" />
    <circle cx="300" cy="220" r="132" fill="#FFFFFF" opacity="0.6" />
    <rect x="62" y="70" width="64" height="64" rx="18" fill="#FFFFFF" opacity="0.7" />
    <circle cx="486" cy="96" r="10" fill="#A283E8" opacity="0.5" />
    <circle cx="86" cy="330" r="7" fill="#4651DE" opacity="0.35" />
    <rect x="470" y="330" width="16" height="16" rx="5" transform="rotate(18 470 330)" fill="#E09B33" opacity="0.45" />

    {/* Main schedule card */}
    <g>
      <rect x="128" y="104" width="300" height="214" rx="20" fill="#FFFFFF" />
      <rect x="128" y="104" width="300" height="214" rx="20" stroke="#E5E7EF" />
      <rect x="152" y="128" width="30" height="30" rx="9" fill="#EEF0FD" />
      <rect x="161" y="137" width="12" height="12" rx="3" fill="#4651DE" />
      <rect x="194" y="131" width="110" height="9" rx="4.5" fill="#121833" />
      <rect x="194" y="147" width="70" height="7" rx="3.5" fill="#BEC3D3" />

      <rect x="152" y="178" width="252" height="38" rx="11" fill="#F6F7FB" />
      <rect x="152" y="178" width="4" height="38" rx="2" fill="#4651DE" />
      <rect x="168" y="188" width="54" height="7" rx="3.5" fill="#4651DE" opacity="0.8" />
      <rect x="168" y="201" width="120" height="6" rx="3" fill="#BEC3D3" />
      <rect x="350" y="191" width="40" height="12" rx="6" fill="#E8F6EF" />

      <rect x="152" y="224" width="252" height="38" rx="11" fill="#F6F7FB" />
      <rect x="152" y="224" width="4" height="38" rx="2" fill="#7A4FD8" />
      <rect x="168" y="234" width="54" height="7" rx="3.5" fill="#7A4FD8" opacity="0.8" />
      <rect x="168" y="247" width="96" height="6" rx="3" fill="#BEC3D3" />
      <rect x="350" y="237" width="40" height="12" rx="6" fill="#FDF4E5" />

      <rect x="152" y="276" width="160" height="8" rx="4" fill="#ECEEF4" />
      <rect x="152" y="276" width="108" height="8" rx="4" fill="url(#enx-hero-mark)" />
    </g>

    {/* GPA ring card */}
    <g>
      <rect x="370" y="58" width="134" height="134" rx="20" fill="#FFFFFF" />
      <rect x="370" y="58" width="134" height="134" rx="20" stroke="#E5E7EF" />
      <circle cx="437" cy="118" r="34" stroke="#ECEEF4" strokeWidth="9" />
      <path d="M437 84a34 34 0 1 1-32.3 44.6" stroke="url(#enx-hero-mark)" strokeWidth="9" strokeLinecap="round" />
      <rect x="421" y="112" width="32" height="10" rx="5" fill="#121833" />
      <rect x="405" y="166" width="64" height="7" rx="3.5" fill="#BEC3D3" />
    </g>

    {/* Calendar tile */}
    <g>
      <rect x="84" y="262" width="150" height="112" rx="18" fill="#FFFFFF" />
      <rect x="84" y="262" width="150" height="112" rx="18" stroke="#E5E7EF" />
      <rect x="104" y="282" width="56" height="8" rx="4" fill="#121833" />
      {[0, 1, 2, 3, 4].map((col) =>
        [0, 1, 2].map((row) => (
          <rect
            key={`${col}-${row}`}
            x={104 + col * 22}
            y={302 + row * 20}
            width="14"
            height="12"
            rx="4"
            fill={col === 2 && row === 1 ? '#4651DE' : col === 4 && row === 0 ? '#A283E8' : '#ECEEF4'}
          />
        )),
      )}
    </g>

    {/* Notification chip */}
    <g>
      <rect x="300" y="336" width="176" height="48" rx="14" fill="#121833" />
      <circle cx="324" cy="360" r="10" fill="#13845A" />
      <path d="M319.5 360.5l3 3 6-6.5" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="342" y="351" width="96" height="7" rx="3.5" fill="#FFFFFF" />
      <rect x="342" y="364" width="64" height="6" rx="3" fill="#6B7391" />
    </g>
  </svg>
);

export default StudentLoginHero;

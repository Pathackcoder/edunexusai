import React from 'react';

/** Help-desk hero art: a search field over stacked answer cards. Flat theme tints. */
export const HelpDeskIllustration = ({ className = '', style }) => (
  <svg className={className} style={style} viewBox="0 0 240 160" fill="none" aria-hidden="true">
    <circle cx="150" cy="84" r="70" fill="#EEF0FD" />
    <rect x="70" y="46" width="132" height="34" rx="10" fill="#FFFFFF" />
    <rect x="70" y="46" width="132" height="34" rx="10" stroke="#DDE0EA" />
    <circle cx="88" cy="63" r="7" stroke="#4651DE" strokeWidth="2.5" />
    <path d="M93 68l5 5" stroke="#4651DE" strokeWidth="2.5" strokeLinecap="round" />
    <rect x="104" y="59" width="70" height="8" rx="4" fill="#DDE0EA" />
    <rect x="58" y="92" width="120" height="26" rx="8" fill="#FFFFFF" />
    <rect x="70" y="101" width="9" height="9" rx="2.5" fill="#A283E8" />
    <rect x="86" y="102" width="74" height="7" rx="3.5" fill="#ECEEF4" />
    <rect x="72" y="124" width="120" height="26" rx="8" fill="#FFFFFF" />
    <rect x="84" y="133" width="9" height="9" rx="2.5" fill="#4CB389" />
    <rect x="100" y="134" width="60" height="7" rx="3.5" fill="#ECEEF4" />
    <circle cx="206" cy="36" r="16" fill="#4651DE" />
    <path d="M201.5 32.5a4.5 4.5 0 1 1 6.3 4.1c-1.1.5-1.8 1.4-1.8 2.6v.8" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" />
    <circle cx="206" cy="44.6" r="1.5" fill="#FFFFFF" />
    <circle cx="44" cy="70" r="5" fill="#E09B33" opacity="0.5" />
    <circle cx="224" cy="110" r="3.5" fill="#A283E8" opacity="0.6" />
  </svg>
);

export default HelpDeskIllustration;

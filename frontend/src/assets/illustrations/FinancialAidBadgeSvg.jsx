import React from 'react';

/** Award certificate mark (financial aid). Flat theme tints, matching the other art. */
export const FinancialAidBadgeSvg = ({ className = '', width = 96, height = 96, ...props }) => (
  <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} width={width} height={height} aria-hidden="true" {...props}>
    <circle cx="60" cy="60" r="52" fill="#F3EEFC" />
    <rect x="30" y="34" width="56" height="48" rx="7" fill="#FFFFFF" />
    <rect x="30" y="34" width="56" height="48" rx="7" stroke="#DDE0EA" strokeWidth="1.5" />
    <rect x="38" y="44" width="28" height="5" rx="2.5" fill="#7A4FD8" />
    <rect x="38" y="55" width="38" height="4" rx="2" fill="#DDE0EA" />
    <rect x="38" y="64" width="26" height="4" rx="2" fill="#DDE0EA" />
    <circle cx="80" cy="80" r="13" fill="#E09B33" />
    <circle cx="80" cy="80" r="8" fill="#F6E3BF" />
    <path d="M76.5 80l2.5 2.5 4.5-5" stroke="#8A5200" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default FinancialAidBadgeSvg;

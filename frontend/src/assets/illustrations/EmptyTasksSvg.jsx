import React from 'react';

/**
 * Neutral empty-state illustration: a document card with a check badge on a soft halo.
 * Flat shapes in the theme palette, no outlines, so it sits quietly beside product data.
 */
export const EmptyTasksSvg = ({ className = '', width = 112, height = 112, ...props }) => (
  <svg
    viewBox="0 0 140 140"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    width={width}
    height={height}
    aria-hidden="true"
    {...props}
  >
    <circle cx="70" cy="70" r="58" fill="#EEF0FD" />
    <circle cx="70" cy="70" r="44" fill="#F6F7FE" />
    <rect x="40" y="34" width="54" height="70" rx="9" fill="#FFFFFF" />
    <rect x="40" y="34" width="54" height="70" rx="9" stroke="#DDE0EA" strokeWidth="1.5" />
    <rect x="49" y="46" width="22" height="5" rx="2.5" fill="#4651DE" opacity="0.85" />
    <rect x="49" y="59" width="36" height="4" rx="2" fill="#DDE0EA" />
    <rect x="49" y="69" width="30" height="4" rx="2" fill="#DDE0EA" />
    <rect x="49" y="79" width="33" height="4" rx="2" fill="#DDE0EA" />
    <rect x="49" y="89" width="20" height="4" rx="2" fill="#DDE0EA" />
    <circle cx="94" cy="96" r="15" fill="#13845A" />
    <path d="M87.5 96.5l4.5 4.5 8.5-9" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="33" cy="48" r="3.5" fill="#A283E8" opacity="0.7" />
    <circle cx="108" cy="40" r="2.5" fill="#4651DE" opacity="0.5" />
    <rect x="26" y="90" width="7" height="7" rx="2" transform="rotate(20 26 90)" fill="#E09B33" opacity="0.55" />
  </svg>
);

export default EmptyTasksSvg;

import React from 'react';

/** Payment confirmation mark: a check seal on concentric success-tinted rings. */
export const PaymentSuccessSvg = ({ className = '', width = 112, height = 112, ...props }) => (
  <svg viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} width={width} height={height} aria-hidden="true" {...props}>
    <circle cx="80" cy="80" r="72" fill="#E8F6EF" />
    <circle cx="80" cy="80" r="54" fill="#D1EEDF" />
    <circle cx="80" cy="80" r="38" fill="#13845A" />
    <path d="M64 81l11 11 22-24" stroke="#FFFFFF" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="28" cy="40" r="4" fill="#4CB389" />
    <circle cx="134" cy="52" r="3" fill="#4651DE" opacity="0.6" />
    <rect x="124" y="114" width="9" height="9" rx="2.5" transform="rotate(24 124 114)" fill="#E09B33" opacity="0.7" />
    <rect x="22" y="112" width="7" height="7" rx="2" transform="rotate(-18 22 112)" fill="#A283E8" opacity="0.7" />
  </svg>
);

export default PaymentSuccessSvg;

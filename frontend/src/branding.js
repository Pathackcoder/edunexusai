/**
 * Brand hierarchy for the portal.
 *
 *   Institution (tenant):  Feddrick University — the primary identity users see.
 *   Platform:              EduNexusAI — the technology, shown only as attribution
 *                          ("Powered by EduNexusAI") and on platform features such as the
 *                          AI assistant.
 *
 * Logo assets live in /public next to the platform logo. Components read them from here
 * rather than hard-coding paths or drawing their own versions.
 */
export const institution = {
  name: 'Feddrick University',
  shortName: 'Feddrick',
  portalName: 'Feddrick University Portal',
  logo: '/feddrick-university-logo.svg',
  logoInverse: '/feddrick-university-logo-inverse.svg',
  mark: '/feddrick-university-mark.svg',
  // Lockup aspect ratio (viewBox 252 × 72), for sizing without layout shift.
  logoAspect: 252 / 72,
  markAspect: 64 / 72,
};

export const platform = {
  name: 'EduNexusAI',
  logo: '/logo.png',
  attribution: 'Powered by EduNexusAI',
};

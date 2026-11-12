/**
 * The Analytics sections: one route each, listed under Administration → Analytics in the sidebar (layouts/navigation.js)
 * and labelled in the breadcrumb trail. Plain data, no React, so navigation and tests can import it.
 * `filters`: which of the page's filters apply to the section; `dates: false` means the section has no date range.
 */
export const ANALYTICS_BASE = '/admin/analytics';

export const ANALYTICS_SECTIONS = [
  { id: 'overview', label: 'Overview', path: ANALYTICS_BASE, role: true, device: true,
    description: 'Who uses the portal, how much, and what stands out in the period.' },
  { id: 'people', label: 'People & activity', path: `${ANALYTICS_BASE}/people`, role: true, device: true,
    description: 'Active people over time, by role, by workspace, and by hour of the week.' },
  { id: 'pages', label: 'Pages & navigation', path: `${ANALYTICS_BASE}/pages`, role: true, device: true,
    description: 'Which pages are opened, for how long, and how people move around the portal.' },
  { id: 'features', label: 'Features & widgets', path: `${ANALYTICS_BASE}/features`, role: true, device: true,
    description: 'Which features are opened and actually used, and how dashboard widgets are used.' },
  { id: 'devices', label: 'Devices & visits', path: `${ANALYTICS_BASE}/devices`, role: true, device: false,
    description: 'Phones, tablets and computers, and how long visits last.' },
  { id: 'communication', label: 'Communication', path: `${ANALYTICS_BASE}/communication`, role: true, device: false,
    description: 'In-app notifications and broadcasts, and how many are read.' },
  { id: 'integrations', label: 'Integrations', path: `${ANALYTICS_BASE}/integrations`, role: false, device: false,
    description: 'What the connected services recorded: synchronisations, failures and university sign-in.' },
  { id: 'health', label: 'Data health', path: `${ANALYTICS_BASE}/health`, role: false, device: false, dates: false,
    description: 'Whether collection is on, how fresh the figures are, and who can open Analytics.' },
];

/** Ids used by earlier links (?tab=activity, ?tab=engagement) and by in-page shortcuts. */
const ALIASES = { activity: 'people', engagement: 'features' };

export const analyticsSection = (id) => ANALYTICS_SECTIONS.find((section) => section.id === (ALIASES[id] ?? id)) ?? null;

/**
 * Role contexts in the portal (multi-role). One account may hold several community roles, each
 * an ACTIVE context with its own record, widgets and dashboard (from GET /auth/me `contexts`),
 * plus administrative workspaces. Pure functions: no React, no network.
 *
 * Rules:
 * - Only ACTIVE contexts get views, navigation and widgets. A role without its verified record
 *   (UNLINKED) is reported, never rendered as data.
 * - A widget is offered by the context it belongs to (`canIn`), never by the union of all roles.
 * - Single-role accounts get exactly one view and no context switcher, as before.
 * - An older session payload without `contexts` falls back to the single legacy persona.
 */

export const VIEW_LABELS = {
  overview: 'Overview',
  student: 'Studying',
  faculty: 'Teaching',
  staff: 'Working',
  alumni: 'Alumni',
  admin: 'Administration',
};

const legacyContexts = (user) => {
  if (!user) return [];
  const roles = user.roles ?? [];
  if (roles.includes('ADMIN')) return [];
  if (roles.includes('FACULTY')) return [{ key: 'faculty', role: 'FACULTY', status: 'ACTIVE', entitlements: user.entitlements ?? [] }];
  if (roles.includes('STUDENT')) return [{ key: 'student', role: 'STUDENT', status: 'ACTIVE', entitlements: user.entitlements ?? [] }];
  return [];
};

export const contextsOf = (user) => (Array.isArray(user?.contexts) ? user.contexts : legacyContexts(user));
export const activeContextsOf = (user) => contextsOf(user).filter((context) => context.status === 'ACTIVE');
export const unlinkedContextsOf = (user) => contextsOf(user).filter((context) => context.status === 'UNLINKED');
export const workspacesOf = (user) => (Array.isArray(user?.workspaces) ? user.workspaces : (user?.roles ?? []).includes('ADMIN') ? ['admin'] : []);
export const hasActiveContext = (user, key) => activeContextsOf(user).some((context) => context.key === key);

/** True when the person has more than one place to work from (contexts + workspaces). */
export const isMultiRole = (user) => activeContextsOf(user).length + workspacesOf(user).length > 1;

/** Is `widgetKey` offered in context `contextKey`? Only that context's own entitlements count. */
export const canIn = (user, contextKey, widgetKey) =>
  Boolean(activeContextsOf(user).find((context) => context.key === contextKey)?.entitlements?.includes(widgetKey));

/** Dashboard views: Overview first for multi-role accounts, then each context, then workspaces. */
export function dashboardViews(user) {
  const contexts = activeContextsOf(user).map((context) => ({ key: context.key, label: VIEW_LABELS[context.key] ?? context.key, kind: 'context' }));
  const workspaces = workspacesOf(user).map((key) => ({ key, label: VIEW_LABELS[key] ?? key, kind: 'workspace' }));
  const views = [...contexts, ...workspaces];
  return views.length > 1 ? [{ key: 'overview', label: VIEW_LABELS.overview, kind: 'overview' }, ...views] : views;
}

/**
 * Which view to show: the requested one if the account has it, else the remembered one, else the
 * default (Overview for multi-role accounts, the only view otherwise). Never a view the account
 * does not have, so a hand-edited URL or a stale stored value cannot open another role's view.
 */
export function resolveView(user, { requested, remembered } = {}) {
  const keys = dashboardViews(user).map((view) => view.key);
  if (requested && keys.includes(requested)) return requested;
  if (remembered && keys.includes(remembered)) return remembered;
  return keys[0] ?? null;
}

export const viewStorageKey = (userId) => `edunexus.dashboard.view.${userId}`;

/**
 * View-As tab hand-off. Pure (window objects are passed in), so it is unit-tested without a browser.
 *
 * The administrator's tab opens the View-As tab synchronously from the click (so pop-up blockers allow it), creates
 * the session through the API, then hands the new tab the session secret by postMessage, never in a URL, a fragment
 * or browser history. Both sides accept messages only from their own origin and only from the exact window at the
 * other end (the tab that was opened / the tab that opened it). The new tab keeps announcing that it is ready until
 * it receives the secret, so it does not matter which side finishes loading first.
 */

export const VIEW_AS_START_PATH = '/view-as/start';
export const MESSAGE = { READY: 'enx:view-as:ready', TOKEN: 'enx:view-as:token', ACK: 'enx:view-as:ack' };
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

export const isSessionSecret = (value) => typeof value === 'string' && TOKEN_SHAPE.test(value);

/** Administrator's tab: deliver `token` to `tab`. Resolves once the tab confirms it has it. */
export function deliverToTab({ tab, token, origin, win, timeoutMs = 20_000 }) {
  return new Promise((resolve, reject) => {
    let timer = null;
    const cleanup = () => {
      clearTimeout(timer);
      win.removeEventListener('message', onMessage);
    };
    const send = () => {
      try {
        tab.postMessage({ type: MESSAGE.TOKEN, token }, origin);
      } catch {
        /* the tab is still navigating; it announces itself again */
      }
    };
    function onMessage(event) {
      if (event.origin !== origin || event.source !== tab) return;
      if (event.data?.type === MESSAGE.READY) send();
      else if (event.data?.type === MESSAGE.ACK) {
        cleanup();
        resolve();
      }
    }
    timer = setTimeout(() => {
      cleanup();
      reject(new Error('The new tab did not open the View-As session in time. Close it and try again.'));
    }, timeoutMs);
    win.addEventListener('message', onMessage);
    send();
  });
}

/** View-As tab: announce readiness to `opener` and call `onToken` once with the secret it sends. Returns a stop function. */
export function receiveFromOpener({ opener, origin, win, onToken, intervalMs = 400 }) {
  const announce = () => {
    try {
      opener.postMessage({ type: MESSAGE.READY }, origin);
    } catch {
      /* the opener went away; the timeout on its side reports it */
    }
  };
  function onMessage(event) {
    if (event.origin !== origin || event.source !== opener) return;
    if (event.data?.type !== MESSAGE.TOKEN || !isSessionSecret(event.data.token)) return;
    stop();
    opener.postMessage({ type: MESSAGE.ACK }, origin);
    onToken(event.data.token);
  }
  const timer = setInterval(announce, intervalMs);
  function stop() {
    clearInterval(timer);
    win.removeEventListener('message', onMessage);
  }
  win.addEventListener('message', onMessage);
  announce();
  return stop;
}

/** The persona label and reason text the dialog sends (kept here so the wording is tested once). */
export const VIEW_AS_REASONS = [
  { key: 'TROUBLESHOOTING', label: 'Troubleshooting a reported issue' },
  { key: 'VERIFY', label: 'Verifying what this person can see' },
  { key: 'SUPPORT', label: 'Following up a support request' },
  { key: 'OTHER', label: 'Other' },
];

export function composeReason(key, details = '') {
  const label = VIEW_AS_REASONS.find((reason) => reason.key === key)?.label ?? '';
  const note = details.trim();
  if (key === 'OTHER') return note;
  return note ? `${label}: ${note}` : label;
}

/**
 * Which personas a Users-table row could be viewed as, from the row alone (the server decides; this only decides
 * whether to offer the action and why it is unavailable).
 */
export function viewAsOffer(row, { viewerId, canViewAs }) {
  const roles = row.roles ?? [];
  const details = row.roleDetails ?? roles.map((key) => ({ key, status: 'ACTIVE' }));
  // As on the server: a persona has a portal once its record exists (UNLINKED = no record; a missing SIS link is not that).
  const personas = details.filter((role) => (role.key === 'STUDENT' || role.key === 'FACULTY') && role.status !== 'UNLINKED').map((role) => role.key);
  const holdsPortalRole = roles.includes('STUDENT') || roles.includes('FACULTY');
  if (!holdsPortalRole || roles.includes('ADMIN') || row.id === viewerId) return { show: false };
  if (!canViewAs) return { show: true, enabled: false, reason: 'Requires the View-As permission (users.view_as).' };
  if (row.status !== 'ACTIVE') return { show: true, enabled: false, reason: `This account is ${String(row.status).toLowerCase()}. Only active accounts can be viewed.` };
  if (!personas.length) return { show: true, enabled: false, reason: 'No linked student or faculty record to view.' };
  return { show: true, enabled: true, personas };
}

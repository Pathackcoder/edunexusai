/**
 * External calendar providers. The prototype simulates the OAuth handshake and the
 * push of portal events; no tokens are requested or stored. A live implementation
 * replaces `connect` with the provider's OAuth flow and `pushEvents` with its API.
 */
export const CALENDAR_PROVIDERS = {
  GOOGLE: { key: 'GOOGLE', label: 'Google Calendar', domain: 'gmail.com' },
  OUTLOOK: { key: 'OUTLOOK', label: 'Outlook Calendar', domain: 'outlook.com' },
};

export const calendarProviderAdapter = {
  async connect(provider, { email }) {
    const def = CALENDAR_PROVIDERS[provider];
    return { accountEmail: email ?? `student@${def.domain}`, mode: 'SIMULATED' };
  },
  async pushEvents(_provider, events) {
    return { pushed: events.length, mode: 'SIMULATED' };
  },
};

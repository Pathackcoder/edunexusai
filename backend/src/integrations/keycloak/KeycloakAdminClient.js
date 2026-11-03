// Read-only client for the Keycloak Admin REST API of ONE realm, authenticated as a dedicated
// service-account client (OAuth 2.0 client credentials). Used by the Campus Directory.
//  - Caches the access token and fetches a new one shortly before it expires (concurrent refreshes
//    are coalesced into one token request). Keycloak issues no refresh token for this grant.
//  - On 401 (expired, revoked, secret rotated) it fetches a new token once and retries.
//  - GET requests are retried once on network failures, timeouts and 502/503/504.
//  - Errors carry a code, never Keycloak's response body, the token or the secret.
//  - Only GET is exposed: the client cannot change anything in Keycloak.

export class KeycloakDirectoryError extends Error {
  constructor(message, { code, status = 0 } = {}) {
    super(message);
    this.name = 'KeycloakDirectoryError';
    this.code = code; // unreachable | timeout | credentials_rejected | forbidden | not_found | upstream_error | malformed_response
    this.status = status;
  }
}

const RETRY_STATUS = new Set([502, 503, 504]);
const USER_ID = /^[\w-]{1,64}$/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class KeycloakAdminClient {
  #clientSecret;
  #token = null; // { value, expiresAt }
  #inflightToken = null;

  constructor({ baseUrl, realm, clientId, clientSecret, timeoutMs = 8000, fetchImpl = globalThis.fetch, logger = null } = {}) {
    if (!baseUrl || !realm || !clientId || !clientSecret) throw new Error('KeycloakAdminClient requires baseUrl, realm, clientId and clientSecret (server-side configuration).');
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.realm = realm;
    this.clientId = clientId;
    this.#clientSecret = clientSecret; // private: never serialised or logged
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl;
    this.logger = logger;
    this.stats = { tokenRequests: 0, requests: 0 };
  }

  toJSON() { return { baseUrl: this.baseUrl, realm: this.realm, clientId: this.clientId, stats: this.stats }; }

  async #raw(url, init) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      return await this.fetch(url, { ...init, signal: ctrl.signal });
    } catch (error) {
      const timedOut = error?.name === 'AbortError';
      throw new KeycloakDirectoryError(timedOut ? 'The identity provider did not answer in time.' : 'The identity provider could not be reached.', { code: timedOut ? 'timeout' : 'unreachable' });
    } finally {
      clearTimeout(timer);
    }
  }

  async getToken({ force = false } = {}) {
    if (!force && this.#token && Date.now() < this.#token.expiresAt - 30_000) return this.#token.value;
    this.#inflightToken ??= (async () => {
      this.stats.tokenRequests += 1;
      const basic = Buffer.from(`${encodeURIComponent(this.clientId)}:${encodeURIComponent(this.#clientSecret)}`).toString('base64');
      const res = await this.#raw(`${this.baseUrl}/realms/${encodeURIComponent(this.realm)}/protocol/openid-connect/token`, {
        method: 'POST',
        headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ grant_type: 'client_credentials' }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        // 400/401 invalid_client, unauthorized_client: wrong secret, or client credentials not enabled.
        if ([400, 401].includes(res.status)) throw new KeycloakDirectoryError(`The identity provider rejected the directory client (${typeof json?.error === 'string' ? json.error.slice(0, 40) : res.status}).`, { code: 'credentials_rejected', status: res.status });
        throw new KeycloakDirectoryError(`Token request failed (${res.status}).`, { code: RETRY_STATUS.has(res.status) ? 'unreachable' : 'upstream_error', status: res.status });
      }
      if (typeof json?.access_token !== 'string' || !json.access_token || !(Number(json.expires_in) > 0)) throw new KeycloakDirectoryError('The identity provider sent an unusable token response.', { code: 'malformed_response' });
      this.#token = { value: json.access_token, expiresAt: Date.now() + Number(json.expires_in) * 1000 };
      this.logger?.info?.('[keycloak-directory] service token issued', { realm: this.realm, expiresIn: Number(json.expires_in) });
      return this.#token.value;
    })().finally(() => { this.#inflightToken = null; });
    return this.#inflightToken;
  }

  /** GET /admin/realms/{realm}{path}. Returns parsed JSON. */
  async get(path, query = {}) {
    const url = new URL(`${this.baseUrl}/admin/realms/${encodeURIComponent(this.realm)}${path}`);
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    let refreshed = false;
    for (let attempt = 0; ; attempt += 1) {
      const token = await this.getToken();
      this.stats.requests += 1;
      let res;
      try {
        res = await this.#raw(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      } catch (error) {
        if (attempt === 0) { await sleep(150); continue; }
        throw error;
      }
      if (res.status === 401 && !refreshed) {
        refreshed = true;
        this.#token = null;
        continue;
      }
      if (RETRY_STATUS.has(res.status) && attempt === 0) { await sleep(150); continue; }
      if (!res.ok) {
        await res.body?.cancel?.().catch(() => {});
        if (res.status === 401) throw new KeycloakDirectoryError('The identity provider did not accept the directory token.', { code: 'credentials_rejected', status: 401 });
        if (res.status === 403) throw new KeycloakDirectoryError('The directory service account lacks read permission.', { code: 'forbidden', status: 403 });
        if (res.status === 404) throw new KeycloakDirectoryError('The realm or user was not found.', { code: 'not_found', status: 404 });
        throw new KeycloakDirectoryError(`The identity provider answered ${res.status}.`, { code: RETRY_STATUS.has(res.status) ? 'unreachable' : 'upstream_error', status: res.status });
      }
      try {
        return await res.json();
      } catch {
        throw new KeycloakDirectoryError('The identity provider sent a response that is not JSON.', { code: 'malformed_response' });
      }
    }
  }

  /** One bounded page of users (brief representation: no attributes, no credentials). */
  async listUsers({ search, enabled = true, first = 0, max = 20 } = {}) {
    const rows = await this.get('/users', { search, enabled, first, max: Math.min(Math.max(max, 1), 100), briefRepresentation: true });
    if (!Array.isArray(rows)) throw new KeycloakDirectoryError('The user list is not a list.', { code: 'malformed_response' });
    return rows;
  }

  async countUsers({ search, enabled = true } = {}) {
    const count = await this.get('/users/count', { search, enabled });
    if (!Number.isInteger(count) || count < 0) throw new KeycloakDirectoryError('The user count is not a number.', { code: 'malformed_response' });
    return count;
  }

  /** Effective realm role names of one user (direct, composite and through groups). */
  async effectiveRealmRoles(userId) {
    if (!USER_ID.test(String(userId))) throw new KeycloakDirectoryError('Invalid user id.', { code: 'malformed_response' });
    const roles = await this.get(`/users/${encodeURIComponent(userId)}/role-mappings/realm/composite`, { briefRepresentation: true });
    if (!Array.isArray(roles)) throw new KeycloakDirectoryError('The role list is not a list.', { code: 'malformed_response' });
    return roles.map((r) => r?.name).filter((name) => typeof name === 'string');
  }

  /**
   * The realm's service-account users (one per client with service accounts enabled): Keycloak lists them
   * among people when filtering on `enabled`, and counts them, but marks them only through the clients API
   * (view-clients, which this client deliberately lacks). They carry Keycloak's reserved username prefix
   * and no email or name; an account with that prefix but an email or a name is treated as a person.
   */
  async serviceAccounts() {
    const rows = await this.get('/users', { username: 'service-account-', max: 100, briefRepresentation: true });
    if (!Array.isArray(rows)) throw new KeycloakDirectoryError('The user list is not a list.', { code: 'malformed_response' });
    return rows
      .filter((u) => typeof u?.username === 'string' && u.username.startsWith('service-account-') && !u.email && !u.firstName && !u.lastName)
      .map((u) => ({ id: String(u.id), username: u.username }));
  }
}

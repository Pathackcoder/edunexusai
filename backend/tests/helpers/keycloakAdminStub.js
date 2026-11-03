import http from 'node:http';
import { randomUUID } from 'node:crypto';

/**
 * In-process stand-in for the parts of a Keycloak realm the Campus Directory reads: the token endpoint
 * (client credentials, HTTP Basic) and the Admin REST API's users, users/count and effective realm
 * role mappings, with Keycloak 26's quirks (a service-account user is listed when filtering on `enabled`
 * and counted without a search). The suite never contacts a real Keycloak.
 */
export async function startKeycloakAdminStub({ realm, clientId, clientSecret }) {
  const S = {
    users: [],
    tokens: new Set(),
    tokenRequests: 0,
    requests: [],
    expiresIn: 300,
    fail: null, // { status, times, path? (prefix or RegExp), body? } for admin requests
    delayMs: 0,
    revokeAll() { this.tokens.clear(); },
  };
  const addUser = (u) => {
    const user = { id: randomUUID(), enabled: true, roles: [], ...u };
    S.users.push(user);
    return user;
  };
  S.addUser = addUser;

  const send = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };
  const brief = (u) => ({ id: u.id, username: u.username, firstName: u.firstName, lastName: u.lastName, email: u.email, emailVerified: true, enabled: u.enabled, createdTimestamp: 1, access: { manage: true } });
  const full = (u) => ({ ...brief(u), attributes: u.attributes ?? {}, requiredActions: [], notBefore: 0 });
  const matches = (u, q) => {
    if (!q.search) return true;
    if (u.serviceAccount) return false; // Keycloak leaves service accounts out of searches
    const term = q.search.replaceAll('*', '').toLowerCase();
    return [u.username, u.firstName, u.lastName, u.email].some((v) => String(v ?? '').toLowerCase().includes(term));
  };
  const select = (q) => S.users.filter((u) => {
    if (u.serviceAccount && q.enabled === undefined && !q.username) return false;
    if (q.enabled === 'true' && !u.enabled) return false;
    if (q.username && !u.username.startsWith(q.username)) return false;
    return matches(u, q);
  });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://stub');
    const body = await new Promise((done) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => done(b)); });
    if (S.delayMs) await new Promise((r) => setTimeout(r, S.delayMs));

    if (req.method === 'POST' && url.pathname === `/realms/${realm}/protocol/openid-connect/token`) {
      S.tokenRequests += 1;
      const [id, secret] = Buffer.from(String(req.headers.authorization ?? '').replace(/^Basic /, ''), 'base64').toString().split(':').map(decodeURIComponent);
      if (new URLSearchParams(body).get('grant_type') !== 'client_credentials') return send(res, 400, { error: 'unsupported_grant_type' });
      if (id !== clientId || secret !== clientSecret) return send(res, 401, { error: 'invalid_client', error_description: 'Invalid client or Invalid client credentials' });
      const token = `stub-token-${randomUUID()}`;
      S.tokens.add(token);
      return send(res, 200, { access_token: token, expires_in: S.expiresIn, token_type: 'Bearer', scope: 'profile email' });
    }

    const prefix = `/admin/realms/${realm}`;
    if (!url.pathname.startsWith(prefix)) return send(res, 404, { error: 'Realm not found.' });
    const path = url.pathname.slice(prefix.length);
    const q = Object.fromEntries(url.searchParams);
    S.requests.push({ path, query: q, authorization: req.headers.authorization });
    const bearer = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
    if (!S.tokens.has(bearer)) return send(res, 401, { error: 'HTTP 401 Unauthorized' });
    if (S.fail && S.fail.times > 0 && (!S.fail.path || (S.fail.path instanceof RegExp ? S.fail.path.test(path) : path.startsWith(S.fail.path)))) {
      S.fail.times -= 1;
      return send(res, S.fail.status, S.fail.body ?? { error: `HTTP ${S.fail.status}`, internal: 'stub-internal-detail' });
    }

    if (path === '/users') {
      const rows = select(q);
      const first = Number(q.first ?? 0);
      const max = Number(q.max ?? 100);
      return send(res, 200, rows.slice(first, first + max).map(q.briefRepresentation === 'false' ? full : brief));
    }
    if (path === '/users/count') {
      // Keycloak counts service accounts unless a search narrows the result.
      return send(res, 200, S.users.filter((u) => (q.enabled !== 'true' || u.enabled) && (u.serviceAccount ? !q.search : matches(u, q))).length);
    }
    const roles = path.match(/^\/users\/([\w-]+)\/role-mappings\/realm\/composite$/);
    if (roles) {
      const user = S.users.find((u) => u.id === roles[1]);
      if (!user) return send(res, 404, { error: 'User not found' });
      return send(res, 200, [...user.roles, 'offline_access', `default-roles-${realm}`].map((name) => ({ id: randomUUID(), name, composite: false })));
    }
    return send(res, 404, { error: 'Not found' });
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  return {
    state: S,
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((done) => { server.closeAllConnections?.(); server.close(done); }),
  };
}

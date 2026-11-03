import http from 'node:http';
import { randomUUID } from 'node:crypto';

/**
 * In-process stand-in for the Feddrick CMS integration API (feddrick-cms
 * src/api/edunexus), so the automated suite never calls the real Strapi. It follows the
 * same contract: bearer token, tenant on every call, draft/published versions per document,
 * state draft|published|modified, 404 for another tenant's documents, { data } / { error }
 * envelopes, tenant-tagged media and an audit log. `requests` records every call so tests
 * can check which tenant the backend sent. `down = true` makes it refuse connections.
 */

const AUDIENCE_FIELD = { students: 'audienceStudents', faculty: 'audienceFaculty', staff: 'audienceStaff', alumni: 'audienceAlumni', public: 'audiencePublic' };
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a0ff0000000049454e44ae426082', 'hex');

export async function startCmsStub({ token, manageToken = token }) {
  const docs = new Map(); // documentId -> { type, tenant, draft, published }
  const audit = [];
  const media = [];
  const requests = [];
  let clock = Date.parse('2026-01-01T00:00:00Z');
  const now = () => new Date((clock += 1000)).toISOString();

  const stateOf = (d) => (!d.published ? 'draft' : d.draft && d.draft.updatedAt > d.published.updatedAt ? 'modified' : 'published');
  const present = (d) => ({ ...(d.draft ?? d.published), state: stateOf(d) === 'draft' && d.schedule?.publish ? 'scheduled' : stateOf(d), schedule: d.schedule ?? { publish: null, unpublish: null }, publishedVersion: d.published ?? null });
  const owned = (id, type, tenant) => {
    const d = docs.get(id);
    return d && d.type === type && d.tenant === tenant && (d.draft || d.published) ? d : null;
  };
  const matches = (v, q) => {
    if (q.slug && v.slug !== q.slug) return false;
    if (q.persona && v.persona !== q.persona) return false;
    const aud = String(q.audiences ?? '').split(',').map((a) => AUDIENCE_FIELD[a]).filter(Boolean);
    if (aud.length && !aud.some((f) => v[f])) return false;
    if (q.live === 'true' && v.expiresAt && Date.parse(v.expiresAt) <= Date.now()) return false;
    return true;
  };

  /** Seed a document directly (e.g. another tenant's), bypassing the API. */
  function seed(type, tenant, data, { published = true } = {}) {
    const documentId = randomUUID().replace(/-/g, '').slice(0, 24);
    const at = now();
    const version = { ...data, documentId, tenant, updatedAt: at, createdAt: at, publishedAt: published ? at : null };
    docs.set(documentId, { type, tenant, draft: version, published: published ? { ...version } : null });
    return documentId;
  }

  const send = (res, status, body, headers = { 'Content-Type': 'application/json' }) => {
    res.writeHead(status, headers);
    res.end(Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };
  const fail = (res, status, name, message) => send(res, status, { data: null, error: { status, name, message, details: {} } });
  const TENANT_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks);
    const url = new URL(req.url, 'http://stub');
    const q = Object.fromEntries(url.searchParams);
    const isJson = (req.headers['content-type'] ?? '').includes('application/json');
    const body = isJson && raw.length ? JSON.parse(raw.toString('utf8')) : {};
    requests.push({ method: req.method, path: url.pathname, query: q, body, authorization: req.headers.authorization });

    if (req.method === 'GET' && url.pathname.startsWith('/uploads/')) {
      const file = media.find((m) => m.url === url.pathname);
      return file ? send(res, 200, file.bytes, { 'Content-Type': file.mime }) : send(res, 404, { error: 'not found' });
    }
    // Like the production tokens: reads with the read-only token, changes with the management token.
    const expected = req.method === 'GET' ? token : manageToken;
    if (req.headers.authorization !== `Bearer ${expected}`) return fail(res, req.headers.authorization === `Bearer ${token}` || req.headers.authorization === `Bearer ${manageToken}` ? 403 : 401, req.headers.authorization ? 'ForbiddenError' : 'UnauthorizedError', 'Missing or invalid credentials');

    const parts = url.pathname.replace(/^\/api\/edunexus\/?/, '').split('/').filter(Boolean);
    try {
      if (parts[0] === 'audit' && req.method === 'GET') {
        if (!TENANT_RE.test(q.tenant ?? '')) return fail(res, 400, 'ValidationError', 'A valid tenant is required.');
        return send(res, 200, { data: audit.filter((a) => a.tenant === q.tenant).reverse() });
      }
      if (parts[0] === 'media') {
        if (req.method === 'GET') return send(res, 200, { data: media.filter((m) => m.tenant === q.tenant).map(({ bytes, tenant, ...m }) => m) });
        const form = await new Response(raw, { headers: { 'content-type': req.headers['content-type'] } }).formData();
        const tenant = String(form.get('tenant') ?? '');
        if (!TENANT_RE.test(tenant)) return fail(res, 400, 'ValidationError', 'A valid tenant is required.');
        const file = form.get('file');
        const entry = { id: media.length + 1, name: file.name, url: `/uploads/${file.name.replace(/\.[^.]+$/, '')}_${media.length + 1}${file.name.match(/\.[^.]+$/)?.[0] ?? ''}`, mime: file.type, size: file.size / 1024, width: 1, height: 1, alternativeText: form.get('alternativeText') || null, createdAt: now(), tenant, bytes: Buffer.from(await file.arrayBuffer()) };
        media.push(entry);
        audit.push({ documentId: randomUUID(), tenant, action: 'upload', contentType: 'media', targetId: String(entry.id), actorName: form.get('actorName'), summary: entry.name, createdAt: now() });
        const { bytes, tenant: _t, ...dto } = entry;
        return send(res, 201, { data: dto });
      }
      if (parts[0] !== 'content') return fail(res, 404, 'NotFoundError', 'Not Found');
      const [, type, documentId, action] = parts;
      const tenant = req.method === 'GET' || req.method === 'DELETE' ? q.tenant : body.tenant;
      if (!TENANT_RE.test(tenant ?? '')) return fail(res, 400, 'ValidationError', 'A valid tenant is required.');
      const record = (act, id, summary) => audit.push({ documentId: randomUUID(), tenant, action: act, contentType: type, targetId: id, actorName: body.actor?.name ?? q.actorName ?? null, summary: summary ?? null, createdAt: now() });

      if (!documentId) {
        if (req.method === 'GET') {
          const rows = [...docs.values()].filter((d) => d.type === type && d.tenant === tenant);
          if (q.status === 'published') return send(res, 200, { data: rows.filter((d) => d.published && matches(d.published, q)).map((d) => ({ ...d.published, state: 'published' })) });
          return send(res, 200, { data: rows.filter((d) => d.draft && matches(d.draft, q)).map((d) => ({ ...present(d), publishedAt: d.published?.publishedAt ?? null })) });
        }
        if (req.method === 'POST') {
          const data = { ...body.data };
          delete data.tenant;
          if (type === 'page' && [...docs.values()].some((d) => d.type === 'page' && d.tenant === tenant && d.draft?.slug === data.slug)) return fail(res, 409, 'ConflictError', `Another page already uses the address "${data.slug}".`);
          if (type === 'dashboard-layout' && [...docs.values()].some((d) => d.type === type && d.tenant === tenant && d.draft?.persona === data.persona)) return fail(res, 409, 'ConflictError', 'Layout exists.');
          const id = seed(type, tenant, data, { published: false });
          record('create', id, data.title ?? data.question ?? data.persona);
          return send(res, 201, { data: present(docs.get(id)) });
        }
      }
      const d = owned(documentId, type, tenant);
      if (!d) return fail(res, 404, 'NotFoundError', 'Not found.');
      if (action === 'schedule') {
        if (!['page', 'announcement', 'faq'].includes(type)) return fail(res, 404, 'NotFoundError', 'This content type cannot be scheduled.');
        d.schedule ??= { publish: null, unpublish: null };
        if (req.method === 'PUT') {
          for (const [key, name] of [['publishAt', 'publish'], ['unpublishAt', 'unpublish']]) {
            if (body[key] === undefined) continue;
            if (body[key] && Date.parse(body[key]) < Date.now() + 30_000) return fail(res, 400, 'ValidationError', 'Scheduled times must be at least a minute in the future.');
            d.schedule[name] = body[key] ? { action: name, runAt: body[key], status: 'pending', attempts: 0 } : null;
          }
          record('schedule', documentId, d.draft?.title);
        }
        return send(res, 200, { data: d.schedule });
      }
      if (!action && req.method === 'GET') {
        if (q.status === 'published') return d.published ? send(res, 200, { data: { ...d.published, state: 'published' } }) : fail(res, 404, 'NotFoundError', 'Not found.');
        return send(res, 200, { data: present(d) });
      }
      if (!action && req.method === 'PUT') {
        const data = { ...body.data };
        delete data.tenant;
        delete data.persona;
        d.draft = { ...(d.draft ?? d.published), ...data, updatedAt: now() };
        record('update', documentId, d.draft.title ?? d.draft.question ?? d.draft.persona);
        return send(res, 200, { data: present(d) });
      }
      if (!action && req.method === 'DELETE') {
        docs.delete(documentId);
        record('delete', documentId, d.draft?.title);
        return send(res, 200, { data: { documentId, deleted: true } });
      }
      if (action === 'publish') {
        const at = now();
        d.draft = { ...d.draft, updatedAt: at, publishedAt: at };
        d.published = { ...d.draft };
      } else if (action === 'unpublish') {
        if (!d.published) return fail(res, 409, 'ConflictError', 'This item is not published.');
        d.published = null;
      } else if (action === 'discard') {
        if (!d.published) return fail(res, 409, 'ConflictError', 'There is no published version to return to.');
        d.draft = { ...d.published };
      } else return fail(res, 404, 'NotFoundError', 'Not Found');
      record(action, documentId, d.draft?.title);
      return send(res, 200, { data: present(d) });
    } catch (error) {
      return fail(res, 500, 'InternalServerError', error.message);
    }
  });

  const sockets = new Set();
  server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    docs,
    audit,
    media,
    requests,
    seed,
    png: PNG,
    close: () => new Promise((resolve) => { for (const s of sockets) s.destroy(); server.close(resolve); }),
  };
}

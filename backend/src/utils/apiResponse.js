/**
 * Every endpoint answers with the same envelope so the frontend has one code path
 * for success and one for failure.
 *
 *   { "success": true,  "data": <payload>, "meta": { ... } }
 *   { "success": false, "error": { "code": "...", "message": "...", "details": ... } }
 *
 * `sendSuccess(res, data, options)` treats `status` as the HTTP status and every other
 * option key as a `meta` field, so call sites read naturally:
 *
 *   sendSuccess(res, courses, { count: courses.length, readMode: 'synced' })
 *   sendSuccess(res, created, { status: 201 })
 */
export function sendSuccess(res, data, options = {}) {
  const { status = 200, meta: explicitMeta, ...rest } = options;
  const meta = { ...(explicitMeta ?? {}), ...rest };
  const body = { success: true, data };
  if (Object.keys(meta).length > 0) body.meta = meta;
  return res.status(status).json(body);
}

export function sendError(res, { status = 500, code = 'INTERNAL_ERROR', message, details }) {
  const error = { code, message };
  if (details !== undefined) error.details = details;
  return res.status(status).json({ success: false, error });
}

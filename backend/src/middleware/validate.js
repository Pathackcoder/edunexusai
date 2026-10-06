import { badRequest } from '../utils/errors.js';

/**
 * Server-side validation. The frontend validates for UX only; nothing reaching the
 * database is trusted until it has passed through one of these schemas.
 *
 *   router.post('/', validate({ body: createUserSchema }), controller.create)
 *
 * Parsed output replaces the raw input, so handlers receive coerced, stripped values.
 */
export const validate =
  ({ body, query, params }) =>
  (req, _res, next) => {
    try {
      if (body) req.body = body.parse(req.body ?? {});
      if (query) req.validatedQuery = query.parse(req.query ?? {});
      if (params) req.params = params.parse(req.params ?? {});
      return next();
    } catch (error) {
      return next(error);
    }
  };

/** Narrow helper for the common "is this a uuid path param" case. */
export const requireId = (req, name = 'id') => {
  const value = req.params[name];
  if (!value || typeof value !== 'string') throw badRequest(`Missing path parameter: ${name}`);
  return value;
};

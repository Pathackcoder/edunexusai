import { authenticateAccessToken } from '../../middleware/auth.js';
import { AppError, ErrorCode } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { VIEW_AS_HEADER, evaluateViewAsRequest } from './viewAsPolicy.js';
import { recordBlocked } from './viewAsService.js';

/**
 * The View-As HTTP gate, mounted for every path ahead of every route, so it applies whether or not a route remembers to use
 * requireAuth. A request carrying a View-As session header may read and may end its own session; anything else is
 * refused here, before any handler runs (default deny: see viewAsPolicy.js). The refusal is audited against the
 * administrator when the request identifies one; it is refused either way.
 */
export function viewAsRequestGate(req, _res, next) {
  const token = req.get(VIEW_AS_HEADER);
  if (!token) return next();
  const decision = evaluateViewAsRequest(req.method, req.originalUrl);
  if (decision.allowed) return next();

  const header = req.get('authorization') ?? '';
  if (header.startsWith('Bearer ')) {
    authenticateAccessToken(header.slice(7).trim(), { allowPendingPasswordChange: true })
      .then((actor) => recordBlocked(actor, token, { method: req.method, originalUrl: req.originalUrl, kind: decision.kind, reason: decision.reason }))
      .catch((error) => logger.warn('View-As block not audited', { message: error.message }));
  }
  const code = decision.kind === 'MUTATION' ? ErrorCode.VIEW_AS_READ_ONLY : ErrorCode.VIEW_AS_NOT_ALLOWED;
  return next(new AppError(403, code, decision.message, { reason: decision.reason }));
}

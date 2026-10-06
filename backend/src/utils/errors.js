/** Error codes returned in `error.code`. Stable contract for the frontend. */
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  FORBIDDEN: 'FORBIDDEN',
  TENANT_MISMATCH: 'TENANT_MISMATCH',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTEGRATION_ERROR: 'INTEGRATION_ERROR',
  INTEGRATION_NOT_CONFIGURED: 'INTEGRATION_NOT_CONFIGURED',
  PROFILE_NOT_FOUND: 'PROFILE_NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
};

export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }
}

export const badRequest = (message, details) =>
  new AppError(400, ErrorCode.VALIDATION_ERROR, message, details);
export const unauthenticated = (message = 'Authentication required.') =>
  new AppError(401, ErrorCode.UNAUTHENTICATED, message);
export const invalidCredentials = (message = 'Invalid email or password.') =>
  new AppError(401, ErrorCode.INVALID_CREDENTIALS, message);
export const forbidden = (message = 'You do not have access to this resource.') =>
  new AppError(403, ErrorCode.FORBIDDEN, message);
export const notFound = (message = 'Resource not found.') =>
  new AppError(404, ErrorCode.RESOURCE_NOT_FOUND, message);
export const conflict = (message = 'Resource already exists.') =>
  new AppError(409, ErrorCode.CONFLICT, message);
export const integrationError = (message, details) =>
  new AppError(502, ErrorCode.INTEGRATION_ERROR, message, details);
export const integrationNotConfigured = (message, details) =>
  new AppError(409, ErrorCode.INTEGRATION_NOT_CONFIGURED, message, details);

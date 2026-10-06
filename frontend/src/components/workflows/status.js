/** One mapping from workflow status to badge tone, shared by requester and admin views. */
const TONES = {
  PENDING: 'warning',
  IN_REVIEW: 'info',
  NEEDS_INFO: 'danger',
  APPROVED: 'success',
  REJECTED: 'neutral',
  CANCELLED: 'neutral',
  OPEN: 'warning',
  IN_PROGRESS: 'info',
  AWAITING_USER: 'danger',
  RESOLVED: 'success',
  CLOSED: 'neutral',
  SUBMITTED: 'warning',
  UNDER_REVIEW: 'info',
  ACKNOWLEDGED: 'success',
  DRAFT: 'neutral',
  PUBLISHED: 'success',
  SCHEDULED: 'purple',
  SENT: 'success',
  ARCHIVED: 'neutral',
};
export const statusTone = (status) => TONES[status] ?? 'neutral';

export const PRIORITY_TONES = { LOW: 'neutral', NORMAL: 'primary', HIGH: 'warning', URGENT: 'danger' };

export const formatDateTime = (value) =>
  value ? new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

export const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export const fileSize = (bytes) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

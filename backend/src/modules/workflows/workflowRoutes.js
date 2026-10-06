import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import * as requests from './requestService.js';
import * as tickets from './ticketService.js';
import * as forms from './formService.js';
import * as resources from './resourceService.js';
import * as broadcasts from './broadcastService.js';
import { getAttachmentForDownload } from './attachmentService.js';
import { listAudit } from '../audit/auditService.js';

const idParam = z.object({ id: z.string().uuid('Expected a record id.') });
const attachmentSchema = z
  .array(
    z.object({
      fileName: z.string().trim().min(1).max(200),
      mimeType: z.string().trim().max(120),
      dataBase64: z.string().min(4),
    }),
  )
  .max(3)
  .default([]);
const priority = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL');

const createRequestSchema = z.object({
  type: z.string().trim().min(2).max(60),
  title: z.string().trim().max(200).optional(),
  description: z.string().trim().min(5, 'Describe your request in a sentence or two.').max(4000),
  details: z.record(z.any()).default({}),
  priority,
  attachments: attachmentSchema,
});
const respondSchema = z.object({
  message: z.string().trim().min(3, 'Add a short reply.').max(4000),
  attachments: attachmentSchema,
});
const decisionSchema = z.object({
  status: z.enum(['IN_REVIEW', 'NEEDS_INFO', 'APPROVED', 'REJECTED']),
  note: z.string().trim().max(2000).optional(),
});
const createTicketSchema = z.object({
  category: z.string().trim().min(2).max(60),
  subject: z.string().trim().min(4, 'Subject must be at least 4 characters.').max(200),
  description: z.string().trim().min(10, 'Describe the issue in at least 10 characters.').max(5000),
  priority,
  attachments: attachmentSchema,
});
const replySchema = z.object({ body: z.string().trim().min(1, 'Reply cannot be empty.').max(5000) });
const ticketStatusSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'AWAITING_USER', 'RESOLVED', 'CLOSED']),
  note: z.string().trim().max(2000).optional(),
});
const listQuery = z.object({
  status: z.string().trim().max(20).optional(),
  role: z.string().trim().max(20).optional(),
  search: z.string().trim().max(120).optional(),
});
const submitFormSchema = z.object({ answers: z.record(z.any()) });
const formFieldSchema = z.object({
  key: z.string().trim().max(40).optional(),
  label: z.string().trim().min(1).max(200),
  type: z.enum(['text', 'textarea', 'select', 'rating', 'checkbox', 'date']),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().max(120)).max(20).optional(),
});
const createFormSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(2000).optional(),
  category: z.string().trim().max(60).optional(),
  audience: z.enum(['ALL', 'STUDENT', 'FACULTY']).default('ALL'),
  requiresReview: z.boolean().default(false),
  closesAt: z.string().trim().max(40).optional().or(z.literal('')),
  fields: z.array(formFieldSchema).min(1).max(30),
  publish: z.boolean().default(false),
});
const formStatusSchema = z.object({ status: z.enum(['DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED']) });
const reviewSchema = z.object({
  status: z.enum(['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'ACKNOWLEDGED']),
  note: z.string().trim().max(2000).optional(),
});
const resourceSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(2000).optional(),
  category: z.string().trim().max(60).optional(),
  audience: z.enum(['ALL', 'STUDENT', 'FACULTY']).optional(),
  url: z.string().trim().url('Enter a full link, e.g. https://…').max(500).optional().or(z.literal('')),
  fileLabel: z.string().trim().max(80).optional(),
  content: z.string().trim().max(10000).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
});
const broadcastSchema = z.object({
  action: z.enum(['DRAFT', 'SEND', 'SCHEDULE']).default('SEND'),
  title: z.string().trim().min(1, 'Title is required.').max(200),
  message: z.string().trim().max(4000).optional(),
  category: z.string().trim().max(40).optional(),
  priority: z.string().trim().max(20).optional(),
  audienceType: z.string().trim().max(40),
  audienceValue: z.string().trim().max(200).optional().nullable(),
  audienceLabel: z.string().trim().max(200).optional(),
  channels: z.array(z.string().trim().max(20)).max(6).optional(),
  scheduledFor: z.string().trim().max(40).optional().nullable(),
  expiresAt: z.string().trim().max(40).optional().nullable(),
});

/* ------------------------------------------------------------------------- */
/* Requester side: /requests, /support/tickets, /forms, /resources            */
/* ------------------------------------------------------------------------- */

export const workflowRoutes = Router();
workflowRoutes.use(['/requests', '/support', '/forms', '/resources', '/attachments'], requireAuth);

workflowRoutes.get('/requests/types', (req, res) => sendSuccess(res, requests.listRequestTypes(req.auth.roles)));
workflowRoutes.get('/requests', asyncHandler(async (req, res) => sendSuccess(res, await requests.listMyRequests(req.auth))));
workflowRoutes.post(
  '/requests',
  validate({ body: createRequestSchema }),
  asyncHandler(async (req, res) => sendSuccess(res, await requests.createGenericRequest(req.auth, req.body), { status: 201 })),
);
workflowRoutes.get('/requests/:id', validate({ params: idParam }), asyncHandler(async (req, res) => sendSuccess(res, await requests.getRequest(req.auth, req.params.id))));
workflowRoutes.post(
  '/requests/:id/respond',
  validate({ params: idParam, body: respondSchema }),
  asyncHandler(async (req, res) => sendSuccess(res, await requests.respondToRequest(req.auth, req.params.id, req.body))),
);
workflowRoutes.post(
  '/requests/:id/cancel',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => sendSuccess(res, await requests.cancelRequest(req.auth, req.params.id))),
);

workflowRoutes.get('/support/tickets', asyncHandler(async (req, res) => sendSuccess(res, await tickets.listMyTickets(req.auth))));
workflowRoutes.post(
  '/support/tickets',
  validate({ body: createTicketSchema }),
  asyncHandler(async (req, res) => sendSuccess(res, await tickets.createTicket(req.auth, req.body), { status: 201 })),
);
workflowRoutes.get('/support/tickets/:id', validate({ params: idParam }), asyncHandler(async (req, res) => sendSuccess(res, await tickets.getTicket(req.auth, req.params.id))));
workflowRoutes.post(
  '/support/tickets/:id/messages',
  validate({ params: idParam, body: replySchema }),
  asyncHandler(async (req, res) => sendSuccess(res, await tickets.replyToTicket(req.auth, req.params.id, req.body), { status: 201 })),
);
workflowRoutes.patch(
  '/support/tickets/:id/status',
  validate({ params: idParam, body: ticketStatusSchema }),
  asyncHandler(async (req, res) => sendSuccess(res, await tickets.updateTicketStatus(req.auth, req.params.id, req.body))),
);

workflowRoutes.get('/forms', asyncHandler(async (req, res) => sendSuccess(res, await forms.listAvailableForms(req.auth))));
workflowRoutes.post(
  '/forms/:id/submissions',
  validate({ params: idParam, body: submitFormSchema }),
  asyncHandler(async (req, res) => sendSuccess(res, await forms.submitForm(req.auth, req.params.id, req.body), { status: 201 })),
);

workflowRoutes.get(
  '/resources',
  validate({ query: z.object({ category: z.string().trim().max(60).optional(), search: z.string().trim().max(120).optional() }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await resources.listPublishedResources(req.auth, req.validatedQuery))),
);
workflowRoutes.get('/resources/manage', requireRole('FACULTY', 'ADMIN'), asyncHandler(async (req, res) => sendSuccess(res, await resources.listManagedResources(req.auth))));
workflowRoutes.post(
  '/resources',
  requireRole('FACULTY', 'ADMIN'),
  validate({ body: resourceSchema }),
  asyncHandler(async (req, res) => sendSuccess(res, await resources.createResource(req.auth, req.body), { status: 201 })),
);
workflowRoutes.patch(
  '/resources/:id',
  requireRole('FACULTY', 'ADMIN'),
  validate({ params: idParam, body: resourceSchema.partial() }),
  asyncHandler(async (req, res) => sendSuccess(res, await resources.updateResource(req.auth, req.params.id, req.body))),
);
workflowRoutes.get('/resources/:id', validate({ params: idParam }), asyncHandler(async (req, res) => sendSuccess(res, await resources.openResource(req.auth, req.params.id))));

workflowRoutes.get(
  '/attachments/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const file = await getAttachmentForDownload(req.auth, req.params.id);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.fileName)}"`);
    return res.send(Buffer.from(file.data));
  }),
);

/* ------------------------------------------------------------------------- */
/* Administrator side, mounted under /admin                                    */
/* ------------------------------------------------------------------------- */

export const adminOperationsRoutes = Router();

adminOperationsRoutes.get(
  '/requests',
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => sendSuccess(res, await requests.adminListRequests(req.auth, req.validatedQuery))),
);
adminOperationsRoutes.patch(
  '/requests/:id/decision',
  validate({ params: idParam, body: decisionSchema }),
  asyncHandler(async (req, res) => sendSuccess(res, await requests.decideRequest(req.auth, req.params.id, req.body))),
);
adminOperationsRoutes.get(
  '/tickets',
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => sendSuccess(res, await tickets.adminListTickets(req.auth, req.validatedQuery))),
);
adminOperationsRoutes.get('/forms', asyncHandler(async (req, res) => sendSuccess(res, await forms.adminListForms(req.auth))));
adminOperationsRoutes.post(
  '/forms',
  validate({ body: createFormSchema }),
  asyncHandler(async (req, res) => sendSuccess(res, await forms.adminCreateForm(req.auth, req.body), { status: 201 })),
);
adminOperationsRoutes.patch(
  '/forms/:id/status',
  validate({ params: idParam, body: formStatusSchema }),
  asyncHandler(async (req, res) => sendSuccess(res, await forms.adminSetFormStatus(req.auth, req.params.id, req.body.status))),
);
adminOperationsRoutes.get(
  '/forms/:id/submissions',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => sendSuccess(res, await forms.adminListSubmissions(req.auth, req.params.id))),
);
adminOperationsRoutes.patch(
  '/form-submissions/:id/review',
  validate({ params: idParam, body: reviewSchema }),
  asyncHandler(async (req, res) => sendSuccess(res, await forms.adminReviewSubmission(req.auth, req.params.id, req.body))),
);
adminOperationsRoutes.get('/broadcasts', asyncHandler(async (req, res) => sendSuccess(res, await broadcasts.listBroadcasts(req.auth))));
adminOperationsRoutes.post(
  '/broadcasts/preview',
  validate({ body: z.object({ audienceType: z.string().max(40), audienceValue: z.string().max(200).optional().nullable() }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await broadcasts.previewAudience(req.auth, req.body))),
);
adminOperationsRoutes.post(
  '/broadcasts',
  validate({ body: broadcastSchema }),
  asyncHandler(async (req, res) => sendSuccess(res, await broadcasts.saveBroadcast(req.auth, req.body), { status: 201 })),
);
adminOperationsRoutes.patch(
  '/broadcasts/:id',
  validate({ params: idParam, body: broadcastSchema }),
  asyncHandler(async (req, res) => sendSuccess(res, await broadcasts.saveBroadcast(req.auth, req.body, req.params.id))),
);
adminOperationsRoutes.delete(
  '/broadcasts/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => sendSuccess(res, await broadcasts.deleteBroadcast(req.auth, req.params.id))),
);
adminOperationsRoutes.get(
  '/audit',
  validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await listAudit(req.auth.tenantId, req.validatedQuery))),
);

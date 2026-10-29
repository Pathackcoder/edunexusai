import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireFacultyProfile, requireRole, requireStudentProfile } from '../../middleware/auth.js';
import * as sis from './sisService.js';
import { passwordPolicy } from '../auth/authSchemas.js';

/**
 * CampusCore SIS routes.
 *
 *   /sis/me/...       the signed-in user's own SIS data. The SIS record is resolved from
 *                     the session user's verified identity link; no route accepts a student id.
 *   /sis/faculty/...  sections the signed-in faculty member teaches (checked by CampusCore).
 *   /sis/calendar, /sis/sections   institution-wide reads for signed-in users of this tenant.
 *   /sis/admin/...    administration, ADMIN role, plus CampusCore's own scope/policy checks.
 */
export const sisRoutes = Router();
sisRoutes.use(requireAuth);

const sisId = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9-]+$/);
const termQuery = z.object({ termId: sisId.optional() });

/* ---------- signed-in user ---------- */
// Student or faculty: the user's own CampusCore record (header, profile, dashboard summaries).
sisRoutes.get('/me/profile', asyncHandler(async (req, res) => sendSuccess(res, await sis.myProfile(req.auth))));

/* ---------- student ---------- */
sisRoutes.get('/me/overview', requireStudentProfile, validate({ query: termQuery }), asyncHandler(async (req, res) => sendSuccess(res, await sis.studentOverview(req.auth, req.validatedQuery))));

/* ---------- institution-wide reads ---------- */
sisRoutes.get(
  '/calendar',
  validate({ query: z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), termId: sisId.optional(), category: z.string().max(40).optional() }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await sis.calendar(req.auth, req.validatedQuery))),
);
sisRoutes.get(
  '/sections',
  validate({ query: z.object({ termId: sisId.optional(), search: z.string().trim().max(100).optional(), page: z.coerce.number().int().min(1).optional(), pageSize: z.coerce.number().int().min(1).max(50).optional() }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await sis.searchSections(req.auth, req.validatedQuery))),
);

/* ---------- faculty ---------- */
const faculty = Router();
faculty.use(requireRole('FACULTY'), requireFacultyProfile);
faculty.get('/teaching', validate({ query: termQuery }), asyncHandler(async (req, res) => sendSuccess(res, await sis.facultyTeaching(req.auth, req.validatedQuery))));
faculty.get('/sections/:sectionId/roster', validate({ params: z.object({ sectionId: sisId }) }), asyncHandler(async (req, res) => sendSuccess(res, await sis.facultyRoster(req.auth, req.params.sectionId))));
sisRoutes.use('/faculty', faculty);

/* ---------- admin ---------- */
const admin = Router();
admin.use(requireRole('ADMIN'));

admin.get('/health', asyncHandler(async (_req, res) => sendSuccess(res, await sis.health())));
admin.get('/capabilities', asyncHandler(async (req, res) => sendSuccess(res, await sis.capabilities(req.auth))));
const OPERATIONS = ['student.create', 'student.update', 'student.contact', 'student.academic', 'student.deactivate', 'registration.write', 'attendance.write', 'grade.write', 'identity.link'];
admin.put(
  '/write-preferences',
  validate({ body: z.object({ disabledOperations: z.array(z.enum(OPERATIONS)).max(OPERATIONS.length), profileFields: z.array(z.string().max(40)).max(20).nullable().default(null), academicFields: z.array(z.string().max(40)).max(5).nullable().default(null) }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await sis.setWritePreferences(req.auth, req.body))),
);
admin.get('/reference', asyncHandler(async (req, res) => sendSuccess(res, await sis.referenceData(req.auth))));

admin.get(
  '/students',
  validate({ query: z.object({ search: z.string().trim().max(100).optional(), status: z.enum(['APPLICANT', 'ADMITTED', 'ACTIVE', 'LEAVE_OF_ABSENCE', 'SUSPENDED', 'WITHDRAWN', 'GRADUATED']).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await sis.searchStudents(req.auth, req.validatedQuery))),
);
admin.get(
  '/faculty',
  validate({ query: z.object({ search: z.string().trim().max(100).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await sis.searchFaculty(req.auth, req.validatedQuery))),
);
admin.get('/students/:sisId', validate({ params: z.object({ sisId }) }), asyncHandler(async (req, res) => sendSuccess(res, await sis.getStudent(req.auth, req.params.sisId))));
admin.get(
  '/students/:sisId/audit',
  validate({ params: z.object({ sisId }), query: z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await sis.studentAudit(req.auth, req.params.sisId, req.validatedQuery))),
);

const contact = {
  preferredName: z.string().trim().max(80).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  personalEmail: z.string().trim().email().max(120).nullable().optional(),
  addressLine: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  region: z.string().trim().max(80).nullable().optional(),
  postalCode: z.string().trim().max(20).nullable().optional(),
  country: z.string().trim().max(60).nullable().optional(),
};
admin.post(
  '/students',
  validate({
    body: z.object({
      idempotencyKey: z.string().uuid('A fresh idempotency key (UUID) is required for each new-student form.'),
      student: z.object({
        firstName: z.string().trim().min(1).max(80),
        lastName: z.string().trim().min(1).max(80),
        email: z.string().trim().toLowerCase().email().max(120),
        programId: sisId,
        admitTermId: sisId.optional(),
        status: z.enum(['ADMITTED', 'ACTIVE']).default('ADMITTED'),
        expectedGraduation: z.string().trim().regex(/^(Spring|Summer|Fall|Winter) \d{4}$/, 'Use e.g. "Spring 2028"').optional(),
        ...contact,
      }),
    }),
  }),
  asyncHandler(async (req, res) => sendSuccess(res, await sis.createStudent(req.auth, req.body.student, { idempotencyKey: req.body.idempotencyKey }), { status: 201 })),
);
admin.patch(
  '/students/:sisId',
  validate({
    params: z.object({ sisId }),
    body: z.object({
      etag: z.string().max(200).optional(),
      changes: z.object({ ...contact, firstName: z.string().trim().min(1).max(80).optional(), lastName: z.string().trim().min(1).max(80).optional(), programId: sisId.nullable().optional(), admitTermId: sisId.nullable().optional(), expectedGraduation: z.string().trim().regex(/^(Spring|Summer|Fall|Winter) \d{4}$/).nullable().optional() }).strict().refine((c) => Object.keys(c).length > 0, 'Change at least one field.'),
    }),
  }),
  asyncHandler(async (req, res) => sendSuccess(res, await sis.updateStudent(req.auth, req.params.sisId, req.body.changes, { etag: req.body.etag }))),
);
admin.post(
  '/students/:sisId/deactivate',
  validate({ params: z.object({ sisId }), body: z.object({ reason: z.string().trim().min(3).max(500), dropFutureRegistrations: z.boolean().default(false), idempotencyKey: z.string().uuid().optional() }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await sis.deactivateStudent(req.auth, req.params.sisId, req.body))),
);

admin.post(
  '/identity/reconcile',
  validate({ body: z.object({ recordType: z.enum(['STUDENT', 'FACULTY']).default('STUDENT'), userIds: z.array(z.string().uuid()).max(200).optional() }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await sis.reconcile(req.auth, req.body))),
);
admin.get(
  '/identity/links',
  validate({ query: z.object({ status: z.enum(['ACTIVE', 'REVOKED']).optional(), recordType: z.enum(['STUDENT', 'FACULTY']).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(50) }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await sis.listLinks(req.auth, req.validatedQuery))),
);
admin.post(
  '/identity/links',
  validate({ body: z.object({ userId: z.string().uuid(), recordType: z.enum(['STUDENT', 'FACULTY']), sisRecordId: sisId, evidenceMismatchReason: z.string().trim().min(5).max(300).optional() }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await sis.linkIdentity(req.auth, req.body), { status: 201 })),
);
admin.post(
  '/identity/links/:linkId/revoke',
  validate({ params: z.object({ linkId: sisId }), body: z.object({ reason: z.string().trim().min(5).max(300), userId: z.string().uuid().optional() }) }),
  asyncHandler(async (req, res) => sendSuccess(res, await sis.revokeLink(req.auth, req.params.linkId, req.body))),
);

// Portal login for an existing CampusCore student or faculty member, linked in the same step.
admin.post(
  '/accounts',
  validate({
    body: z.object({
      recordType: z.enum(['STUDENT', 'FACULTY']),
      sisRecordId: sisId,
      password: passwordPolicy,
      tierKey: z.string().trim().max(40).optional(),
    }),
  }),
  asyncHandler(async (req, res) => sendSuccess(res, await sis.provisionAccount(req.auth, req.body), { status: 201 })),
);
sisRoutes.use('/admin', admin);

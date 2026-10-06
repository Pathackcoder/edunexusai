import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/apiResponse.js';
import * as service from './academicsService.js';

const ctx = (req) => ({
  tenantId: req.auth.tenantId,
  userId: req.auth.userId,
  studentProfileId: req.auth.studentProfileId,
});

export const listCourses = asyncHandler(async (req, res) => {
  const { tenantId, studentProfileId } = ctx(req);
  const { courses, readMode } = await service.listCourses(tenantId, studentProfileId);
  return sendSuccess(res, courses, { count: courses.length, readMode });
});

export const getCourse = asyncHandler(async (req, res) => {
  const { tenantId, studentProfileId } = ctx(req);
  const course = await service.getCourse(tenantId, studentProfileId, req.params.id);
  return sendSuccess(res, course);
});

export const getSchedule = asyncHandler(async (req, res) => {
  const { tenantId, studentProfileId } = ctx(req);
  const schedule = await service.getScheduleForDay(tenantId, studentProfileId);
  return sendSuccess(res, schedule);
});

export const listAssignments = asyncHandler(async (req, res) => {
  const { tenantId, studentProfileId } = ctx(req);
  const assignments = await service.listAssignments(tenantId, studentProfileId);
  return sendSuccess(res, assignments, { count: assignments.length });
});

export const submitAssignment = asyncHandler(async (req, res) => {
  const { tenantId, studentProfileId } = ctx(req);
  const assignment = await service.submitAssignment(tenantId, studentProfileId, req.params.id, req.body);
  return sendSuccess(res, assignment);
});

export const getGrades = asyncHandler(async (req, res) => {
  const { tenantId, studentProfileId } = ctx(req);
  const grades = await service.getGrades(tenantId, studentProfileId);
  return sendSuccess(res, grades);
});

export const listAnnouncements = asyncHandler(async (req, res) => {
  const { tenantId, userId, studentProfileId } = ctx(req);
  const announcements = await service.listAnnouncements(tenantId, { userId, studentProfileId });
  return sendSuccess(res, announcements, { count: announcements.length });
});

export const markAnnouncementRead = asyncHandler(async (req, res) => {
  const { tenantId, userId } = ctx(req);
  const result = await service.markAnnouncementRead(tenantId, userId, req.params.id);
  return sendSuccess(res, result);
});

export const listCalendar = asyncHandler(async (req, res) => {
  const { tenantId } = ctx(req);
  const events = await service.listAcademicEvents(tenantId, req.validatedQuery ?? {});
  return sendSuccess(res, events, { count: events.length });
});

export const getTranscript = asyncHandler(async (req, res) => {
  const { tenantId, studentProfileId } = ctx(req);
  const transcript = await service.getTranscript(tenantId, studentProfileId);
  return sendSuccess(res, transcript);
});

export const listTranscriptRequests = asyncHandler(async (req, res) => {
  const { tenantId, studentProfileId } = ctx(req);
  const requests = await service.listTranscriptRequests(tenantId, studentProfileId);
  return sendSuccess(res, requests, { count: requests.length });
});

export const createTranscriptRequest = asyncHandler(async (req, res) => {
  const { tenantId, studentProfileId } = ctx(req);
  const request = await service.createTranscriptRequest(tenantId, studentProfileId, req.body);
  return sendSuccess(res, request, { status: 201 });
});

export const listLms = asyncHandler(async (req, res) => {
  const { tenantId, studentProfileId } = ctx(req);
  const payload = await service.listLmsCourses(tenantId, studentProfileId);
  return sendSuccess(res, payload);
});

import { prisma } from '../../db/prisma.js';
import { badRequest, forbidden, notFound } from '../../utils/errors.js';
import { notifyUsers } from '../notifications/notificationService.js';

/**
 * Virtual advising.
 *
 *   advisor (faculty) publishes availability slots
 *   student books / reschedules / cancels  ─▶  advisor notified
 *   advisor completes or cancels           ─▶  student notified
 *
 * Meeting links are generated placeholders; no video provider is connected.
 */

const meetingLink = (id) => `https://meet.edunexus.ai/advising/${id.slice(0, 8)}`;

const apptInclude = {
  slot: true,
  student: { select: { id: true, firstName: true, lastName: true, email: true, studentProfile: { select: { studentNumber: true, degree: true } } } },
  advisor: { select: { id: true, firstName: true, lastName: true, email: true, facultyProfile: { select: { title: true, officeLocation: true } } } },
};

function presentAppointment(row) {
  return {
    id: row.id,
    topic: row.topic,
    notes: row.notes,
    status: row.status,
    startsAt: row.slot.startsAt,
    endsAt: row.slot.endsAt,
    mode: row.slot.mode,
    location: row.slot.location,
    meetingUrl: row.meetingUrl,
    student: { id: row.student.id, name: `${row.student.firstName} ${row.student.lastName}`, email: row.student.email, studentNumber: row.student.studentProfile?.studentNumber, program: row.student.studentProfile?.degree },
    advisor: { id: row.advisor.id, name: `${row.advisor.firstName} ${row.advisor.lastName}`, title: row.advisor.facultyProfile?.title, email: row.advisor.email, office: row.advisor.facultyProfile?.officeLocation },
    createdAt: row.createdAt,
  };
}

export async function listAdvisors(auth) {
  const advisors = await prisma.user.findMany({
    where: { tenantId: auth.tenantId, status: 'ACTIVE', userRoles: { some: { role: { key: 'FACULTY' } } } },
    select: { id: true, firstName: true, lastName: true, email: true, facultyProfile: { select: { title: true, department: true, officeLocation: true, bio: true } } },
  });
  const open = await prisma.advisingSlot.groupBy({
    by: ['advisorUserId'],
    where: { tenantId: auth.tenantId, startsAt: { gt: new Date() }, isBlocked: false, appointments: { none: { status: 'BOOKED' } } },
    _count: { _all: true },
  });
  return advisors.map((advisor) => ({
    id: advisor.id,
    name: `${advisor.firstName} ${advisor.lastName}`,
    title: advisor.facultyProfile?.title,
    department: advisor.facultyProfile?.department,
    office: advisor.facultyProfile?.officeLocation,
    bio: advisor.facultyProfile?.bio,
    email: advisor.email,
    openSlots: open.find((row) => row.advisorUserId === advisor.id)?._count._all ?? 0,
  }));
}

export async function listOpenSlots(auth, { advisorId }) {
  const slots = await prisma.advisingSlot.findMany({
    where: {
      tenantId: auth.tenantId,
      ...(advisorId ? { advisorUserId: advisorId } : {}),
      startsAt: { gt: new Date() },
      isBlocked: false,
      appointments: { none: { status: 'BOOKED' } },
    },
    orderBy: { startsAt: 'asc' },
    take: 120,
  });
  return slots.map((slot) => ({ id: slot.id, advisorId: slot.advisorUserId, startsAt: slot.startsAt, endsAt: slot.endsAt, mode: slot.mode, location: slot.location }));
}

export async function listMyAppointments(auth) {
  const isAdvisor = auth.roles.includes('FACULTY');
  const rows = await prisma.advisingAppointment.findMany({
    where: { tenantId: auth.tenantId, ...(isAdvisor ? { advisorUserId: auth.userId } : { studentUserId: auth.userId }) },
    include: apptInclude,
    orderBy: { slot: { startsAt: 'asc' } },
  });
  const now = new Date();
  const appointments = rows.map(presentAppointment);
  return {
    upcoming: appointments.filter((row) => row.status === 'BOOKED' && new Date(row.endsAt) >= now),
    past: appointments.filter((row) => row.status !== 'BOOKED' || new Date(row.endsAt) < now).reverse(),
  };
}

async function openSlotOrThrow(tx, tenantId, slotId) {
  const slot = await tx.advisingSlot.findFirst({
    where: { id: slotId, tenantId },
    include: { appointments: { where: { status: 'BOOKED' } } },
  });
  if (!slot || slot.isBlocked) throw notFound('That time is no longer available.');
  if (slot.startsAt <= new Date()) throw badRequest('Choose a time in the future.');
  if (slot.appointments.length) throw badRequest('That time was just booked. Please pick another slot.');
  return slot;
}

const when = (date) =>
  new Date(date).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });

export async function bookAppointment(auth, { slotId, topic, notes }) {
  const created = await prisma.$transaction(async (tx) => {
    const slot = await openSlotOrThrow(tx, auth.tenantId, slotId);
    const appointment = await tx.advisingAppointment.create({
      data: { tenantId: auth.tenantId, slotId, studentUserId: auth.userId, advisorUserId: slot.advisorUserId, topic, notes: notes ?? null },
    });
    const url = slot.mode === 'VIRTUAL' ? slot.meetingUrl ?? meetingLink(appointment.id) : null;
    await tx.advisingAppointment.update({ where: { id: appointment.id }, data: { meetingUrl: url } });
    await notifyUsers({ tenantId: auth.tenantId, userIds: [slot.advisorUserId], title: 'New advising appointment', message: `${auth.firstName} ${auth.lastName} booked ${when(slot.startsAt)} — ${topic}.`, category: 'academic', link: '/faculty/advising', sourceType: 'ADVISING', sourceRefId: appointment.id, createdByUserId: auth.userId }, tx);
    await notifyUsers({ tenantId: auth.tenantId, userIds: [auth.userId], title: 'Advising appointment confirmed', message: `${when(slot.startsAt)} · ${slot.mode === 'VIRTUAL' ? 'Virtual meeting link in Advising' : slot.location ?? 'In person'}.`, category: 'academic', link: '/academics/advising', sourceType: 'ADVISING', sourceRefId: appointment.id }, tx);
    return appointment;
  });
  return presentAppointment(await prisma.advisingAppointment.findUnique({ where: { id: created.id }, include: apptInclude }));
}

async function loadOwn(auth, id) {
  const row = await prisma.advisingAppointment.findFirst({ where: { id, tenantId: auth.tenantId }, include: apptInclude });
  if (!row) throw notFound('Appointment not found.');
  if (row.studentUserId !== auth.userId && row.advisorUserId !== auth.userId) throw forbidden();
  return row;
}

export async function rescheduleAppointment(auth, id, { slotId }) {
  const row = await loadOwn(auth, id);
  if (row.status !== 'BOOKED') throw badRequest('Only booked appointments can be rescheduled.');
  await prisma.$transaction(async (tx) => {
    const slot = await openSlotOrThrow(tx, auth.tenantId, slotId);
    if (slot.advisorUserId !== row.advisorUserId) throw badRequest('Pick a time with the same advisor.');
    await tx.advisingAppointment.update({
      where: { id },
      data: { slotId, meetingUrl: slot.mode === 'VIRTUAL' ? slot.meetingUrl ?? meetingLink(id) : null },
    });
    const other = auth.userId === row.studentUserId ? row.advisorUserId : row.studentUserId;
    await notifyUsers({ tenantId: auth.tenantId, userIds: [other], title: 'Advising appointment rescheduled', message: `${row.topic}: moved from ${when(row.slot.startsAt)} to ${when(slot.startsAt)}.`, category: 'academic', link: auth.userId === row.studentUserId ? '/faculty/advising' : '/academics/advising', sourceType: 'ADVISING', sourceRefId: id, createdByUserId: auth.userId }, tx);
  });
  return presentAppointment(await prisma.advisingAppointment.findUnique({ where: { id }, include: apptInclude }));
}

export async function setAppointmentStatus(auth, id, status) {
  const row = await loadOwn(auth, id);
  if (row.status !== 'BOOKED') throw badRequest('This appointment is no longer active.');
  if (status === 'COMPLETED' && row.advisorUserId !== auth.userId) throw forbidden('Only the advisor can complete an appointment.');
  await prisma.$transaction(async (tx) => {
    await tx.advisingAppointment.update({ where: { id }, data: { status, cancelledAt: status === 'CANCELLED' ? new Date() : null } });
    const other = auth.userId === row.studentUserId ? row.advisorUserId : row.studentUserId;
    await notifyUsers({
      tenantId: auth.tenantId,
      userIds: [other],
      title: status === 'CANCELLED' ? 'Advising appointment cancelled' : 'Advising appointment completed',
      message: `${row.topic} · ${when(row.slot.startsAt)}`,
      category: 'academic',
      link: other === row.studentUserId ? '/academics/advising' : '/faculty/advising',
      sourceType: 'ADVISING',
      sourceRefId: id,
      createdByUserId: auth.userId,
    }, tx);
  });
  return presentAppointment(await prisma.advisingAppointment.findUnique({ where: { id }, include: apptInclude }));
}

/* ----- advisor availability ----- */

export async function listMySlots(auth) {
  const slots = await prisma.advisingSlot.findMany({
    where: { tenantId: auth.tenantId, advisorUserId: auth.userId, startsAt: { gt: new Date() } },
    include: { appointments: { where: { status: 'BOOKED' }, include: { student: { select: { firstName: true, lastName: true } } } } },
    orderBy: { startsAt: 'asc' },
  });
  return slots.map((slot) => ({
    id: slot.id,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    mode: slot.mode,
    location: slot.location,
    bookedBy: slot.appointments[0] ? `${slot.appointments[0].student.firstName} ${slot.appointments[0].student.lastName}` : null,
  }));
}

/** Publish `count` consecutive slots of `durationMinutes` from `startsAt`. */
export async function createSlots(auth, { startsAt, durationMinutes = 30, count = 1, mode = 'VIRTUAL', location }) {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime()) || start <= new Date()) throw badRequest('Choose a future start time.');
  const rows = [];
  for (let index = 0; index < count; index += 1) {
    const begins = new Date(start.getTime() + index * durationMinutes * 60_000);
    rows.push({
      tenantId: auth.tenantId,
      advisorUserId: auth.userId,
      startsAt: begins,
      endsAt: new Date(begins.getTime() + durationMinutes * 60_000),
      mode,
      location: mode === 'IN_PERSON' ? location ?? 'Advising office' : 'Virtual meeting',
    });
  }
  const result = await prisma.advisingSlot.createMany({ data: rows, skipDuplicates: true });
  return { created: result.count, slots: await listMySlots(auth) };
}

export async function deleteSlot(auth, id) {
  const slot = await prisma.advisingSlot.findFirst({
    where: { id, tenantId: auth.tenantId, advisorUserId: auth.userId },
    include: { appointments: { where: { status: 'BOOKED' } } },
  });
  if (!slot) throw notFound('Slot not found.');
  if (slot.appointments.length) throw badRequest('Cancel the booked appointment before removing this slot.');
  await prisma.advisingSlot.delete({ where: { id } });
  return listMySlots(auth);
}

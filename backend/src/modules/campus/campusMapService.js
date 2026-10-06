import { prisma } from '../../db/prisma.js';
import { roomSchedulingAdapter } from '../../integrations/adapters/roomSchedulingAdapter.js';

/**
 * Campus map and real-time classroom availability.
 *
 * Occupancy for a room = course meetings held there (synced course sections in
 * PostgreSQL) + reservations from the room-scheduling feed (mock adapter). Nothing is
 * guessed: a room is "available" only when neither source has it booked.
 */

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TZ = 'America/New_York';

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
};
const label = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

/** "Science Building 204" -> { buildingName: "Science Building", room: "204" } */
function parseRoom(value = '') {
  const match = String(value).trim().match(/^(.*?)\s+([A-Z]?\d+[A-Z]?)$/i);
  return match ? { buildingName: match[1], room: match[2] } : null;
}

function matchBuilding(buildings, name) {
  const lower = name.toLowerCase();
  return buildings.find((building) => building.name.toLowerCase() === lower || building.name.toLowerCase().startsWith(lower) || lower.startsWith(building.name.toLowerCase()));
}

function nowInCampusTime() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return { day: get('weekday'), minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

export async function getCampusMap(auth) {
  const [buildings, courses] = await Promise.all([
    prisma.campusBuilding.findMany({ where: { tenantId: auth.tenantId }, include: { classrooms: true }, orderBy: { name: 'asc' } }),
    auth.studentProfileId
      ? prisma.course.findMany({ where: { tenantId: auth.tenantId, enrollments: { some: { studentProfileId: auth.studentProfileId } } } })
      : prisma.course.findMany({ where: { tenantId: auth.tenantId, instructorUserId: auth.userId } }),
  ]);
  const myPlaces = [];
  for (const course of courses) {
    const parsed = parseRoom(course.room);
    const building = parsed && matchBuilding(buildings, parsed.buildingName);
    if (building) myPlaces.push({ buildingId: building.id, buildingCode: building.code, room: parsed.room, courseCode: course.code, courseName: course.name, when: `${(course.meetingDays ?? []).join(' / ')} · ${course.timeLabel ?? ''}` });
  }
  return {
    buildings: buildings.map((building) => ({
      id: building.id,
      code: building.code,
      name: building.name,
      category: building.category,
      description: building.description,
      address: building.address,
      hours: building.hours,
      amenities: building.amenities,
      x: building.mapX,
      y: building.mapY,
      roomCount: building.classrooms.length,
      myClasses: myPlaces.filter((place) => place.buildingId === building.id),
    })),
    myPlaces,
    categories: [...new Set(buildings.map((building) => building.category))].sort(),
  };
}

export async function getClassroomAvailability(auth, { day, time, building, minCapacity } = {}) {
  const now = nowInCampusTime();
  const targetDay = DAYS.includes(day) ? day : now.day;
  const targetMinutes = time ? toMinutes(time) : now.minutes;
  const dayCode = { Sunday: 'U', Monday: 'M', Tuesday: 'T', Wednesday: 'W', Thursday: 'R', Friday: 'F', Saturday: 'S' }[targetDay];

  const [buildings, courses, reservations] = await Promise.all([
    prisma.campusBuilding.findMany({ where: { tenantId: auth.tenantId }, include: { classrooms: { orderBy: { roomNumber: 'asc' } } }, orderBy: { name: 'asc' } }),
    prisma.course.findMany({ where: { tenantId: auth.tenantId }, select: { code: true, name: true, room: true, meetingDays: true, dayCodes: true, startTime: true, endTime: true } }),
    roomSchedulingAdapter.fetchReservations(),
  ]);

  const bookings = new Map();
  const add = (key, entry) => bookings.set(key, [...(bookings.get(key) ?? []), entry]);
  for (const course of courses) {
    const parsed = parseRoom(course.room);
    const match = parsed && matchBuilding(buildings, parsed.buildingName);
    const meets = (course.meetingDays ?? []).includes(targetDay) || (course.dayCodes ?? []).includes(dayCode);
    if (match && meets && course.startTime && course.endTime) {
      add(`${match.code}:${parsed.room}`, { title: `${course.code} · ${course.name}`, start: toMinutes(course.startTime), end: toMinutes(course.endTime), source: 'Course schedule' });
    }
  }
  for (const reservation of reservations) {
    if (reservation.days.includes(targetDay)) {
      add(`${reservation.building}:${reservation.room}`, { title: reservation.title, start: toMinutes(reservation.start), end: toMinutes(reservation.end), source: roomSchedulingAdapter.label });
    }
  }

  const rooms = [];
  for (const b of buildings) {
    if (building && building !== 'ALL' && b.code !== building) continue;
    for (const room of b.classrooms) {
      if (minCapacity && room.capacity < Number(minCapacity)) continue;
      const schedule = (bookings.get(`${b.code}:${room.roomNumber}`) ?? []).sort((x, y) => x.start - y.start);
      const current = schedule.find((slot) => slot.start <= targetMinutes && slot.end > targetMinutes);
      const next = schedule.find((slot) => slot.start > targetMinutes);
      rooms.push({
        id: room.id,
        building: { code: b.code, name: b.name },
        roomNumber: room.roomNumber,
        name: room.name,
        capacity: room.capacity,
        roomType: room.roomType,
        features: room.features,
        status: current ? 'IN_USE' : 'AVAILABLE',
        currentUse: current ? { title: current.title, until: label(current.end), source: current.source } : null,
        availableUntil: current ? null : next ? label(next.start) : 'End of day',
        nextFreeAt: current ? label(current.end) : null,
        schedule: schedule.map((slot) => ({ title: slot.title, start: label(slot.start), end: label(slot.end), startMinutes: slot.start, endMinutes: slot.end, source: slot.source })),
      });
    }
  }
  return {
    day: targetDay,
    time: label(targetMinutes),
    timeValue: `${String(Math.floor(targetMinutes / 60)).padStart(2, '0')}:${String(targetMinutes % 60).padStart(2, '0')}`,
    isNow: !day && !time,
    rooms,
    summary: { total: rooms.length, available: rooms.filter((room) => room.status === 'AVAILABLE').length, inUse: rooms.filter((room) => room.status === 'IN_USE').length },
    buildings: buildings.map((b) => ({ code: b.code, name: b.name })),
    sources: ['Course schedule (PostgreSQL)', roomSchedulingAdapter.label],
  };
}

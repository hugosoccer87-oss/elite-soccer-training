import {
  getRemainingSpots,
  getTrainingGroup,
  isSlotActive,
  isSlotInFuture,
  sortTrainingSlots,
  type CalendarSyncStatus,
  type TrainingGroupId,
  type TrainingSlot
} from "@/lib/booking-data";
import { listCalendarAvailabilitySlots } from "@/lib/google-calendar";
import { business } from "@/lib/site-data";

export type PublicAvailableSession = {
  id: string;
  date: string;
  dateLabel: string;
  dayLabel: string;
  startTime: string;
  endTime: string;
  isoDateTime: string;
  timeZone: string;
  trainingGroupId: TrainingGroupId;
  trainingGroup: string;
  trainingGroupAges: string;
  capacity: number;
  bookedCount: number;
  remainingSpots: number;
  location: string;
  duration: string;
  calendarEventId?: string;
};

export type PublicAvailabilityResponse = {
  status: CalendarSyncStatus;
  sessions: PublicAvailableSession[];
  generatedAt: string;
  timeZone: string;
  message?: string;
};

export type PublicAvailabilityDebugResponse = PublicAvailabilityResponse & {
  loadedSessions: Array<{
    id: string;
    date: string;
    time: string;
    trainingGroup: string;
    status: string;
    capacity: number;
    bookedCount: number;
    remainingSpots: number;
    checks: {
      activeEnabled: boolean;
      futureDate: boolean;
      capacity: boolean;
      remainingSpots: boolean;
    };
    included: boolean;
    removedReasons: string[];
  }>;
};

const availabilityTimeZone = "America/Los_Angeles";

function parseDisplayTimeMinutes(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

  if (!match) {
    return 0;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const suffix = match[3].toUpperCase();

  return (suffix === "PM" && hour !== 12 ? hour + 12 : suffix === "AM" && hour === 12 ? 0 : hour) * 60 + minute;
}

function formatDisplayTime(totalMinutes: number) {
  const normalizedMinutes = ((totalMinutes % 1440) + 1440) % 1440;
  const hour24 = Math.floor(normalizedMinutes / 60);
  const minute = normalizedMinutes % 60;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;

  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function durationMinutes(slot: TrainingSlot) {
  return Number.parseInt(slot.duration, 10) || 60;
}

function isoLocalDateTime(slot: TrainingSlot) {
  const minutes = parseDisplayTimeMinutes(slot.time);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;

  return `${slot.dateIso}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

function toPublicSession(slot: TrainingSlot): PublicAvailableSession {
  const group = getTrainingGroup(slot.groupId);
  const startMinutes = parseDisplayTimeMinutes(slot.time);
  const endTime = formatDisplayTime(startMinutes + durationMinutes(slot));

  return {
    id: slot.id,
    date: slot.dateIso,
    dateLabel: slot.dateLabel,
    dayLabel: slot.dayLabel,
    startTime: slot.time,
    endTime,
    isoDateTime: isoLocalDateTime(slot),
    timeZone: availabilityTimeZone,
    trainingGroupId: slot.groupId,
    trainingGroup: group.name,
    trainingGroupAges: group.ages,
    capacity: slot.capacity,
    bookedCount: slot.bookedPlayers,
    remainingSpots: getRemainingSpots(slot),
    location: business.location,
    duration: slot.duration,
    calendarEventId: slot.calendarEventId
  };
}

function evaluateSlot(slot: TrainingSlot, now: Date) {
  const activeEnabled = isSlotActive(slot, []);
  const futureDate = isSlotInFuture(slot, now);
  const capacity = slot.capacity > 0 && slot.bookedPlayers < slot.capacity;
  const remainingSpots = getRemainingSpots(slot) > 0;
  const removedReasons = [
    activeEnabled ? "" : `status is ${slot.status}`,
    futureDate ? "" : "session is not in the future",
    capacity ? "" : "capacity is full or invalid",
    remainingSpots ? "" : "no remaining spots"
  ].filter(Boolean);

  return {
    activeEnabled,
    futureDate,
    capacity,
    remainingSpots,
    included: removedReasons.length === 0,
    removedReasons
  };
}

export async function getServerAvailableSessions(): Promise<PublicAvailabilityResponse> {
  const result = await listCalendarAvailabilitySlots();
  const now = new Date();
  const sessions = result.status === "Synced" ? result.slots ?? [] : [];
  const availableSessions = sortTrainingSlots(
    sessions.filter((slot) => {
      const check = evaluateSlot(slot, now);

      return check.included;
    })
  ).map(toPublicSession);

  return {
    status: result.status,
    sessions: availableSessions,
    generatedAt: now.toISOString(),
    timeZone: availabilityTimeZone,
    message: result.message
  };
}

export async function getServerAvailabilityDebug(): Promise<PublicAvailabilityDebugResponse> {
  const result = await listCalendarAvailabilitySlots();
  const now = new Date();
  const sessions = result.status === "Synced" ? result.slots ?? [] : [];
  const response = await getServerAvailableSessions();

  return {
    ...response,
    loadedSessions: sessions.map((slot) => {
      const checks = evaluateSlot(slot, now);

      return {
        id: slot.id,
        date: slot.dateIso,
        time: slot.time,
        trainingGroup: getTrainingGroup(slot.groupId).name,
        status: slot.status,
        capacity: slot.capacity,
        bookedCount: slot.bookedPlayers,
        remainingSpots: getRemainingSpots(slot),
        checks: {
          activeEnabled: checks.activeEnabled,
          futureDate: checks.futureDate,
          capacity: checks.capacity,
          remainingSpots: checks.remainingSpots
        },
        included: checks.included,
        removedReasons: checks.removedReasons
      };
    })
  };
}

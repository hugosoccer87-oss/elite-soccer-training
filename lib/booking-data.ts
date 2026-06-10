export type SlotStatus = "open" | "booked" | "blocked";

export type TrainingGroupId = "future-elite" | "elite-performance";

export type TrainingGroup = {
  id: TrainingGroupId;
  name: string;
  ages: string;
  minAge: number;
  maxAge: number;
  focus: string[];
};

export type TrainingSlot = {
  id: string;
  groupId: TrainingGroupId;
  dateIso: string;
  dateLabel: string;
  dayLabel: string;
  time: string;
  duration: string;
  capacity: number;
  bookedPlayers: number;
  status: SlotStatus;
  calendarEventId?: string;
  calendarStatus?: CalendarSyncStatus;
};

export type CalendarSyncStatus =
  | "Ready"
  | "Created"
  | "Synced"
  | "Unavailable"
  | "Google Calendar not configured"
  | "Failed";

export type BookingRecord = {
  id: string;
  createdAt: string;
  parentName: string;
  playerName: string;
  playerAge: string;
  phone: string;
  email: string;
  players: string;
  notes: string;
  medicalNotes: string;
  emergencyName: string;
  emergencyPhone: string;
  guardianSignature: string;
  waiverAccepted: boolean;
  waiverAcceptedAt: string;
  waiverVersion: string;
  ipAddress?: string;
  mediaConsent: "Granted" | "Declined";
  programId: TrainingGroupId;
  programName: string;
  sessionId: string;
  sessionDateIso: string;
  sessionDate: string;
  sessionTime: string;
  sessionDurationMinutes: number;
  sessionCalendarEventId?: string;
  paymentStatus: "Paid" | "pending_payment" | "Pending" | "Failed";
  notificationStatus: "Ready" | "Sent" | "Email service not configured" | "Email delivery needs attention";
  calendarStatus: CalendarSyncStatus;
  calendarMessage?: string;
  calendarEventId?: string;
  calendarEventUrl?: string;
};

export const availabilityStorageKey = "est-availability-v3";
export const blockedDaysStorageKey = "est-blocked-days-v3";
export const bookingsStorageKey = "est-bookings-v1";
export const bookingNotificationEmail = "info@elitesoccertrainingcv.com";
export const slotCapacity = 6;

export const trainingGroups: TrainingGroup[] = [
  {
    id: "future-elite",
    name: "Future Elite",
    ages: "Ages 9-12",
    minAge: 9,
    maxAge: 12,
    focus: [
      "Technical foundation",
      "First touch",
      "Ball mastery",
      "Passing and receiving",
      "Coordination",
      "Confidence on the ball"
    ]
  },
  {
    id: "elite-performance",
    name: "Elite Performance",
    ages: "Ages 13-18",
    minAge: 13,
    maxAge: 18,
    focus: [
      "Speed of play",
      "Finishing",
      "Decision making",
      "Intensity",
      "Agility",
      "Game-realistic development"
    ]
  }
];

export const defaultTrainingSlots: TrainingSlot[] = [];

type StoredTrainingSlot = Omit<TrainingSlot, "capacity" | "bookedPlayers" | "groupId"> &
  Partial<Pick<TrainingSlot, "capacity" | "bookedPlayers" | "groupId">>;

export function normalizeTrainingSlot(slot: StoredTrainingSlot): TrainingSlot {
  const capacity = typeof slot.capacity === "number" && Number.isFinite(slot.capacity) ? Math.min(slot.capacity, slotCapacity) : slotCapacity;
  const rawBookedPlayers =
    typeof slot.bookedPlayers === "number" ? slot.bookedPlayers : slot.status === "booked" ? capacity : 0;
  const bookedPlayers = Math.min(capacity, Math.max(0, rawBookedPlayers));
  const status = slot.status === "blocked" ? "blocked" : bookedPlayers >= capacity ? "booked" : slot.status;
  const groupId =
    slot.groupId && trainingGroups.some((group) => group.id === slot.groupId) ? slot.groupId : "future-elite";

  return {
    ...slot,
    groupId,
    duration: slot.duration || "60 min",
    capacity,
    bookedPlayers,
    status
  };
}

export function getRemainingSpots(slot: TrainingSlot) {
  return Math.max(0, slot.capacity - slot.bookedPlayers);
}

export function isSlotAvailable(slot: TrainingSlot, blockedDays: string[]) {
  return slot.status === "open" && !blockedDays.includes(slot.dateIso) && getRemainingSpots(slot) > 0;
}

export function isSlotActive(slot: TrainingSlot, blockedDays: string[]) {
  return slot.status === "open" && !blockedDays.includes(slot.dateIso);
}

function getPacificNowParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((current, part) => {
      if (part.type !== "literal") {
        current[part.type] = part.value;
      }

      return current;
    }, {});

  return {
    dateIso: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute)
  };
}

function parseSlotTimeMinutes(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const suffix = match[3].toUpperCase();
  const normalizedHour = suffix === "PM" && hour !== 12 ? hour + 12 : suffix === "AM" && hour === 12 ? 0 : hour;

  return normalizedHour * 60 + minute;
}

function isIsoDateString(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function isSlotInFuture(slot: TrainingSlot, now = new Date()) {
  if (!isIsoDateString(slot.dateIso)) {
    return false;
  }

  const current = getPacificNowParts(now);

  if (slot.dateIso > current.dateIso) {
    return true;
  }

  if (slot.dateIso < current.dateIso) {
    return false;
  }

  const slotMinutes = parseSlotTimeMinutes(slot.time);

  return slotMinutes === null ? true : slotMinutes > current.minutes;
}

export function isPublicSlotAvailable(slot: TrainingSlot, blockedDays: string[], now = new Date()) {
  return isSlotActive(slot, blockedDays) && isSlotInFuture(slot, now) && getRemainingSpots(slot) > 0;
}

function sortSlotValue(slot: TrainingSlot) {
  return {
    dateIso: slot.dateIso,
    minutes: parseSlotTimeMinutes(slot.time) ?? 0
  };
}

export function sortTrainingSlots(slots: TrainingSlot[]) {
  return [...slots].sort((left, right) => {
    const leftValue = sortSlotValue(left);
    const rightValue = sortSlotValue(right);

    if (leftValue.dateIso !== rightValue.dateIso) {
      return leftValue.dateIso.localeCompare(rightValue.dateIso);
    }

    return leftValue.minutes - rightValue.minutes;
  });
}

export function getAvailableSessions(
  sessions: TrainingSlot[],
  selectedProgram?: TrainingGroupId | "",
  options: {
    blockedDays?: string[];
    now?: Date;
  } = {}
) {
  const blockedDays = options.blockedDays ?? [];
  const now = options.now ?? new Date();
  const normalizedSessions = sessions.map(normalizeTrainingSlot);
  const activeSessions = normalizedSessions.filter((slot) => isSlotActive(slot, blockedDays));
  const futureSessions = activeSessions.filter((slot) => isSlotInFuture(slot, now));
  const sessionsWithRemainingSpots = futureSessions.filter((slot) => getRemainingSpots(slot) > 0);
  const finalSessions = sessionsWithRemainingSpots.filter((slot) => !selectedProgram || slot.groupId === selectedProgram);

  return {
    sessions: sortTrainingSlots(finalSessions),
    debug: {
      totalSessionsLoaded: normalizedSessions.length,
      activeSessions: activeSessions.length,
      futureSessions: futureSessions.length,
      sessionsWithRemainingSpots: sessionsWithRemainingSpots.length,
      selectedProgram: selectedProgram ? getTrainingGroup(selectedProgram).name : "all",
      finalSessionsShown: finalSessions.length
    }
  };
}

export function formatSessionDate(dateIso: string) {
  const [year, month, day] = dateIso.split("-").map(Number);

  if (!year || !month || !day) {
    return dateIso;
  }

  const date = new Date(Date.UTC(year, month - 1, day, 12));

  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC"
  }).format(date);
}

export function getTrainingGroup(groupId: TrainingGroupId) {
  return trainingGroups.find((group) => group.id === groupId) ?? trainingGroups[0];
}

export function isAgeInGroup(age: number, groupId: TrainingGroupId) {
  const group = getTrainingGroup(groupId);
  return age >= group.minAge && age <= group.maxAge;
}

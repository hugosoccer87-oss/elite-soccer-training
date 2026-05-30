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

export function getTrainingGroup(groupId: TrainingGroupId) {
  return trainingGroups.find((group) => group.id === groupId) ?? trainingGroups[0];
}

export function isAgeInGroup(age: number, groupId: TrainingGroupId) {
  const group = getTrainingGroup(groupId);
  return age >= group.minAge && age <= group.maxAge;
}

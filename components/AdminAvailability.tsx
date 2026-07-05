"use client";

import { useEffect, useMemo, useState } from "react";
import { bookingNotificationEmail, slotCapacity, trainingGroups, type TrainingGroupId } from "@/lib/booking-data";
import { getSessionFocusLabel, sessionFocusExamples, shootingFinishingTrainingFocusValue } from "@/lib/session-focus";
import { business } from "@/lib/site-data";
import type {
  AdminBookingRecord,
  AdminPassPurchase,
  AdminTrainingSession,
  DirectPaymentRow,
  DirectPaymentStatus,
  EmailSubscriberRow,
  PrivateSessionRequestRow,
  PrivateSessionRequestStatus,
  ScheduleApprovalPaymentMethod
} from "@/lib/supabase-db";
import { waiverRecordFooter, waiverSections } from "@/lib/waiver-content";

const inputClass =
  "field-focus w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400";
const primaryButtonClass =
  "rounded-md bg-electric px-5 py-3 text-xs font-black uppercase text-white shadow-lg shadow-electric/20 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60";
const navyButtonClass =
  "rounded-md bg-navy px-5 py-3 text-xs font-black uppercase text-white transition hover:bg-electric disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButtonClass =
  "rounded-md border border-slate-300 bg-white px-4 py-3 text-xs font-black uppercase text-navy transition hover:border-electric hover:text-electric disabled:cursor-not-allowed disabled:opacity-60";
const dangerButtonClass =
  "rounded-md border border-red-200 bg-red-50 px-4 py-3 text-xs font-black uppercase text-red-700 transition hover:border-red-400 disabled:cursor-not-allowed disabled:opacity-60";

type AdminDiagnostics = {
  stripeKeyMode: "test" | "live" | "unknown" | "missing";
  webhookSecretExists: boolean;
  smtpConfigured: boolean;
  emailFromConfigured: boolean;
  adminNotificationRecipient: string;
  stripe?: {
    stripeMode: "live" | "test";
    secretKeyConfigured: boolean;
    publishableKeyConfigured: boolean;
    webhookSecretConfigured: boolean;
    secretKeyName: string;
    publishableKeyName: string;
    webhookSecretName: string;
  };
  supabase?: {
    configured: boolean;
    urlConfigured: boolean;
    serviceRoleKeyConfigured: boolean;
  };
  googleCalendar?: {
    googleCalendarConfigured: boolean;
    googleCalendarId: string;
    googleServiceAccountEmail: string;
    googleAuthMode?: string;
    hasGoogleClientId: boolean;
    hasGoogleClientSecret: boolean;
    hasGoogleRefreshToken: boolean;
    hasGooglePrivateKey?: boolean;
    lastCalendarEventCreationResult: {
      checkedAt: string;
      bookingId?: string;
      status: string;
      calendarId: string;
      eventId?: string;
      message?: string;
    } | null;
  };
  lastEmailAttempt: {
    checkedAt: string;
    bookingId?: string;
    smtpConfigured: boolean;
    emailFromConfigured: boolean;
    adminNotificationRecipient: string;
    customerRecipient?: string;
    customerStatus: "not_attempted" | "sent" | "failed";
    adminStatus: "not_attempted" | "sent" | "failed";
    message?: string;
  } | null;
  lastPaymentVerificationResult: {
    checkedAt: string;
    source: string;
    verified: boolean;
    sessionId?: string;
    bookingId?: string;
    sessionStatus?: string;
    paymentStatus?: string;
    message?: string;
  } | null;
};

type SessionsResponse = {
  status?: string;
  sessions?: AdminTrainingSession[];
  error?: string;
};

type BookingsResponse = {
  status?: string;
  bookings?: AdminBookingRecord[];
  error?: string;
};

type PassesResponse = {
  status?: string;
  passes?: AdminPassPurchase[];
  error?: string;
};

type DirectPaymentsResponse = {
  status?: string;
  directPayments?: DirectPaymentRow[];
  error?: string;
};

type EmailSubscribersResponse = {
  status?: string;
  subscribers?: EmailSubscriberRow[];
  error?: string;
};

type PrivateSessionRequestsResponse = {
  status?: string;
  requests?: PrivateSessionRequestRow[];
  error?: string;
};

type ActiveWaiverRecord = {
  booking: AdminBookingRecord;
  session?: AdminTrainingSession;
};

type ContactEditRecordType = "booking" | "pass" | "direct_payment" | "email_subscriber";
type ContactEditState = {
  recordType: ContactEditRecordType;
  id: string;
  title: string;
  showPlayerFullName?: boolean;
  showPlayerSplitName?: boolean;
  showSecondPlayer?: boolean;
};

type ContactFormState = {
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  playerName: string;
  playerFirstName: string;
  playerLastName: string;
  playerAge: string;
  secondPlayerFirstName: string;
  secondPlayerLastName: string;
  secondPlayerAge: string;
};

type AdminSection =
  | "dashboard"
  | "calendar"
  | "players"
  | "sessions"
  | "bookings"
  | "passes"
  | "private-requests"
  | "direct-payments"
  | "email-list";
type SessionFilter =
  | "all"
  | "open"
  | "full"
  | "closed"
  | "cancelled"
  | "technical"
  | "defending"
  | "shooting-attacking"
  | "shooting-finishing";
type SessionDateRange = "all" | "today" | "this-week" | "upcoming" | "past";
type BookingFilter = "confirmed" | "incomplete" | "all" | "upcoming" | "past";
type PassFilter = "all" | "active" | "used-up" | "four" | "six";
type CalendarView = "month" | "week" | "day";
type DirectPaymentFilter =
  | "all"
  | "zelle-pending"
  | "card-paid"
  | "pending-card"
  | "single-session"
  | "four-pass"
  | "six-pass";

type BulkSessionPattern = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  trainingFocus: string;
};

type BulkPreviewSession = {
  key: string;
  date: string;
  dayLabel: string;
  trainingGroup: TrainingGroupId;
  trainingGroupLabel: string;
  startTime: string;
  endTime: string;
  trainingFocus: string;
  capacity: number;
  location: string;
  alreadyExists: boolean;
  duplicateInPreview: boolean;
};

type ManualBookingPaymentStatus = "paid" | "pending_payment" | "comped" | "training_credit_used";
type ManualBookingPaymentMethod =
  | "Zelle"
  | "Cash"
  | "Venmo"
  | "Card"
  | "Training Package credit"
  | "Comped"
  | "Other";
type ManualBookingWaiverStatus = "signed" | "missing";
type ManualBookingModalState =
  | {
      mode: "add";
      session: AdminTrainingSession;
    }
  | {
      mode: "edit";
      booking: AdminBookingRecord;
      session?: AdminTrainingSession;
    };

type ManualBookingFormState = {
  playerName: string;
  playerAge: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  emergencyName: string;
  emergencyPhone: string;
  medicalNotes: string;
  paymentStatus: ManualBookingPaymentStatus;
  paymentMethod: ManualBookingPaymentMethod;
  amountPaid: string;
  waiverStatus: ManualBookingWaiverStatus;
  internalNote: string;
  passPurchaseId: string;
  overrideCapacity: boolean;
  sendConfirmationEmail: boolean;
};

type PlayerLookupGroup = {
  key: string;
  displayName: string;
  bookings: AdminBookingRecord[];
  parentRecordCount: number;
};

const adminSections: Array<{ id: AdminSection; label: string; note: string }> = [
  { id: "dashboard", label: "Overview", note: "Today and this week" },
  { id: "calendar", label: "Calendar", note: "Booked sessions by date" },
  { id: "players", label: "Player Lookup", note: "Find player schedules" },
  { id: "sessions", label: "Sessions", note: "Create and manage openings" },
  { id: "bookings", label: "Bookings", note: "Players and waivers" },
  { id: "passes", label: "Training Packages / Credits", note: "Credit tracking" },
  { id: "private-requests", label: "Private Requests", note: "1-on-1 inquiries" },
  { id: "direct-payments", label: "Direct Payments", note: "Pay + waiver records" },
  { id: "email-list", label: "Email List", note: "Brevo CSV export" }
];

const focusChoices = Array.from(
  new Set(["General Training", ...sessionFocusExamples, shootingFinishingTrainingFocusValue])
);
const dayOptions = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" }
];
const manualCreditReasons = [
  "Session cancelled by EST CV",
  "Weather cancellation",
  "Makeup credit",
  "Admin correction",
  "Goodwill credit",
  "Other"
];
const manualBookingPaymentStatuses: Array<{ value: ManualBookingPaymentStatus; label: string }> = [
  { value: "paid", label: "Paid" },
  { value: "pending_payment", label: "Pending payment" },
  { value: "comped", label: "Comped" },
  { value: "training_credit_used", label: "Training credit used" }
];
const manualBookingPaymentMethods: Array<{ value: ManualBookingPaymentMethod; label: string }> = [
  { value: "Zelle", label: "Zelle" },
  { value: "Cash", label: "Cash" },
  { value: "Venmo", label: "Venmo" },
  { value: "Card", label: "Card" },
  { value: "Training Package credit", label: "Training Package credit" },
  { value: "Comped", label: "Comped" },
  { value: "Other", label: "Other" }
];
const defaultManualBookingForm: ManualBookingFormState = {
  playerName: "",
  playerAge: "",
  parentName: "",
  parentEmail: "",
  parentPhone: "",
  emergencyName: "",
  emergencyPhone: "",
  medicalNotes: "",
  paymentStatus: "paid",
  paymentMethod: "Zelle",
  amountPaid: "55",
  waiverStatus: "missing",
  internalNote: "",
  passPurchaseId: "",
  overrideCapacity: false,
  sendConfirmationEmail: true
};
const scheduleApprovalPaymentMethods: Array<{ value: ScheduleApprovalPaymentMethod; label: string }> = [
  { value: "cash", label: "Cash" },
  { value: "zelle", label: "Zelle" },
  { value: "venmo", label: "Venmo" },
  { value: "stripe_manual", label: "Stripe manual" },
  { value: "other", label: "Other" }
];
const calendarHourStart = 5;
const calendarHourEnd = 21;
const defaultBulkPatterns: BulkSessionPattern[] = [
  { id: "monday-6", dayOfWeek: 1, startTime: "06:00", endTime: "07:00", trainingFocus: "Technical Work" },
  { id: "monday-7", dayOfWeek: 1, startTime: "07:00", endTime: "08:00", trainingFocus: "Wingers / Wing Backs" },
  { id: "tuesday-6", dayOfWeek: 2, startTime: "06:00", endTime: "07:00", trainingFocus: "First Touch & Passing" },
  { id: "tuesday-7", dayOfWeek: 2, startTime: "07:00", endTime: "08:00", trainingFocus: "Defending Session" },
  { id: "wednesday-6", dayOfWeek: 3, startTime: "06:00", endTime: "07:00", trainingFocus: "Technical Work" },
  { id: "wednesday-7", dayOfWeek: 3, startTime: "07:00", endTime: "08:00", trainingFocus: "Shooting / Attacking Session" },
  { id: "thursday-6", dayOfWeek: 4, startTime: "06:00", endTime: "07:00", trainingFocus: "Speed of Play & Decision Making" },
  { id: "thursday-7", dayOfWeek: 4, startTime: "07:00", endTime: "08:00", trainingFocus: "Defending Session" },
  { id: "friday-6", dayOfWeek: 5, startTime: "06:00", endTime: "07:00", trainingFocus: "Technical Work" },
  { id: "friday-7", dayOfWeek: 5, startTime: "07:00", endTime: "08:00", trainingFocus: "Shooting / Attacking Session" }
];

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDateTime(value: string, timeZone = "America/Los_Angeles") {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatDateHeading(value: string, timeZone = "America/Los_Angeles") {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(new Date(value));
}

function formatTime(value: string, timeZone = "America/Los_Angeles") {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatTimeRange(session: Pick<AdminTrainingSession, "start_datetime" | "end_datetime" | "timezone">) {
  return `${formatTime(session.start_datetime, session.timezone)}-${formatTime(session.end_datetime, session.timezone)}`;
}

function formatDateOnly(value: string, timeZone = "America/Los_Angeles") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  })
    .formatToParts(new Date(value))
    .reduce<Record<string, string>>((current, part) => {
      if (part.type !== "literal") {
        current[part.type] = part.value;
      }

      return current;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatTimeInput(value: string, timeZone = "America/Los_Angeles") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  })
    .formatToParts(new Date(value))
    .reduce<Record<string, string>>((current, part) => {
      if (part.type !== "literal") {
        current[part.type] = part.value;
      }

      return current;
    }, {});

  return `${parts.hour ?? "17"}:${parts.minute ?? "00"}`;
}

function dateFromDateInput(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day));
}

function dateInputFromDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function todayDateInput() {
  return formatDateOnly(new Date().toISOString(), "America/Los_Angeles");
}

function addDaysToDateInput(value: string, days: number) {
  const date = dateFromDateInput(value);
  date.setUTCDate(date.getUTCDate() + days);
  return dateInputFromDate(date);
}

function startOfWeekDateInput(value: string) {
  const date = dateFromDateInput(value);
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + mondayOffset);
  return dateInputFromDate(date);
}

function startOfMonthDateInput(value: string) {
  const date = dateFromDateInput(value);
  return dateInputFromDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)));
}

function endOfMonthDateInput(value: string) {
  const date = dateFromDateInput(value);
  return dateInputFromDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)));
}

function calendarMonthGridDays(value: string) {
  const monthStart = startOfMonthDateInput(value);
  const monthEnd = endOfMonthDateInput(value);
  const gridStart = startOfWeekDateInput(monthStart);
  const endDate = dateFromDateInput(monthEnd);
  const endDay = endDate.getUTCDay();
  const sundayOffset = endDay === 0 ? 0 : 7 - endDay;
  endDate.setUTCDate(endDate.getUTCDate() + sundayOffset);
  const gridEnd = dateInputFromDate(endDate);
  const days: string[] = [];

  for (let current = gridStart; current <= gridEnd; current = addDaysToDateInput(current, 1)) {
    days.push(current);
  }

  return days;
}

function calendarDateHeading(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(dateFromDateInput(value));
}

function calendarMonthHeading(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(dateFromDateInput(value));
}

function minutesFromDateTime(value: string, timeZone = "America/Los_Angeles") {
  const time = formatTimeInput(value, timeZone);
  const [hour, minute] = time.split(":").map(Number);
  return (Number(hour) || 0) * 60 + (Number(minute) || 0);
}

function dayLabelFromDateInput(value: string) {
  const day = dateFromDateInput(value).getUTCDay();

  return dayOptions.find((option) => option.value === day)?.label ?? "Session";
}

function bulkSessionKey(input: {
  trainingGroup: string;
  date: string;
  startTime: string;
  endTime: string;
}) {
  return [input.trainingGroup, input.date, input.startTime, input.endTime].join("|");
}

function existingSessionBulkKey(session: AdminTrainingSession) {
  return bulkSessionKey({
    trainingGroup: session.training_group,
    date: formatDateOnly(session.start_datetime, session.timezone),
    startTime: formatTimeInput(session.start_datetime, session.timezone),
    endTime: formatTimeInput(session.end_datetime, session.timezone)
  });
}

function formatWaiverTimestamp(value?: string | null) {
  if (!value) {
    return "Not recorded";
  }

  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Los_Angeles"
  });
}

function bookingProgramLabel(booking: AdminBookingRecord) {
  return trainingGroups.find((group) => group.id === booking.training_group)?.name ?? booking.training_group;
}

function trainingGroupLabel(trainingGroup: TrainingGroupId) {
  return trainingGroups.find((group) => group.id === trainingGroup)?.name ?? trainingGroup;
}

function passTypeLabel(passType: string) {
  if (passType === "four_session_launch_pass") {
    return "4-Session Training Package";
  }

  if (passType === "six_session_launch_pass") {
    return "6-Session Training Package";
  }

  return passType;
}

function directPaymentOptionLabel(option: string) {
  if (option === "single_session") {
    return "Single Session";
  }

  return passTypeLabel(option);
}

function directPaymentMethodLabel(method: string) {
  return method === "zelle" ? "Zelle" : "Card";
}

function sessionFocusLabel(session: Pick<AdminTrainingSession, "training_focus">) {
  return getSessionFocusLabel(session.training_focus);
}

function sessionFocusBadgeClass(session: Pick<AdminTrainingSession, "training_focus">) {
  const focus = sessionFocusLabel(session).toLowerCase();

  if (focus.includes("shooting")) {
    return "border-blue-200 bg-blue-50 text-electric";
  }

  if (focus.includes("defending")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (focus.includes("technical") || focus.includes("first touch")) {
    return "border-indigo-200 bg-indigo-50 text-indigo-700";
  }

  return "border-slate-200 bg-white text-slate-700";
}

function statusBadgeClass(status: string) {
  if (status === "open") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "cancelled") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-slate-200 bg-slate-100 text-slate-600";
}

function adminCalendarStatus(session: AdminTrainingSession) {
  if (session.status === "cancelled") {
    return "cancelled";
  }

  if (session.status === "closed") {
    return "closed";
  }

  if (session.remainingSpots <= 0) {
    return "full";
  }

  return "open";
}

function adminCalendarStatusBadgeClass(session: AdminTrainingSession) {
  const status = adminCalendarStatus(session);

  if (status === "open") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "full") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (status === "cancelled") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-slate-200 bg-slate-100 text-slate-600";
}

function adminCalendarBlockClass(session: AdminTrainingSession) {
  const status = adminCalendarStatus(session);

  if (status === "open") {
    return "border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100";
  }

  if (status === "full") {
    return "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100";
  }

  if (status === "cancelled") {
    return "border-red-300 bg-red-50 text-red-900 hover:bg-red-100";
  }

  return "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200";
}

function paymentTypeLabel(booking: AdminBookingRecord) {
  if (booking.admin_payment_method) {
    return booking.admin_payment_method;
  }

  if (booking.payment_type === "launch_pass_credit") {
    return "Training credit";
  }

  return "Card / Single Session";
}

function isBookingConfirmedForAdmin(booking: AdminBookingRecord) {
  if (booking.status !== "paid") {
    return false;
  }

  if (
    booking.manual_source &&
    (booking.admin_payment_status === "paid" ||
      booking.admin_payment_status === "comped" ||
      booking.admin_payment_status === "training_credit_used")
  ) {
    return true;
  }

  if (booking.payment_type === "launch_pass_credit" || booking.pass_purchase_id || booking.credit_redemption_id) {
    return true;
  }

  return Boolean(booking.stripe_payment_intent_id) || Number(booking.amount_paid) > 0;
}

function bookingAdminStatusLabel(booking: AdminBookingRecord) {
  return isBookingConfirmedForAdmin(booking) ? "Confirmed" : "Incomplete";
}

function bookingAdminStatusBadgeClass(booking: AdminBookingRecord) {
  return isBookingConfirmedForAdmin(booking)
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-amber-200 bg-amber-50 text-amber-800";
}

function endTimeFromStartInput(value: string) {
  const [hours, minutes] = value.split(":").map((part) => Number(part));

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return "";
  }

  const endHours = (hours + 1) % 24;

  return `${String(endHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function paymentStatusLabel(status: string) {
  if (status === "pending_card_payment") {
    return "Pending card payment";
  }

  if (status === "zelle_pending") {
    return "Zelle pending";
  }

  return status;
}

function formatMoney(amountCents: number) {
  return `$${(amountCents / 100).toFixed(2)}`;
}

function csvCell(value: string | number | boolean | null | undefined) {
  const text = String(value ?? "");

  return `"${text.replaceAll('"', '""')}"`;
}

function subscriberCsv(subscribers: EmailSubscriberRow[]) {
  const columns = [
    "parent_name",
    "email",
    "phone",
    "player_name",
    "player_age",
    "source",
    "opted_in_at",
    "unsubscribed"
  ];
  const rows = subscribers.map((subscriber) =>
    [
      subscriber.parent_name,
      subscriber.email,
      subscriber.phone,
      subscriber.player_name,
      subscriber.player_age,
      subscriber.source,
      subscriber.opted_in_at,
      subscriber.unsubscribed
    ]
      .map(csvCell)
      .join(",")
  );

  return [columns.join(","), ...rows].join("\n");
}

function downloadTextFile(filename: string, contents: string, mimeType: string) {
  const blob = new Blob([contents], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function normalizeLookupValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function playerDisplayName(name: string) {
  return name.trim().replace(/\s+/g, " ") || "Unknown Player";
}

function playerLookupKey(name: string) {
  return normalizeLookupValue(name) || "unknown-player";
}

function playerFirstName(name: string) {
  return playerDisplayName(name).split(" ")[0] || "Player";
}

function playerParentRecordKey(booking: AdminBookingRecord) {
  return [booking.parent_name, booking.parent_email, booking.parent_phone].map(normalizeLookupValue).join("|");
}

function bookingLookupText(booking: AdminBookingRecord) {
  return [booking.player_name, booking.parent_name, booking.parent_email, booking.parent_phone].map(normalizeLookupValue).join(" ");
}

function sessionPlayerSummary(session: AdminTrainingSession) {
  const names = session.paidBookings.map((booking) => playerFirstName(booking.player_name)).filter(Boolean);

  if (names.length <= 3) {
    return names.join(", ");
  }

  return `${names.slice(0, 3).join(", ")} +${names.length - 3} more`;
}

function sessionBookedPlayersText(session: AdminTrainingSession) {
  const playerLines = session.paidBookings.map((booking, index) =>
    [
      `${index + 1}. ${booking.player_name}`,
      `Parent: ${booking.parent_name}`,
      `Email: ${booking.parent_email}`,
      `Phone: ${booking.parent_phone}`,
      `Payment: ${paymentTypeLabel(booking)}`
    ].join(" | ")
  );

  return [
    `${sessionFocusLabel(session)} - ${formatDateTime(session.start_datetime, session.timezone)} to ${formatTime(
      session.end_datetime,
      session.timezone
    )}`,
    `Booked: ${session.paidPlayers}/${session.capacity}`,
    `Location: ${session.location || business.location}`,
    "",
    playerLines.length > 0 ? playerLines.join("\n") : "No booked players yet."
  ].join("\n");
}

function playerScheduleText(group: PlayerLookupGroup, sessionById: Map<string, AdminTrainingSession>) {
  const lines = group.bookings.map((booking, index) => {
    const session = sessionById.get(booking.session_id);
    const sessionTime = session
      ? `${formatDateTime(session.start_datetime, session.timezone)} to ${formatTime(session.end_datetime, session.timezone)}`
      : "Session not loaded";
    const focus = session ? sessionFocusLabel(session) : "Session not recorded";

    return [
      `${index + 1}. ${sessionTime}`,
      `Focus: ${focus}`,
      `Training group: ${bookingProgramLabel(booking)}`,
      `Booking: ${bookingAdminStatusLabel(booking)}`,
      `Payment: ${paymentTypeLabel(booking)} / ${formatMoney(booking.amount_paid)}`,
      `Waiver: ${booking.waiver?.waiver_signed ? "Signed" : "Missing"}`,
      `Parent on booking: ${booking.parent_name} (${booking.parent_email}, ${booking.parent_phone})`
    ].join(" | ");
  });

  return [`EST CV schedule for ${group.displayName}`, "", lines.length > 0 ? lines.join("\n") : "No bookings found."].join("\n");
}

function bookingWaiverRecordText(booking: AdminBookingRecord, session?: AdminTrainingSession) {
  const waiver = booking.waiver;

  return [
    "Elite Soccer Training CV - Signed Waiver Record",
    "",
    "Business Name: Elite Soccer Training CV",
    `Booking ID: ${booking.id}`,
    `Training Group: ${bookingProgramLabel(booking)}`,
    `Session: ${session ? formatDateTime(session.start_datetime, session.timezone) : "Not recorded"}`,
    `Session Focus: ${session ? sessionFocusLabel(session) : "Not recorded"}`,
    "",
    "Participant Information",
    `Parent/Guardian Name: ${booking.parent_name}`,
    `Player Name: ${booking.player_name}`,
    `Player Age: ${booking.player_age}`,
    `Parent Phone: ${booking.parent_phone}`,
    `Parent Email: ${booking.parent_email}`,
    `Emergency Contact: ${booking.emergency_name || "Not recorded"} - ${booking.emergency_phone || "Not recorded"}`,
    `Medical Conditions/Allergies/Notes: ${booking.medical_notes || waiver?.emergency_medical_notes || "None"}`,
    "",
    "Signed Waiver",
    `Waiver Signed: ${waiver?.waiver_signed ? "Yes" : "Not recorded"}`,
    `Typed Signature: ${waiver?.typed_signature || "Not recorded"}`,
    `Signed Timestamp: ${formatWaiverTimestamp(waiver?.signed_at)}`,
    `Media Consent: ${waiver?.media_consent || "Not recorded"}`,
    `IP Address: ${waiver?.ip_address || "Not collected"}`,
    "",
    "Booking Notes",
    `Notes: ${booking.notes || "None"}`,
    `Payment Status: ${booking.status}`,
    `Payment Type: ${booking.payment_type === "launch_pass_credit" ? "Training credit" : "Single Session"}`,
    `Stripe Checkout Session: ${booking.stripe_checkout_session_id || "Not recorded"}`,
    `Stripe Payment Intent: ${booking.stripe_payment_intent_id || "Not recorded"}`,
    `Google Calendar Event ID: ${booking.calendarEvent?.google_calendar_event_id || "Not recorded"}`,
    `Google Calendar Status: ${booking.calendar_sync_status || "Not recorded"}`,
    `Google Calendar Message: ${booking.calendar_sync_message || "None"}`,
    "",
    "Full Waiver Legal Text Agreed To By Parent/Guardian",
    "",
    ...waiverSections.flatMap((section) => [section.title, section.copy, ""]),
    waiverRecordFooter
  ].join("\n");
}

function printableWaiverHtml(booking: AdminBookingRecord, session?: AdminTrainingSession) {
  return `
    <!doctype html>
    <html>
      <head>
        <title>Elite Soccer Training CV - Signed Waiver Record</title>
        <style>
          body { background:#f4f6f8; color:#06152b; font-family: Arial, sans-serif; margin:0; padding:32px; }
          main { background:#fffdf8; border:1px solid #cbd5e1; margin:0 auto; max-width:820px; padding:42px; }
          h1 { font-size:24px; margin:0 0 8px; }
          pre { color:#334155; font-family: Arial, sans-serif; font-size:13px; line-height:1.65; white-space:pre-wrap; }
          @media print {
            body { background:#fff; padding:0; }
            main { border:0; max-width:none; padding:24px; }
          }
        </style>
      </head>
      <body>
        <main>
          <h1>Elite Soccer Training CV - Signed Waiver Record</h1>
          <pre>${escapeHtml(bookingWaiverRecordText(booking, session))}</pre>
        </main>
      </body>
    </html>
  `;
}

function printWaiverRecord(booking: AdminBookingRecord, session?: AdminTrainingSession) {
  const popup = window.open("", "_blank", "noopener,noreferrer,width=900,height=900");

  if (!popup) {
    return;
  }

  popup.document.write(printableWaiverHtml(booking, session));
  popup.document.close();
  popup.focus();
  popup.print();
}

function downloadWaiverRecord(booking: AdminBookingRecord, session?: AdminTrainingSession) {
  const safeBookingId = booking.id.replace(/[^a-z0-9-]/gi, "-").toLowerCase();

  downloadTextFile(`waiver-record-${safeBookingId}.txt`, bookingWaiverRecordText(booking, session), "text/plain;charset=utf-8");
}

function isFuture(value: string) {
  return new Date(value).getTime() >= Date.now();
}

function isToday(value: string, timeZone = "America/Los_Angeles") {
  return formatDateOnly(value, timeZone) === formatDateOnly(new Date().toISOString(), timeZone);
}

function isThisWeek(value: string) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  const time = new Date(value).getTime();

  return time >= start.getTime() && time < end.getTime();
}

function isThisMonth(value: string) {
  const date = new Date(value);
  const now = new Date();

  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function sessionMatchesFilter(session: AdminTrainingSession, filter: SessionFilter) {
  const focus = sessionFocusLabel(session).toLowerCase();

  if (filter === "all") {
    return true;
  }

  if (filter === "open") {
    return session.status === "open" && session.remainingSpots > 0;
  }

  if (filter === "full") {
    return session.status === "open" && session.remainingSpots <= 0;
  }

  if (filter === "closed") {
    return session.status === "closed";
  }

  if (filter === "cancelled") {
    return session.status === "cancelled";
  }

  if (filter === "technical") {
    return focus.includes("technical") || focus.includes("first touch") || focus.includes("passing");
  }

  if (filter === "defending") {
    return focus.includes("defending");
  }

  if (filter === "shooting-attacking") {
    return focus.includes("shooting / attacking") || focus.includes("attacking");
  }

  if (filter === "shooting-finishing") {
    return focus.includes("shooting & finishing") || focus.includes("finishing");
  }

  return true;
}

function sessionMatchesDateRange(session: AdminTrainingSession, range: SessionDateRange) {
  if (range === "all") {
    return true;
  }

  if (range === "today") {
    return isToday(session.start_datetime, session.timezone);
  }

  if (range === "this-week") {
    return isThisWeek(session.start_datetime);
  }

  if (range === "upcoming") {
    return isFuture(session.start_datetime);
  }

  if (range === "past") {
    return !isFuture(session.start_datetime);
  }

  return true;
}

function playerNamesForDirectPayment(payment: DirectPaymentRow) {
  const first = `${payment.player_first_name} ${payment.player_last_name}`.trim();
  const second = `${payment.second_player_first_name ?? ""} ${payment.second_player_last_name ?? ""}`.trim();

  return [first, payment.player_count === 2 ? second : ""].filter(Boolean).join(" + ");
}

function directPaymentStatusBadge(status: DirectPaymentStatus) {
  if (status === "paid") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "zelle_pending") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (status === "cancelled") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-slate-200 bg-slate-100 text-slate-600";
}

async function readAdminDiagnostics() {
  try {
    const response = await fetch("/api/admin/diagnostics", {
      cache: "no-store"
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as AdminDiagnostics;
  } catch {
    return null;
  }
}

async function readAdminSessions() {
  const response = await fetch(`/api/admin/sessions?fresh=${Date.now()}`, {
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache"
    }
  });
  const result = (await response.json().catch(() => ({}))) as SessionsResponse;

  if (!response.ok) {
    throw new Error(result.error || "Training sessions could not be loaded.");
  }

  return result.sessions ?? [];
}

async function readAdminBookings() {
  const response = await fetch(`/api/admin/bookings?fresh=${Date.now()}`, {
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache"
    }
  });
  const result = (await response.json().catch(() => ({}))) as BookingsResponse;

  if (!response.ok) {
    throw new Error(result.error || "Bookings could not be loaded.");
  }

  return result.bookings ?? [];
}

async function readAdminPasses() {
  const response = await fetch(`/api/admin/passes?fresh=${Date.now()}`, {
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache"
    }
  });
  const result = (await response.json().catch(() => ({}))) as PassesResponse;

  if (!response.ok) {
    throw new Error(result.error || "Training Packages could not be loaded.");
  }

  return result.passes ?? [];
}

async function readAdminDirectPayments() {
  const response = await fetch(`/api/admin/direct-payments?fresh=${Date.now()}`, {
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache"
    }
  });
  const result = (await response.json().catch(() => ({}))) as DirectPaymentsResponse;

  if (!response.ok) {
    throw new Error(result.error || "Direct payment records could not be loaded.");
  }

  return result.directPayments ?? [];
}

async function readAdminEmailSubscribers() {
  const response = await fetch(`/api/admin/email-subscribers?fresh=${Date.now()}`, {
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache"
    }
  });
  const result = (await response.json().catch(() => ({}))) as EmailSubscribersResponse;

  if (!response.ok) {
    throw new Error(result.error || "Email subscribers could not be loaded.");
  }

  return result.subscribers ?? [];
}

async function readAdminPrivateSessionRequests() {
  const response = await fetch(`/api/admin/private-session-requests?fresh=${Date.now()}`, {
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache"
    }
  });
  const result = (await response.json().catch(() => ({}))) as PrivateSessionRequestsResponse;

  if (!response.ok) {
    throw new Error(result.error || "Private session requests could not be loaded.");
  }

  return result.requests ?? [];
}

export function AdminAvailability() {
  const [sessions, setSessions] = useState<AdminTrainingSession[]>([]);
  const [bookings, setBookings] = useState<AdminBookingRecord[]>([]);
  const [passes, setPasses] = useState<AdminPassPurchase[]>([]);
  const [directPayments, setDirectPayments] = useState<DirectPaymentRow[]>([]);
  const [emailSubscribers, setEmailSubscribers] = useState<EmailSubscriberRow[]>([]);
  const [privateSessionRequests, setPrivateSessionRequests] = useState<PrivateSessionRequestRow[]>([]);
  const [activeSection, setActiveSection] = useState<AdminSection>("dashboard");
  const [newGroupId, setNewGroupId] = useState<TrainingGroupId>("elite-performance");
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("17:00");
  const [newTrainingFocus, setNewTrainingFocus] = useState("");
  const [newCapacity, setNewCapacity] = useState(String(slotCapacity));
  const [newLocation, setNewLocation] = useState(business.location);
  const [newStatus, setNewStatus] = useState<"open" | "closed" | "cancelled">("open");
  const [createAnother, setCreateAnother] = useState(true);
  const [showCreateSession, setShowCreateSession] = useState(false);
  const [showBulkCreate, setShowBulkCreate] = useState(false);
  const [bulkStartDate, setBulkStartDate] = useState("");
  const [bulkEndDate, setBulkEndDate] = useState("");
  const [bulkGroupId, setBulkGroupId] = useState<TrainingGroupId>("elite-performance");
  const [bulkCapacity, setBulkCapacity] = useState(String(slotCapacity));
  const [bulkLocation, setBulkLocation] = useState("Desert Christian Academy, 40700 Yucca Lane, Bermuda Dunes, CA 92203");
  const [bulkPatterns, setBulkPatterns] = useState<BulkSessionPattern[]>(defaultBulkPatterns);
  const [bulkPreviewVisible, setBulkPreviewVisible] = useState(false);
  const [blockDate, setBlockDate] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [diagnostics, setDiagnostics] = useState<AdminDiagnostics | null>(null);
  const [activeWaiverRecord, setActiveWaiverRecord] = useState<ActiveWaiverRecord | null>(null);
  const [sessionFilter, setSessionFilter] = useState<SessionFilter>("all");
  const [sessionDateRange, setSessionDateRange] = useState<SessionDateRange>("upcoming");
  const [sessionDateFilter, setSessionDateFilter] = useState("");
  const [expandedSessionId, setExpandedSessionId] = useState("");
  const [activeCalendarSessionId, setActiveCalendarSessionId] = useState("");
  const [calendarView, setCalendarView] = useState<CalendarView>("week");
  const [calendarAnchorDate, setCalendarAnchorDate] = useState(todayDateInput());
  const [actionsSessionId, setActionsSessionId] = useState("");
  const [creditingBookingId, setCreditingBookingId] = useState("");
  const [bookingFilter, setBookingFilter] = useState<BookingFilter>("confirmed");
  const [bookingFocusFilter, setBookingFocusFilter] = useState("");
  const [bookingDateFilter, setBookingDateFilter] = useState("");
  const [expandedBookingId, setExpandedBookingId] = useState("");
  const [updatingBookingId, setUpdatingBookingId] = useState("");
  const [playerLookupSearch, setPlayerLookupSearch] = useState("");
  const [activePlayerLookupKey, setActivePlayerLookupKey] = useState("");
  const [passFilter, setPassFilter] = useState<PassFilter>("active");
  const [manualCreditPassId, setManualCreditPassId] = useState("");
  const [manualCreditAmount, setManualCreditAmount] = useState("1");
  const [manualCreditReason, setManualCreditReason] = useState("Makeup credit");
  const [manualCreditNote, setManualCreditNote] = useState("");
  const [manualCreditSendEmail, setManualCreditSendEmail] = useState(true);
  const [scheduleApprovalPlayerName, setScheduleApprovalPlayerName] = useState("");
  const [scheduleApprovalPlayerAge, setScheduleApprovalPlayerAge] = useState("");
  const [scheduleApprovalParentName, setScheduleApprovalParentName] = useState("");
  const [scheduleApprovalParentEmail, setScheduleApprovalParentEmail] = useState("");
  const [scheduleApprovalParentPhone, setScheduleApprovalParentPhone] = useState("");
  const [scheduleApprovalGroup, setScheduleApprovalGroup] = useState<TrainingGroupId>("elite-performance");
  const [scheduleApprovalAmountPaid, setScheduleApprovalAmountPaid] = useState("285");
  const [scheduleApprovalPaymentMethod, setScheduleApprovalPaymentMethod] = useState<ScheduleApprovalPaymentMethod>("zelle");
  const [scheduleApprovalNote, setScheduleApprovalNote] = useState("");
  const [scheduleApprovalSessionIds, setScheduleApprovalSessionIds] = useState<string[]>([]);
  const [scheduleApprovalUrl, setScheduleApprovalUrl] = useState("");
  const [scheduleApprovalPassId, setScheduleApprovalPassId] = useState("");
  const [scheduleApprovalOverrideCount, setScheduleApprovalOverrideCount] = useState(false);
  const [scheduleApprovalOverrideSessionCount, setScheduleApprovalOverrideSessionCount] = useState("6");
  const [privateRequestScheduleInputs, setPrivateRequestScheduleInputs] = useState<
    Record<string, { date: string; startTime: string; endTime: string; location: string }>
  >({});
  const [directPaymentFilter, setDirectPaymentFilter] = useState<DirectPaymentFilter>("all");
  const [expandedDirectPaymentId, setExpandedDirectPaymentId] = useState("");
  const [activeContactEdit, setActiveContactEdit] = useState<ContactEditState | null>(null);
  const [activeManualBooking, setActiveManualBooking] = useState<ManualBookingModalState | null>(null);
  const [manualBookingForm, setManualBookingForm] = useState<ManualBookingFormState>(defaultManualBookingForm);
  const [manualBookingErrors, setManualBookingErrors] = useState<Record<string, string>>({});
  const [savingManualBooking, setSavingManualBooking] = useState(false);
  const [contactForm, setContactForm] = useState<ContactFormState>({
    parentName: "",
    parentEmail: "",
    parentPhone: "",
    playerName: "",
    playerFirstName: "",
    playerLastName: "",
    playerAge: "",
    secondPlayerFirstName: "",
    secondPlayerLastName: "",
    secondPlayerAge: ""
  });

  async function refreshAdminData(message?: string) {
    try {
      setError("");
      const [
        nextSessions,
        nextBookings,
        nextPasses,
        nextDirectPayments,
        nextEmailSubscribers,
        nextPrivateSessionRequests,
        nextDiagnostics
      ] =
        await Promise.all([
          readAdminSessions(),
          readAdminBookings(),
          readAdminPasses(),
          readAdminDirectPayments(),
          readAdminEmailSubscribers(),
          readAdminPrivateSessionRequests(),
          readAdminDiagnostics()
        ]);

      setSessions(nextSessions);
      setBookings(nextBookings);
      setPasses(nextPasses);
      setDirectPayments(nextDirectPayments);
      setEmailSubscribers(nextEmailSubscribers);
      setPrivateSessionRequests(nextPrivateSessionRequests);
      setDiagnostics(nextDiagnostics);

      if (message) {
        setNotice(message);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Admin data could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refreshAdminData();
  }, []);

  function openManualBookingForm(session: AdminTrainingSession) {
    setManualBookingErrors({});
    setManualBookingForm({
      ...defaultManualBookingForm,
      sendConfirmationEmail: true
    });
    setActiveManualBooking({ mode: "add", session });
  }

  function openEditManualBookingForm(booking: AdminBookingRecord, session?: AdminTrainingSession) {
    setManualBookingErrors({});
    setManualBookingForm({
      playerName: booking.player_name || "",
      playerAge: booking.player_age || "",
      parentName: booking.parent_name || "",
      parentEmail: booking.parent_email || "",
      parentPhone: booking.parent_phone || "",
      emergencyName: booking.emergency_name || "",
      emergencyPhone: booking.emergency_phone || "",
      medicalNotes: booking.medical_notes || "",
      paymentStatus:
        booking.admin_payment_status ||
        (booking.payment_type === "launch_pass_credit" ? "training_credit_used" : booking.status === "paid" ? "paid" : "pending_payment"),
      paymentMethod:
        booking.admin_payment_method ||
        (booking.payment_type === "launch_pass_credit" ? "Training Package credit" : "Other"),
      amountPaid: String((Number(booking.amount_paid) || 0) / 100),
      waiverStatus: booking.waiver_status || (booking.waiver?.waiver_signed ? "signed" : "missing"),
      internalNote: booking.internal_note || booking.notes || "",
      passPurchaseId: booking.pass_purchase_id || "",
      overrideCapacity: Boolean(booking.admin_override_capacity),
      sendConfirmationEmail: false
    });
    setActiveManualBooking({ mode: "edit", booking, session });
  }

  function updateManualBookingField<K extends keyof ManualBookingFormState>(field: K, value: ManualBookingFormState[K]) {
    setManualBookingForm((current) => {
      const next = { ...current, [field]: value };

      if (field === "paymentStatus") {
        if (value === "pending_payment") {
          next.sendConfirmationEmail = false;
        } else if (activeManualBooking?.mode === "add") {
          next.sendConfirmationEmail = true;
        }

        if (value === "comped") {
          next.paymentMethod = "Comped";
          next.amountPaid = "0";
        }

        if (value === "training_credit_used") {
          next.paymentMethod = "Training Package credit";
          next.amountPaid = "0";
        }
      }

      if (field === "paymentMethod") {
        if (value === "Training Package credit") {
          next.paymentStatus = "training_credit_used";
          next.amountPaid = "0";
        }

        if (value === "Comped") {
          next.paymentStatus = "comped";
          next.amountPaid = "0";
        }
      }

      return next;
    });
    setManualBookingErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function validateManualBookingForm() {
    const nextErrors: Record<string, string> = {};

    if (!manualBookingForm.playerName.trim()) nextErrors.playerName = "Player name is required.";
    if (!manualBookingForm.playerAge.trim()) nextErrors.playerAge = "Player age is required.";
    if (!manualBookingForm.parentName.trim()) nextErrors.parentName = "Parent name is required.";
    if (!manualBookingForm.parentEmail.trim()) {
      nextErrors.parentEmail = "Parent email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(manualBookingForm.parentEmail.trim())) {
      nextErrors.parentEmail = "Enter a valid parent email.";
    }
    if (!manualBookingForm.parentPhone.trim()) nextErrors.parentPhone = "Parent phone is required.";
    if (manualBookingForm.paymentMethod === "Training Package credit" && !manualBookingForm.passPurchaseId) {
      nextErrors.passPurchaseId = "Choose a Training Package holder.";
    }
    if (manualBookingForm.paymentStatus === "paid" && Number(manualBookingForm.amountPaid) < 0) {
      nextErrors.amountPaid = "Enter a valid amount paid.";
    }

    setManualBookingErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function manualFieldClass(field: string) {
    return `${inputClass} ${manualBookingErrors[field] ? "border-red-500 bg-red-50 ring-1 ring-red-500" : ""}`;
  }

  function manualFieldError(field: string) {
    return manualBookingErrors[field] ? <p className="text-xs font-bold text-red-700">{manualBookingErrors[field]}</p> : null;
  }

  const sessionById = useMemo(() => new Map(sessions.map((session) => [session.id, session])), [sessions]);
  const activeEmailSubscribers = useMemo(
    () => emailSubscribers.filter((subscriber) => subscriber.opted_in && !subscriber.unsubscribed),
    [emailSubscribers]
  );
  const upcomingBookings = useMemo(
    () =>
      bookings.filter((booking) => {
        const session = sessionById.get(booking.session_id);

        return session ? isFuture(session.start_datetime) && booking.status === "paid" : booking.status === "paid";
      }),
    [bookings, sessionById]
  );
  const spotsBookedThisWeek = useMemo(
    () =>
      sessions
        .filter((session) => isThisWeek(session.start_datetime))
        .reduce((total, session) => total + session.paidPlayers, 0),
    [sessions]
  );
  const activePasses = useMemo(
    () => passes.filter((pass) => pass.status === "paid" && pass.remaining_credits > 0),
    [passes]
  );
  const scheduledPrivateRequests = useMemo(
    () =>
      privateSessionRequests
        .filter((request) => request.scheduled_start)
        .sort((a, b) => String(a.scheduled_start).localeCompare(String(b.scheduled_start)))
        .slice(0, 10),
    [privateSessionRequests]
  );
  const selectedScheduleApprovalPass = useMemo(
    () => activePasses.find((pass) => pass.id === scheduleApprovalPassId) ?? null,
    [activePasses, scheduleApprovalPassId]
  );
  const scheduleApprovalRequiredSessionCount = useMemo(() => {
    if (scheduleApprovalOverrideCount) {
      return Math.max(1, Math.floor(Number(scheduleApprovalOverrideSessionCount) || 1));
    }

    return selectedScheduleApprovalPass?.remaining_credits ?? 6;
  }, [scheduleApprovalOverrideCount, scheduleApprovalOverrideSessionCount, selectedScheduleApprovalPass]);
  const paidPasses = useMemo(() => passes.filter((pass) => pass.status === "paid"), [passes]);
  const selectedManualCreditPass = useMemo(
    () => paidPasses.find((pass) => pass.id === manualCreditPassId) ?? null,
    [manualCreditPassId, paidPasses]
  );
  const manualCreditAmountNumber = Math.max(1, Math.floor(Number(manualCreditAmount) || 1));
  const passCounts = useMemo(
    () => ({
      paid: passes.filter((pass) => pass.status === "paid").length,
      active: activePasses.length,
      remainingCredits: activePasses.reduce((total, pass) => total + (Number(pass.remaining_credits) || 0), 0),
      redemptions: passes.reduce((total, pass) => total + pass.redemptions.length, 0),
      soldThisMonth: passes.filter((pass) => pass.status === "paid" && isThisMonth(pass.created_at)).length
    }),
    [activePasses, passes]
  );
  const directPaymentCounts = useMemo(
    () => ({
      pending: directPayments.filter((payment) => payment.status !== "paid" && payment.status !== "cancelled").length,
      paid: directPayments.filter((payment) => payment.status === "paid").length,
      zellePending: directPayments.filter((payment) => payment.status === "zelle_pending").length
    }),
    [directPayments]
  );
  const counts = useMemo(
    () => ({
      open: sessions.filter((session) => session.status === "open" && session.remainingSpots > 0).length,
      full: sessions.filter((session) => session.status === "open" && session.remainingSpots <= 0).length,
      unavailable: sessions.filter((session) => session.status !== "open").length,
      upcomingBookings: upcomingBookings.length,
      spotsBookedThisWeek,
      pendingZellePayments: directPaymentCounts.zellePending,
      activePasses: passCounts.active,
      privateRequests: privateSessionRequests.filter((request) => request.status === "new").length,
      emailSubscribers: activeEmailSubscribers.length
    }),
    [
      activeEmailSubscribers.length,
      directPaymentCounts.zellePending,
      passCounts.active,
      privateSessionRequests,
      sessions,
      spotsBookedThisWeek,
      upcomingBookings.length
    ]
  );
  const filteredSessions = useMemo(
    () =>
      sessions.filter((session) => {
        const matchesFilter = sessionMatchesFilter(session, sessionFilter);
        const matchesRange = sessionMatchesDateRange(session, sessionDateRange);
        const matchesDate = !sessionDateFilter || formatDateOnly(session.start_datetime, session.timezone) === sessionDateFilter;

        return matchesFilter && matchesRange && matchesDate;
      }),
    [sessionDateFilter, sessionDateRange, sessionFilter, sessions]
  );
  const groupedSessions = useMemo(() => {
    return filteredSessions.reduce<Array<{ key: string; label: string; sessions: AdminTrainingSession[] }>>((groups, session) => {
      const key = formatDateOnly(session.start_datetime, session.timezone);
      const existing = groups.find((group) => group.key === key);

      if (existing) {
        existing.sessions.push(session);
      } else {
        groups.push({
          key,
          label: formatDateHeading(session.start_datetime, session.timezone),
          sessions: [session]
        });
      }

      return groups;
    }, []);
  }, [filteredSessions]);
  const calendarVisibleDays = useMemo(() => {
    if (calendarView === "month") {
      return calendarMonthGridDays(calendarAnchorDate);
    }

    if (calendarView === "day") {
      return [calendarAnchorDate];
    }

    const weekStart = startOfWeekDateInput(calendarAnchorDate);
    return Array.from({ length: 7 }, (_, index) => addDaysToDateInput(weekStart, index));
  }, [calendarAnchorDate, calendarView]);
  const calendarVisibleDaySet = useMemo(() => new Set(calendarVisibleDays), [calendarVisibleDays]);
  const calendarSessionsByDay = useMemo(() => {
    const groups = new Map<string, AdminTrainingSession[]>();

    for (const day of calendarVisibleDays) {
      groups.set(day, []);
    }

    for (const session of sessions) {
      const day = formatDateOnly(session.start_datetime, session.timezone);

      if (calendarVisibleDaySet.has(day)) {
        const daySessions = groups.get(day) ?? [];
        daySessions.push(session);
        groups.set(day, daySessions);
      }
    }

    for (const daySessions of groups.values()) {
      daySessions.sort((a, b) => new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime());
    }

    return groups;
  }, [calendarVisibleDaySet, calendarVisibleDays, sessions]);
  const calendarHours = useMemo(
    () => Array.from({ length: calendarHourEnd - calendarHourStart + 1 }, (_, index) => calendarHourStart + index),
    []
  );
  const calendarRangeLabel = useMemo(() => {
    if (calendarView === "month") {
      return calendarMonthHeading(calendarAnchorDate);
    }

    if (calendarView === "day") {
      return calendarDateHeading(calendarAnchorDate);
    }

    const first = calendarVisibleDays[0];
    const last = calendarVisibleDays[calendarVisibleDays.length - 1];
    return `${calendarDateHeading(first)} - ${calendarDateHeading(last)}`;
  }, [calendarAnchorDate, calendarView, calendarVisibleDays]);
  const selectedCalendarSession = useMemo(
    () => sessions.find((session) => session.id === activeCalendarSessionId) ?? null,
    [activeCalendarSessionId, sessions]
  );
  const bulkPreviewSessions = useMemo<BulkPreviewSession[]>(() => {
    if (!bulkStartDate || !bulkEndDate || bulkPatterns.length === 0) {
      return [];
    }

    const start = dateFromDateInput(bulkStartDate);
    const end = dateFromDateInput(bulkEndDate);

    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start.getTime() > end.getTime()) {
      return [];
    }

    const existingKeys = new Set(sessions.map(existingSessionBulkKey));
    const previewKeys = new Set<string>();
    const preview: BulkPreviewSession[] = [];

    for (let current = new Date(start); current.getTime() <= end.getTime(); current.setUTCDate(current.getUTCDate() + 1)) {
      const dayOfWeek = current.getUTCDay();
      const date = dateInputFromDate(current);
      const matchingPatterns = bulkPatterns.filter((pattern) => pattern.dayOfWeek === dayOfWeek);

      for (const pattern of matchingPatterns) {
        const key = bulkSessionKey({
          trainingGroup: bulkGroupId,
          date,
          startTime: pattern.startTime,
          endTime: pattern.endTime
        });
        const duplicateInPreview = previewKeys.has(key);

        previewKeys.add(key);
        preview.push({
          key,
          date,
          dayLabel: dayLabelFromDateInput(date),
          trainingGroup: bulkGroupId,
          trainingGroupLabel: trainingGroupLabel(bulkGroupId),
          startTime: pattern.startTime,
          endTime: pattern.endTime,
          trainingFocus: pattern.trainingFocus,
          capacity: Math.min(slotCapacity, Math.max(1, Number(bulkCapacity) || slotCapacity)),
          location: bulkLocation.trim() || business.location,
          alreadyExists: existingKeys.has(key),
          duplicateInPreview
        });
      }
    }

    return preview;
  }, [bulkCapacity, bulkEndDate, bulkGroupId, bulkLocation, bulkPatterns, bulkStartDate, sessions]);
  const bulkNewSessionsCount = bulkPreviewSessions.filter((session) => !session.alreadyExists && !session.duplicateInPreview).length;
  const bulkSkippedSessionsCount = bulkPreviewSessions.length - bulkNewSessionsCount;
  const confirmedBookings = useMemo(() => bookings.filter(isBookingConfirmedForAdmin), [bookings]);
  const incompleteBookings = useMemo(() => bookings.filter((booking) => !isBookingConfirmedForAdmin(booking)), [bookings]);
  const filteredBookings = useMemo(
    () =>
      bookings.filter((booking) => {
        const session = sessionById.get(booking.session_id);
        const sessionDate = session?.start_datetime;
        const focus = session ? sessionFocusLabel(session).toLowerCase() : "";
        const isConfirmed = isBookingConfirmedForAdmin(booking);
        const matchesStatus =
          bookingFilter === "all" ||
          (bookingFilter === "confirmed" && isConfirmed) ||
          (bookingFilter === "incomplete" && !isConfirmed) ||
          (bookingFilter === "upcoming" && isConfirmed && (!sessionDate || isFuture(sessionDate))) ||
          (bookingFilter === "past" && isConfirmed && (sessionDate ? !isFuture(sessionDate) : false));
        const matchesFocus = !bookingFocusFilter || focus.includes(bookingFocusFilter.toLowerCase());
        const matchesDate =
          !bookingDateFilter || (session ? formatDateOnly(session.start_datetime, session.timezone) === bookingDateFilter : false);

        return matchesStatus && matchesFocus && matchesDate;
      }),
    [bookingDateFilter, bookingFilter, bookingFocusFilter, bookings, sessionById]
  );
  const playerLookupGroups = useMemo<PlayerLookupGroup[]>(() => {
    const search = normalizeLookupValue(playerLookupSearch);
    const groups = new Map<string, PlayerLookupGroup>();

    for (const booking of bookings) {
      if (search && !bookingLookupText(booking).includes(search)) {
        continue;
      }

      const key = playerLookupKey(booking.player_name);
      const existing = groups.get(key);

      if (existing) {
        existing.bookings.push(booking);
      } else {
        groups.set(key, {
          key,
          displayName: playerDisplayName(booking.player_name),
          bookings: [booking],
          parentRecordCount: 0
        });
      }
    }

    return Array.from(groups.values())
      .map((group) => {
        group.bookings.sort((a, b) => {
          const sessionA = sessionById.get(a.session_id);
          const sessionB = sessionById.get(b.session_id);
          const timeA = sessionA?.start_datetime ?? a.created_at;
          const timeB = sessionB?.start_datetime ?? b.created_at;

          return new Date(timeB).getTime() - new Date(timeA).getTime();
        });
        group.parentRecordCount = new Set(group.bookings.map(playerParentRecordKey)).size;
        return group;
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [bookings, playerLookupSearch, sessionById]);
  const activePlayerLookupGroup = useMemo(
    () => playerLookupGroups.find((group) => group.key === activePlayerLookupKey) ?? playerLookupGroups[0] ?? null,
    [activePlayerLookupKey, playerLookupGroups]
  );
  const activePlayerBookingBuckets = useMemo(() => {
    const buckets = {
      upcoming: [] as AdminBookingRecord[],
      pending: [] as AdminBookingRecord[],
      cancelled: [] as AdminBookingRecord[],
      past: [] as AdminBookingRecord[]
    };

    if (!activePlayerLookupGroup) {
      return buckets;
    }

    for (const booking of activePlayerLookupGroup.bookings) {
      const session = sessionById.get(booking.session_id);

      if (booking.status === "cancelled" || session?.status === "cancelled") {
        buckets.cancelled.push(booking);
      } else if (!isBookingConfirmedForAdmin(booking)) {
        buckets.pending.push(booking);
      } else if (!session?.start_datetime || isFuture(session.start_datetime)) {
        buckets.upcoming.push(booking);
      } else {
        buckets.past.push(booking);
      }
    }

    return buckets;
  }, [activePlayerLookupGroup, sessionById]);
  useEffect(() => {
    if (activePlayerLookupKey && !playerLookupGroups.some((group) => group.key === activePlayerLookupKey)) {
      setActivePlayerLookupKey("");
    }
  }, [activePlayerLookupKey, playerLookupGroups]);
  const filteredPasses = useMemo(
    () =>
      passes.filter((pass) => {
        if (passFilter === "all") {
          return true;
        }

        if (passFilter === "active") {
          return pass.status === "paid" && pass.remaining_credits > 0;
        }

        if (passFilter === "used-up") {
          return pass.status === "paid" && pass.remaining_credits <= 0;
        }

        if (passFilter === "four") {
          return pass.pass_type === "four_session_launch_pass";
        }

        if (passFilter === "six") {
          return pass.pass_type === "six_session_launch_pass";
        }

        return true;
      }),
    [passFilter, passes]
  );
  const filteredDirectPayments = useMemo(
    () =>
      directPayments.filter((payment) => {
        if (directPaymentFilter === "all") {
          return true;
        }

        if (directPaymentFilter === "zelle-pending") {
          return payment.status === "zelle_pending";
        }

        if (directPaymentFilter === "card-paid") {
          return payment.status === "paid" && payment.payment_method === "card";
        }

        if (directPaymentFilter === "pending-card") {
          return payment.status === "pending_card_payment";
        }

        if (directPaymentFilter === "single-session") {
          return payment.payment_option === "single_session";
        }

        if (directPaymentFilter === "four-pass") {
          return payment.payment_option === "four_session_launch_pass";
        }

        if (directPaymentFilter === "six-pass") {
          return payment.payment_option === "six_session_launch_pass";
        }

        return true;
      }),
    [directPaymentFilter, directPayments]
  );
  const upcomingSessionsPreview = useMemo(
    () => sessions.filter((session) => session.status === "open" && isFuture(session.start_datetime)).slice(0, 5),
    [sessions]
  );
  const recentBookingsPreview = useMemo(() => bookings.slice(0, 5), [bookings]);
  const pendingPaymentsPreview = useMemo(
    () => directPayments.filter((payment) => payment.status === "zelle_pending" || payment.status === "pending_card_payment").slice(0, 5),
    [directPayments]
  );
  const scheduleApprovalSessions = useMemo(
    () =>
      sessions
        .filter(
          (session) =>
            session.training_group === scheduleApprovalGroup &&
            session.status === "open" &&
            session.remainingSpots > 0 &&
            isFuture(session.start_datetime)
        )
        .slice(0, 30),
    [scheduleApprovalGroup, sessions]
  );

  async function addSession() {
    if (!newDate || !newTime) {
      setError("Choose a date and start time before adding a session.");
      return;
    }

    setIsSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/admin/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          trainingGroup: newGroupId,
          date: newDate,
          time: newTime,
          trainingFocus: newTrainingFocus.trim() || null,
          capacity: Math.min(slotCapacity, Math.max(1, Number(newCapacity) || slotCapacity)),
          location: newLocation,
          status: newStatus
        })
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(result.error || "The session could not be added.");
      }

      if (!createAnother) {
        setShowCreateSession(false);
      }

      await refreshAdminData("Training session added to Supabase availability.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The session could not be added.");
    } finally {
      setIsSaving(false);
    }
  }

  function updateBulkPattern(id: string, updates: Partial<BulkSessionPattern>) {
    setBulkPatterns((current) =>
      current.map((pattern) => (pattern.id === id ? { ...pattern, ...updates } : pattern))
    );
    setBulkPreviewVisible(false);
  }

  function addBulkPattern() {
    setBulkPatterns((current) => [
      ...current,
      {
        id: `pattern-${Date.now()}`,
        dayOfWeek: 1,
        startTime: "06:00",
        endTime: "07:00",
        trainingFocus: "General Training"
      }
    ]);
    setBulkPreviewVisible(false);
  }

  function removeBulkPattern(id: string) {
    setBulkPatterns((current) => current.filter((pattern) => pattern.id !== id));
    setBulkPreviewVisible(false);
  }

  function previewBulkSchedule() {
    setError("");
    setNotice("");

    if (!bulkStartDate || !bulkEndDate) {
      setError("Choose a start date and end date for the bulk schedule.");
      return;
    }

    if (dateFromDateInput(bulkStartDate).getTime() > dateFromDateInput(bulkEndDate).getTime()) {
      setError("The bulk schedule end date must be after the start date.");
      return;
    }

    if (bulkPatterns.length === 0) {
      setError("Add at least one weekly session pattern.");
      return;
    }

    if (bulkPatterns.some((pattern) => pattern.endTime <= pattern.startTime)) {
      setError("Each weekly pattern needs an end time after its start time.");
      return;
    }

    if (bulkPreviewSessions.length === 0) {
      setError("No sessions match this date range and weekly pattern.");
      return;
    }

    setBulkPreviewVisible(true);
  }

  async function createBulkSessions() {
    if (!bulkPreviewVisible || bulkPreviewSessions.length === 0) {
      previewBulkSchedule();
      return;
    }

    setIsSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/admin/sessions/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sessions: bulkPreviewSessions.map((session) => ({
            trainingGroup: session.trainingGroup,
            date: session.date,
            time: session.startTime,
            endTime: session.endTime,
            trainingFocus: session.trainingFocus === "General Training" ? null : session.trainingFocus,
            capacity: session.capacity,
            location: session.location,
            status: "open"
          }))
        })
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        createdCount?: number;
        skippedCount?: number;
      };

      if (!response.ok) {
        throw new Error(result.error || "Bulk sessions could not be created.");
      }

      await refreshAdminData(
        `Created ${result.createdCount ?? 0} sessions. Skipped ${result.skippedCount ?? 0} existing sessions.`
      );
      setBulkPreviewVisible(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Bulk sessions could not be created.");
    } finally {
      setIsSaving(false);
    }
  }

  async function updateSession(
    id: string,
    updates: { status?: "open" | "closed" | "cancelled"; capacity?: number; location?: string; training_focus?: string | null }
  ) {
    setIsSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/admin/sessions/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(updates)
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(result.error || "The session could not be updated.");
      }

      await refreshAdminData(result.message || "Training session updated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The session could not be updated.");
    } finally {
      setIsSaving(false);
    }
  }

  async function issueMakeupCredit(booking: AdminBookingRecord) {
    if (!window.confirm(`Add 1 Training credit back for ${booking.player_name} and notify the parent?`)) {
      return;
    }

    setCreditingBookingId(booking.id);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/admin/credits/makeup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ bookingId: booking.id })
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(result.error || "Makeup credit could not be issued.");
      }

      await refreshAdminData(result.message || "1 credit was added back and the parent was notified.");
    } catch (creditError) {
      setError(creditError instanceof Error ? creditError.message : "Makeup credit could not be issued.");
    } finally {
      setCreditingBookingId("");
    }
  }

  async function saveManualBooking() {
    if (!activeManualBooking || !validateManualBookingForm()) {
      return;
    }

    setSavingManualBooking(true);
    setError("");
    setNotice("");

    const amountPaid = Math.round(Math.max(0, Number(manualBookingForm.amountPaid) || 0) * 100);

    try {
      if (activeManualBooking.mode === "add") {
        const response = await fetch("/api/admin/bookings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            sessionId: activeManualBooking.session.id,
            playerName: manualBookingForm.playerName,
            playerAge: manualBookingForm.playerAge,
            parentName: manualBookingForm.parentName,
            parentEmail: manualBookingForm.parentEmail,
            parentPhone: manualBookingForm.parentPhone,
            emergencyName: manualBookingForm.emergencyName,
            emergencyPhone: manualBookingForm.emergencyPhone,
            medicalNotes: manualBookingForm.medicalNotes,
            paymentStatus: manualBookingForm.paymentStatus,
            paymentMethod: manualBookingForm.paymentMethod,
            amountPaid,
            waiverStatus: manualBookingForm.waiverStatus,
            internalNote: manualBookingForm.internalNote,
            passPurchaseId: manualBookingForm.passPurchaseId,
            overrideCapacity: manualBookingForm.overrideCapacity,
            sendConfirmationEmail: manualBookingForm.sendConfirmationEmail
          })
        });
        const result = (await response.json().catch(() => ({}))) as { error?: string; message?: string };

        if (!response.ok) {
          throw new Error(result.error || "Manual booking could not be saved.");
        }

        setActiveManualBooking(null);
        await refreshAdminData(result.message || "Manual booking saved.");
        return;
      }

      const response = await fetch(`/api/admin/bookings/${encodeURIComponent(activeManualBooking.booking.id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "update_manual_booking",
          updates: {
            playerName: manualBookingForm.playerName,
            playerAge: manualBookingForm.playerAge,
            parentName: manualBookingForm.parentName,
            parentEmail: manualBookingForm.parentEmail,
            parentPhone: manualBookingForm.parentPhone,
            paymentStatus: manualBookingForm.paymentStatus,
            paymentMethod: manualBookingForm.paymentMethod,
            amountPaid,
            waiverStatus: manualBookingForm.waiverStatus,
            medicalNotes: manualBookingForm.medicalNotes,
            emergencyName: manualBookingForm.emergencyName,
            emergencyPhone: manualBookingForm.emergencyPhone,
            internalNote: manualBookingForm.internalNote
          }
        })
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(result.error || "Booking could not be updated.");
      }

      setActiveManualBooking(null);
      await refreshAdminData(result.message || "Contact information updated successfully.");
    } catch (manualError) {
      setError(manualError instanceof Error ? manualError.message : "Manual booking could not be saved.");
    } finally {
      setSavingManualBooking(false);
    }
  }

  async function cancelAdminPlayerBooking(booking: AdminBookingRecord) {
    const isCreditBooking =
      booking.payment_type === "launch_pass_credit" || Boolean(booking.pass_purchase_id) || Boolean(booking.credit_redemption_id);
    const returnCredit =
      isCreditBooking &&
      !booking.creditAdjustment &&
      window.confirm(`This booking used a Training Package credit. Return 1 credit to ${booking.player_name}'s package?`);

    if (!window.confirm(`Remove/cancel ${booking.player_name} from this session?`)) {
      return;
    }

    setUpdatingBookingId(booking.id);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/admin/bookings/${encodeURIComponent(booking.id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "cancel_booking",
          returnCredit
        })
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(result.error || "Booking could not be cancelled.");
      }

      await refreshAdminData(result.message || "Player removed from session.");
    } catch (bookingError) {
      setError(bookingError instanceof Error ? bookingError.message : "Booking could not be cancelled.");
    } finally {
      setUpdatingBookingId("");
    }
  }

  async function resendBookingConfirmation(booking: AdminBookingRecord) {
    if (!window.confirm(`Resend confirmation email for ${booking.player_name} to the parent and admin?`)) {
      return;
    }

    setUpdatingBookingId(booking.id);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/admin/bookings/${encodeURIComponent(booking.id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "resend_confirmation"
        })
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(result.error || "Confirmation email could not be resent.");
      }

      await refreshAdminData(result.message || "Confirmation email was attempted.");
    } catch (bookingError) {
      setError(bookingError instanceof Error ? bookingError.message : "Confirmation email could not be resent.");
    } finally {
      setUpdatingBookingId("");
    }
  }

  async function retryBookingCalendarSync(booking: AdminBookingRecord) {
    setUpdatingBookingId(booking.id);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/admin/bookings/${encodeURIComponent(booking.id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "retry_calendar_sync"
        })
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(result.error || "Google Calendar sync could not be retried.");
      }

      await refreshAdminData(result.message || "Google Calendar sync was attempted.");
    } catch (bookingError) {
      setError(bookingError instanceof Error ? bookingError.message : "Google Calendar sync could not be retried.");
    } finally {
      setUpdatingBookingId("");
    }
  }

  async function markBookingManuallyPaid(booking: AdminBookingRecord) {
    if (!booking.waiver?.waiver_signed) {
      setError("This booking has no signed waiver yet, so it cannot be manually confirmed.");
      return;
    }

    const defaultAmount = Math.max(1, Number(booking.player_count) || 1) * 55;
    const enteredAmount = window.prompt(
      `Enter the amount collected for ${booking.player_name} before confirming this booking.`,
      String(defaultAmount)
    );

    if (enteredAmount === null) {
      return;
    }

    const amountDollars = Number(enteredAmount);

    if (!Number.isFinite(amountDollars) || amountDollars <= 0) {
      setError("Enter a valid amount before marking the booking manually paid.");
      return;
    }

    if (
      !window.confirm(
        `Mark ${booking.player_name}'s booking manually paid for ${formatMoney(Math.round(amountDollars * 100))}?\n\nThis will attempt confirmation email and Google Calendar sync.`
      )
    ) {
      return;
    }

    setUpdatingBookingId(booking.id);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/admin/bookings/${encodeURIComponent(booking.id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "mark_manually_paid",
          amountPaid: Math.round(amountDollars * 100)
        })
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(result.error || "Booking could not be marked manually paid.");
      }

      await refreshAdminData(result.message || "Booking marked manually paid.");
    } catch (bookingError) {
      setError(bookingError instanceof Error ? bookingError.message : "Booking could not be marked manually paid.");
    } finally {
      setUpdatingBookingId("");
    }
  }

  async function cancelIncompleteBooking(booking: AdminBookingRecord) {
    if (!window.confirm(`Cancel this incomplete booking for ${booking.player_name}?`)) {
      return;
    }

    setUpdatingBookingId(booking.id);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/admin/bookings/${encodeURIComponent(booking.id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "cancel_incomplete"
        })
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(result.error || "Incomplete booking could not be cancelled.");
      }

      await refreshAdminData(result.message || "Incomplete booking cancelled.");
    } catch (bookingError) {
      setError(bookingError instanceof Error ? bookingError.message : "Incomplete booking could not be cancelled.");
    } finally {
      setUpdatingBookingId("");
    }
  }

  async function deleteIncompleteBooking(booking: AdminBookingRecord) {
    if (!window.confirm(`Delete this incomplete booking for ${booking.player_name}? This cannot be undone.`)) {
      return;
    }

    setUpdatingBookingId(booking.id);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/admin/bookings/${encodeURIComponent(booking.id)}`, {
        method: "DELETE"
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(result.error || "Incomplete booking could not be deleted.");
      }

      await refreshAdminData(result.message || "Incomplete booking deleted.");
    } catch (bookingError) {
      setError(bookingError instanceof Error ? bookingError.message : "Incomplete booking could not be deleted.");
    } finally {
      setUpdatingBookingId("");
    }
  }

  async function addManualCredit() {
    if (!selectedManualCreditPass) {
      setError("Choose a Training Package before adding manual credit.");
      return;
    }

    const nextRemaining = selectedManualCreditPass.remaining_credits + manualCreditAmountNumber;
    const confirmed = window.confirm(
      `Add ${manualCreditAmountNumber} credit${manualCreditAmountNumber === 1 ? "" : "s"} to ${selectedManualCreditPass.player_name}'s Training Package?\n\nCurrent credits: ${selectedManualCreditPass.remaining_credits}\nNew credits: ${nextRemaining}`
    );

    if (!confirmed) {
      return;
    }

    setIsSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/admin/credits/manual", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          passPurchaseId: selectedManualCreditPass.id,
          creditAmount: manualCreditAmountNumber,
          reason: manualCreditReason,
          note: manualCreditNote,
          sendEmail: manualCreditSendEmail
        })
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(result.error || "Manual credit could not be added.");
      }

      setManualCreditAmount("1");
      setManualCreditReason("Makeup credit");
      setManualCreditNote("");
      setManualCreditSendEmail(true);
      await refreshAdminData(result.message || "Manual credit added.");
    } catch (creditError) {
      setError(creditError instanceof Error ? creditError.message : "Manual credit could not be added.");
    } finally {
      setIsSaving(false);
    }
  }

  function toggleScheduleApprovalSession(sessionId: string) {
    setScheduleApprovalUrl("");
    setScheduleApprovalSessionIds((current) => {
      if (current.includes(sessionId)) {
        return current.filter((id) => id !== sessionId);
      }

      if (current.length >= scheduleApprovalRequiredSessionCount) {
        setError(`Choose ${scheduleApprovalRequiredSessionCount} sessions. Remove one before adding another.`);
        return current;
      }

      setError("");
      return [...current, sessionId];
    });
  }

  function selectScheduleApprovalPass(passId: string) {
    setScheduleApprovalPassId(passId);
    setScheduleApprovalSessionIds([]);
    setScheduleApprovalUrl("");

    if (!passId) {
      setScheduleApprovalPlayerName("");
      setScheduleApprovalPlayerAge("");
      setScheduleApprovalParentName("");
      setScheduleApprovalParentEmail("");
      setScheduleApprovalParentPhone("");
      setScheduleApprovalGroup("elite-performance");
      setScheduleApprovalAmountPaid("285");
      setScheduleApprovalPaymentMethod("zelle");
      return;
    }

    const pass = activePasses.find((item) => item.id === passId);

    if (!pass) {
      return;
    }

    setScheduleApprovalPlayerName(pass.player_name);
    setScheduleApprovalPlayerAge(pass.player_age);
    setScheduleApprovalParentName(pass.parent_name);
    setScheduleApprovalParentEmail(pass.parent_email);
    setScheduleApprovalParentPhone(pass.parent_phone);
    setScheduleApprovalGroup(pass.training_group);
    setScheduleApprovalAmountPaid(String((Number(pass.amount_paid) || 0) / 100));
    setScheduleApprovalPaymentMethod("other");
  }

  async function createScheduleApprovalLink() {
    if (
      !scheduleApprovalPlayerName.trim() ||
      !scheduleApprovalPlayerAge.trim() ||
      !scheduleApprovalParentName.trim() ||
      !scheduleApprovalParentEmail.trim() ||
      !scheduleApprovalParentPhone.trim()
    ) {
      setError("Complete the player and parent details before creating the schedule link.");
      return;
    }

    if (scheduleApprovalSessionIds.length !== scheduleApprovalRequiredSessionCount) {
      setError(`Choose exactly ${scheduleApprovalRequiredSessionCount} proposed sessions for this schedule approval link.`);
      return;
    }

    setIsSaving(true);
    setError("");
    setNotice("");
    setScheduleApprovalUrl("");

    try {
      const response = await fetch("/api/admin/schedule-approvals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          playerName: scheduleApprovalPlayerName,
          playerAge: scheduleApprovalPlayerAge,
          parentName: scheduleApprovalParentName,
          parentEmail: scheduleApprovalParentEmail,
          parentPhone: scheduleApprovalParentPhone,
          trainingGroup: scheduleApprovalGroup,
          amountPaid: Number(scheduleApprovalAmountPaid) || 0,
          paymentMethod: scheduleApprovalPaymentMethod,
          internalNote: scheduleApprovalNote,
          proposedSessionIds: scheduleApprovalSessionIds,
          passPurchaseId: scheduleApprovalPassId || undefined,
          overrideSessionCount: scheduleApprovalOverrideCount ? scheduleApprovalRequiredSessionCount : undefined
        })
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        confirmationUrl?: string;
        emailSent?: boolean;
        emailMessage?: string;
      };

      if (!response.ok) {
        throw new Error(result.error || "Schedule approval link could not be created.");
      }

      setScheduleApprovalUrl(result.confirmationUrl || "");
      setScheduleApprovalPlayerName("");
      setScheduleApprovalPlayerAge("");
      setScheduleApprovalParentName("");
      setScheduleApprovalParentEmail("");
      setScheduleApprovalParentPhone("");
      setScheduleApprovalAmountPaid("285");
      setScheduleApprovalPaymentMethod("zelle");
      setScheduleApprovalNote("");
      setScheduleApprovalSessionIds([]);
      setScheduleApprovalPassId("");
      setScheduleApprovalOverrideCount(false);
      setScheduleApprovalOverrideSessionCount("6");
      await refreshAdminData(
        result.emailSent
          ? "Private schedule confirmation link created and emailed to the parent."
          : `Private schedule confirmation link created. Copy and send the link manually.${result.emailMessage ? ` ${result.emailMessage}` : ""}`
      );
      setScheduleApprovalUrl(result.confirmationUrl || "");
    } catch (approvalError) {
      setError(approvalError instanceof Error ? approvalError.message : "Schedule approval link could not be created.");
    } finally {
      setIsSaving(false);
    }
  }

  function updatePrivateRequestScheduleInput(
    request: PrivateSessionRequestRow,
    updates: Partial<{ date: string; startTime: string; endTime: string; location: string }>
  ) {
    const existing = privateRequestScheduleInputs[request.id] ?? {
      date: request.scheduled_start ? formatDateOnly(request.scheduled_start, request.timezone) : "",
      startTime: request.scheduled_start ? formatTimeInput(request.scheduled_start, request.timezone) : "17:00",
      endTime: request.scheduled_end ? formatTimeInput(request.scheduled_end, request.timezone) : "18:00",
      location: request.location || business.location
    };

    setPrivateRequestScheduleInputs((current) => ({
      ...current,
      [request.id]: {
        ...existing,
        ...updates
      }
    }));
  }

  async function updatePrivateRequestStatus(requestId: string, status: PrivateSessionRequestStatus) {
    setIsSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/admin/private-session-requests/${requestId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ status })
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error || "Private request status could not be updated.");
      }

      await refreshAdminData("Private request updated.");
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Private request status could not be updated.");
    } finally {
      setIsSaving(false);
    }
  }

  async function schedulePrivateRequest(request: PrivateSessionRequestRow) {
    const input = privateRequestScheduleInputs[request.id] ?? {
      date: request.scheduled_start ? formatDateOnly(request.scheduled_start, request.timezone) : "",
      startTime: request.scheduled_start ? formatTimeInput(request.scheduled_start, request.timezone) : "17:00",
      endTime: request.scheduled_end ? formatTimeInput(request.scheduled_end, request.timezone) : "18:00",
      location: request.location || business.location
    };

    if (!input.date || !input.startTime) {
      setError("Choose a date and start time before scheduling the private session.");
      return;
    }

    setIsSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/admin/private-session-requests/${request.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(input)
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string; request?: PrivateSessionRequestRow };

      if (!response.ok) {
        throw new Error(result.error || "Private session could not be scheduled.");
      }

      await refreshAdminData(
        result.request?.calendar_status === "Failed"
          ? "Private session scheduled, but Google Calendar needs attention."
          : "Private session scheduled and synced if Google Calendar is configured."
      );
    } catch (scheduleError) {
      setError(scheduleError instanceof Error ? scheduleError.message : "Private session could not be scheduled.");
    } finally {
      setIsSaving(false);
    }
  }

  function openContactEdit(state: ContactEditState, form: Partial<ContactFormState>) {
    setActiveContactEdit(state);
    setContactForm({
      parentName: form.parentName || "",
      parentEmail: form.parentEmail || "",
      parentPhone: form.parentPhone || "",
      playerName: form.playerName || "",
      playerFirstName: form.playerFirstName || "",
      playerLastName: form.playerLastName || "",
      playerAge: form.playerAge || "",
      secondPlayerFirstName: form.secondPlayerFirstName || "",
      secondPlayerLastName: form.secondPlayerLastName || "",
      secondPlayerAge: form.secondPlayerAge || ""
    });
  }

  function editBookingContact(booking: AdminBookingRecord) {
    openContactEdit(
      {
        recordType: "booking",
        id: booking.id,
        title: `Edit ${booking.player_name}`,
        showPlayerFullName: true
      },
      {
        parentName: booking.parent_name,
        parentEmail: booking.parent_email,
        parentPhone: booking.parent_phone,
        playerName: booking.player_name,
        playerAge: booking.player_age
      }
    );
  }

  function editPassContact(pass: AdminPassPurchase) {
    openContactEdit(
      {
        recordType: "pass",
        id: pass.id,
        title: `Edit ${pass.player_name}`,
        showPlayerFullName: true
      },
      {
        parentName: pass.parent_name,
        parentEmail: pass.parent_email,
        parentPhone: pass.parent_phone,
        playerName: pass.player_name,
        playerAge: pass.player_age
      }
    );
  }

  function editDirectPaymentContact(payment: DirectPaymentRow) {
    openContactEdit(
      {
        recordType: "direct_payment",
        id: payment.id,
        title: `Edit ${playerNamesForDirectPayment(payment)}`,
        showPlayerSplitName: true,
        showSecondPlayer: payment.player_count === 2
      },
      {
        parentName: payment.parent_name,
        parentEmail: payment.parent_email,
        parentPhone: payment.parent_phone,
        playerFirstName: payment.player_first_name,
        playerLastName: payment.player_last_name,
        playerAge: payment.player_age,
        secondPlayerFirstName: payment.second_player_first_name || "",
        secondPlayerLastName: payment.second_player_last_name || "",
        secondPlayerAge: payment.second_player_age || ""
      }
    );
  }

  function editEmailSubscriberContact(subscriber: EmailSubscriberRow) {
    openContactEdit(
      {
        recordType: "email_subscriber",
        id: subscriber.id,
        title: `Edit ${subscriber.parent_name || subscriber.email}`,
        showPlayerFullName: true
      },
      {
        parentName: subscriber.parent_name || "",
        parentEmail: subscriber.email,
        parentPhone: subscriber.phone || "",
        playerName: subscriber.player_name || "",
        playerAge: subscriber.player_age || ""
      }
    );
  }

  async function saveContactInfo() {
    if (!activeContactEdit) {
      return;
    }

    if (!contactForm.parentEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactForm.parentEmail.trim())) {
      setError("Enter a valid parent email before saving contact information.");
      return;
    }

    setIsSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/admin/contact-info", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          recordType: activeContactEdit.recordType,
          id: activeContactEdit.id,
          ...contactForm
        })
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string; message?: string };

      if (!response.ok) {
        throw new Error(result.error || "Contact information could not be updated.");
      }

      setActiveContactEdit(null);
      await refreshAdminData(result.message || "Contact information updated successfully.");
    } catch (contactError) {
      setError(contactError instanceof Error ? contactError.message : "Contact information could not be updated.");
    } finally {
      setIsSaving(false);
    }
  }

  async function removeSession(session: AdminTrainingSession) {
    if (session.paidBookings.length > 0) {
      const confirmedBookedDelete = window.confirm(
        "This session has bookings. Closing or cancelling is safer. Are you sure you want to delete it?"
      );

      if (!confirmedBookedDelete) {
        return;
      }
    } else if (!window.confirm("Delete this session? This cannot be undone.")) {
      return;
    }

    setIsSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/admin/sessions/${encodeURIComponent(session.id)}`, {
        method: "DELETE"
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error || "The session could not be deleted.");
      }

      await refreshAdminData("Training session deleted.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The session could not be deleted.");
    } finally {
      setIsSaving(false);
    }
  }

  async function closeSessionsOnDate() {
    if (!blockDate) {
      setError("Choose a date before closing sessions.");
      return;
    }

    const sessionsForDate = sessions.filter((session) => formatDateOnly(session.start_datetime, session.timezone) === blockDate);

    if (sessionsForDate.length === 0) {
      setNotice("No sessions exist for that date.");
      return;
    }

    setIsSaving(true);
    setError("");
    setNotice("");

    try {
      await Promise.all(sessionsForDate.map((session) => updateSession(session.id, { status: "closed" })));
      await refreshAdminData("All sessions on that date were closed.");
    } finally {
      setIsSaving(false);
    }
  }

  function duplicateSession(session: AdminTrainingSession) {
    setNewGroupId(session.training_group);
    setNewDate(formatDateOnly(session.start_datetime, session.timezone));
    setNewTime(formatTimeInput(session.start_datetime, session.timezone));
    setNewTrainingFocus(session.training_focus || "");
    setNewCapacity(String(session.capacity || slotCapacity));
    setNewLocation(session.location || business.location);
    setNewStatus(session.status);
    setCreateAnother(true);
    setShowCreateSession(true);
    setActiveSection("sessions");
    setNotice("Session copied into the Create New Session form. Adjust the date/time, then save.");
  }

  function editCapacity(session: AdminTrainingSession) {
    const nextCapacity = window.prompt("Set session capacity. Max is 6 players.", String(session.capacity));

    if (nextCapacity === null) {
      return;
    }

    const parsedCapacity = Math.min(slotCapacity, Math.max(1, Number(nextCapacity) || session.capacity));
    void updateSession(session.id, { capacity: parsedCapacity });
  }

  function editLocation(session: AdminTrainingSession) {
    const nextLocation = window.prompt("Set session location.", session.location || business.location);

    if (nextLocation === null) {
      return;
    }

    void updateSession(session.id, { location: nextLocation.trim() || business.location });
  }

  function editSessionFocus(session: AdminTrainingSession) {
    const nextFocus = window.prompt("Set session focus. Leave blank for General Training.", session.training_focus || "");

    if (nextFocus === null) {
      return;
    }

    void updateSession(session.id, { training_focus: nextFocus.trim() || null });
  }

  async function updateDirectPayment(id: string, status: DirectPaymentStatus) {
    setIsSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/admin/direct-payments/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ status })
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error || "Direct payment record could not be updated.");
      }

      await refreshAdminData("Direct payment record updated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Direct payment record could not be updated.");
    } finally {
      setIsSaving(false);
    }
  }

  async function updateEmailSubscriber(id: string, unsubscribed: boolean) {
    setIsSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/admin/email-subscribers/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ unsubscribed })
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error || "Email subscriber could not be updated.");
      }

      await refreshAdminData(unsubscribed ? "Subscriber marked unsubscribed." : "Subscriber reactivated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Email subscriber could not be updated.");
    } finally {
      setIsSaving(false);
    }
  }

  async function removeEmailSubscriber(id: string) {
    if (!window.confirm("Remove this subscriber from the admin list?")) {
      return;
    }

    setIsSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/admin/email-subscribers/${encodeURIComponent(id)}`, {
        method: "DELETE"
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error || "Email subscriber could not be removed.");
      }

      await refreshAdminData("Subscriber removed.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Email subscriber could not be removed.");
    } finally {
      setIsSaving(false);
    }
  }

  function exportEmailSubscribersCsv() {
    downloadTextFile(
      "est-cv-brevo-email-subscribers.csv",
      subscriberCsv(activeEmailSubscribers),
      "text/csv;charset=utf-8"
    );
  }

  async function copyBookedPlayers(session: AdminTrainingSession) {
    try {
      await copyTextToClipboard(sessionBookedPlayersText(session));
      setNotice("Booked player list copied.");
      setError("");
    } catch {
      setError("Booked player list could not be copied.");
    }
  }

  async function copyPlayerSchedule(group: PlayerLookupGroup) {
    try {
      await copyTextToClipboard(playerScheduleText(group, sessionById));
      setNotice(`${group.displayName}'s schedule copied.`);
      setError("");
    } catch {
      setError("Player schedule could not be copied.");
    }
  }

  function moveCalendar(direction: "previous" | "next") {
    const multiplier = direction === "next" ? 1 : -1;

    if (calendarView === "month") {
      const date = dateFromDateInput(calendarAnchorDate);
      date.setUTCMonth(date.getUTCMonth() + multiplier);
      setCalendarAnchorDate(dateInputFromDate(date));
      return;
    }

    setCalendarAnchorDate(addDaysToDateInput(calendarAnchorDate, calendarView === "week" ? 7 * multiplier : multiplier));
  }

  return (
    <div className="grid gap-6">
      <section className="panel p-5 sm:p-8">
        <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-start">
          <div>
            <p className="text-sm font-black uppercase text-electric">Admin Dashboard</p>
            <h2 className="mt-2 text-3xl font-black text-navy">Manage EST CV quickly.</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Create openings, review bookings, track payments, manage training credits, and export your email list.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshAdminData("Admin data refreshed.")}
            className={secondaryButtonClass}
          >
            Refresh
          </button>
        </div>

        <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          {adminSections.map((section) => {
            const isActive = activeSection === section.id;

            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id)}
                className={`rounded-lg border p-4 text-left transition ${
                  isActive
                    ? "border-electric bg-blue-50 shadow-sm"
                    : "border-slate-200 bg-white hover:border-electric/50"
                }`}
              >
                <span className="block text-sm font-black text-navy">{section.label}</span>
                <span className="mt-1 block text-[11px] font-bold uppercase text-slate-500">{section.note}</span>
              </button>
            );
          })}
        </div>

        {isLoading ? (
          <p className="mt-5 rounded-md bg-mist p-3 text-sm font-bold text-slate-600">Loading admin data...</p>
        ) : null}
        {notice ? <p className="mt-5 rounded-md bg-field/10 p-3 text-sm font-bold text-field">{notice}</p> : null}
        {error ? <p className="mt-5 rounded-md bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}

        {diagnostics?.stripe?.stripeMode === "test" ? (
          <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm font-black uppercase tracking-wide text-amber-800">
            TEST MODE ACTIVE
          </div>
        ) : null}
      </section>

      {activeSection === "dashboard" ? (
        <section className="grid gap-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            {[
              ["Open Sessions", counts.open],
              ["Upcoming Bookings", counts.upcomingBookings],
              ["Spots This Week", counts.spotsBookedThisWeek],
              ["Pending Zelle", counts.pendingZellePayments],
              ["Active Packages", counts.activePasses],
              ["Private Requests", counts.privateRequests],
              ["Email Subscribers", counts.emailSubscribers]
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-3xl font-black text-navy">{value}</p>
                <p className="mt-1 text-xs font-black uppercase text-slate-500">{label}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <div className="panel p-5">
              <p className="text-xs font-black uppercase text-electric">Today / This Week</p>
              <h3 className="mt-2 text-xl font-black text-navy">Upcoming sessions</h3>
              <div className="mt-4 grid gap-3">
                {upcomingSessionsPreview.length > 0 ? (
                  upcomingSessionsPreview.map((session) => (
                    <div key={session.id} className="rounded-lg border border-slate-200 bg-mist p-4">
                      <p className="font-black text-navy">{formatDateTime(session.start_datetime, session.timezone)}</p>
                      <p className="mt-1 text-sm text-slate-600">{sessionFocusLabel(session)}</p>
                      <p className="mt-1 text-xs font-bold uppercase text-slate-500">{session.remainingSpots} spots remaining</p>
                    </div>
                  ))
                ) : (
                  <p className="rounded-lg border border-slate-200 bg-mist p-4 text-sm font-bold text-slate-600">
                    No upcoming open sessions.
                  </p>
                )}
              </div>
            </div>

            <div className="panel p-5">
              <p className="text-xs font-black uppercase text-electric">Recent</p>
              <h3 className="mt-2 text-xl font-black text-navy">Recent bookings</h3>
              <div className="mt-4 grid gap-3">
                {recentBookingsPreview.length > 0 ? (
                  recentBookingsPreview.map((booking) => {
                    const session = sessionById.get(booking.session_id);

                    return (
                      <div key={booking.id} className="rounded-lg border border-slate-200 bg-mist p-4">
                        <p className="font-black text-navy">{booking.player_name}</p>
                        <p className="mt-1 text-sm text-slate-600">{booking.parent_name}</p>
                        <p className="mt-1 text-xs font-bold uppercase text-slate-500">
                          {booking.status} {session ? `- ${formatDateTime(session.start_datetime, session.timezone)}` : ""}
                        </p>
                      </div>
                    );
                  })
                ) : (
                  <p className="rounded-lg border border-slate-200 bg-mist p-4 text-sm font-bold text-slate-600">
                    No bookings yet.
                  </p>
                )}
              </div>
            </div>

            <div className="panel p-5">
              <p className="text-xs font-black uppercase text-electric">Payment Follow-Up</p>
              <h3 className="mt-2 text-xl font-black text-navy">Pending payments</h3>
              <div className="mt-4 grid gap-3">
                {pendingPaymentsPreview.length > 0 ? (
                  pendingPaymentsPreview.map((payment) => (
                    <div key={payment.id} className="rounded-lg border border-slate-200 bg-mist p-4">
                      <p className="font-black text-navy">{playerNamesForDirectPayment(payment)}</p>
                      <p className="mt-1 text-sm text-slate-600">{directPaymentOptionLabel(payment.payment_option)}</p>
                      <p className="mt-1 text-xs font-bold uppercase text-amber-700">
                        {paymentStatusLabel(payment.status)} - {formatMoney(payment.amount_due)}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="rounded-lg border border-slate-200 bg-mist p-4 text-sm font-bold text-slate-600">
                    No pending direct payments.
                  </p>
                )}
              </div>
            </div>
          </div>

          {diagnostics ? (
            <div className="panel p-5 sm:p-6">
              <p className="text-xs font-black uppercase text-electric">System Status</p>
              <h3 className="mt-2 text-xl font-black text-navy">Diagnostics</h3>
              <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["Supabase", diagnostics.supabase?.configured ? "yes" : "no"],
                  ["Stripe mode", diagnostics.stripe?.stripeMode ?? diagnostics.stripeKeyMode],
                  ["Webhook secret", diagnostics.stripe?.webhookSecretConfigured ?? diagnostics.webhookSecretExists ? "yes" : "no"],
                  ["SMTP configured", diagnostics.smtpConfigured ? "yes" : "no"],
                  ["Email from", diagnostics.emailFromConfigured ? "yes" : "no"],
                  ["Admin email", diagnostics.adminNotificationRecipient],
                  ["Google Calendar", diagnostics.googleCalendar?.googleCalendarConfigured ? "yes" : "no"],
                  ["Calendar", diagnostics.googleCalendar?.googleCalendarId || "primary"],
                  ["Google auth", diagnostics.googleCalendar?.googleAuthMode || "not configured"],
                  ["Google client email", diagnostics.googleCalendar?.googleServiceAccountEmail || "not configured"],
                  ["Google private key", diagnostics.googleCalendar?.hasGooglePrivateKey ? "yes" : "no"],
                  [
                    "Last calendar event",
                    diagnostics.googleCalendar?.lastCalendarEventCreationResult?.status || "none yet"
                  ],
                  [
                    "Last email attempt",
                    diagnostics.lastEmailAttempt
                      ? `Customer ${diagnostics.lastEmailAttempt.customerStatus} / Admin ${diagnostics.lastEmailAttempt.adminStatus}`
                      : "none yet"
                  ],
                  [
                    "Last payment check",
                    diagnostics.lastPaymentVerificationResult
                      ? diagnostics.lastPaymentVerificationResult.verified
                        ? "verified"
                        : "not verified"
                      : "none yet"
                  ]
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-slate-200 bg-mist p-4">
                    <p className="text-xs font-black uppercase text-slate-500">{label}</p>
                    <p className="mt-1 break-words font-black text-navy">{value}</p>
                  </div>
                ))}
              </div>
              <p className="mt-5 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
                Owner booking notifications are sent to <span className="font-black text-navy">{bookingNotificationEmail}</span>.
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {activeSection === "players" ? (
        <section className="grid gap-6 lg:grid-cols-[minmax(18rem,0.85fr)_minmax(0,1.15fr)]">
          <div className="panel p-5 sm:p-6">
            <p className="text-xs font-black uppercase text-electric">Player Lookup</p>
            <h3 className="mt-2 text-2xl font-black text-navy">Find a player’s sessions.</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Search by player, parent, email, or phone. Results are grouped by player first so schedules are easier to answer.
            </p>
            <label className="mt-5 grid gap-2 text-xs font-black uppercase text-slate-500">
              Search
              <input
                className={inputClass}
                value={playerLookupSearch}
                onChange={(event) => setPlayerLookupSearch(event.target.value)}
                placeholder="Player, parent, email, phone..."
              />
            </label>

            <div className="mt-5 grid gap-3">
              {playerLookupGroups.length > 0 ? (
                playerLookupGroups.map((group) => {
                  const isActive = activePlayerLookupGroup?.key === group.key;
                  const upcomingCount = group.bookings.filter((booking) => {
                    const session = sessionById.get(booking.session_id);

                    return isBookingConfirmedForAdmin(booking) && (!session?.start_datetime || isFuture(session.start_datetime));
                  }).length;

                  return (
                    <button
                      key={group.key}
                      type="button"
                      onClick={() => setActivePlayerLookupKey(group.key)}
                      className={`rounded-lg border p-4 text-left transition ${
                        isActive ? "border-electric bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-electric/50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-black text-navy">{group.displayName}</p>
                          <p className="mt-1 text-sm font-semibold text-slate-600">
                            {group.bookings.length} booking{group.bookings.length === 1 ? "" : "s"} · {upcomingCount} upcoming
                          </p>
                        </div>
                        {group.parentRecordCount > 1 ? (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-black uppercase text-amber-800">
                            Multiple contacts
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })
              ) : (
                <p className="rounded-lg border border-slate-200 bg-mist p-4 text-sm font-bold text-slate-600">
                  No matching player bookings found.
                </p>
              )}
            </div>
          </div>

          <div className="panel p-5 sm:p-6">
            {activePlayerLookupGroup ? (
              <div className="grid gap-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase text-electric">Player Schedule</p>
                    <h3 className="mt-2 text-2xl font-black text-navy">{activePlayerLookupGroup.displayName}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {activePlayerLookupGroup.bookings.length} booking{activePlayerLookupGroup.bookings.length === 1 ? "" : "s"} found for this player name.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void copyPlayerSchedule(activePlayerLookupGroup)}
                    className={secondaryButtonClass}
                  >
                    Copy Player Schedule
                  </button>
                </div>

                {activePlayerLookupGroup.parentRecordCount > 1 ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-black leading-6 text-amber-900">
                    This player may have bookings under multiple parent records.
                  </p>
                ) : null}

                {[
                  ["Upcoming Sessions", activePlayerBookingBuckets.upcoming],
                  ["Pending / Incomplete Bookings", activePlayerBookingBuckets.pending],
                  ["Cancelled Sessions", activePlayerBookingBuckets.cancelled],
                  ["Past Sessions", activePlayerBookingBuckets.past]
                ].map(([label, bucket]) => {
                  const bucketBookings = bucket as AdminBookingRecord[];

                  return (
                    <div key={label as string} className="rounded-xl border border-slate-200 bg-mist p-4">
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="font-black text-navy">{label as string}</h4>
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-black uppercase text-slate-600">
                          {bucketBookings.length}
                        </span>
                      </div>
                      <div className="mt-4 grid gap-3">
                        {bucketBookings.length > 0 ? (
                          bucketBookings.map((booking) => {
                            const session = sessionById.get(booking.session_id);

                            return (
                              <article key={booking.id} className="rounded-lg border border-slate-200 bg-white p-4">
                                <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-start">
                                  <div className="grid gap-3 md:grid-cols-2">
                                    <div>
                                      <p className="text-xs font-black uppercase text-slate-500">Session</p>
                                      <p className="mt-1 font-black text-navy">
                                        {session ? formatDateTime(session.start_datetime, session.timezone) : "Session not loaded"}
                                      </p>
                                      <p className="mt-1 text-sm font-semibold text-slate-600">
                                        {session ? `${sessionFocusLabel(session)} · ${formatTime(session.end_datetime, session.timezone)}` : "Not recorded"}
                                      </p>
                                      <p className="mt-1 text-sm text-slate-600">{bookingProgramLabel(booking)}</p>
                                    </div>
                                    <div>
                                      <p className="text-xs font-black uppercase text-slate-500">Parent record used</p>
                                      <p className="mt-1 font-black text-navy">{booking.parent_name}</p>
                                      <p className="mt-1 break-words text-sm text-slate-600">{booking.parent_email}</p>
                                      <p className="mt-1 text-sm text-slate-600">{booking.parent_phone}</p>
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-2 xl:max-w-56 xl:justify-end">
                                    <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase ${bookingAdminStatusBadgeClass(booking)}`}>
                                      {bookingAdminStatusLabel(booking)}
                                    </span>
                                    <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase ${statusBadgeClass(booking.status)}`}>
                                      {booking.status}
                                    </span>
                                    <span className="rounded-full border border-slate-200 bg-mist px-3 py-1 text-[11px] font-black uppercase text-slate-600">
                                      {booking.waiver?.waiver_signed ? "Waiver signed" : "Waiver missing"}
                                    </span>
                                  </div>
                                </div>
                                <div className="mt-4 grid gap-2 text-sm leading-6 text-slate-600 md:grid-cols-2">
                                  <p><span className="font-black text-navy">Payment type:</span> {paymentTypeLabel(booking)}</p>
                                  <p><span className="font-black text-navy">Amount paid:</span> {formatMoney(booking.amount_paid)}</p>
                                  <p><span className="font-black text-navy">Payment status:</span> {booking.admin_payment_status || booking.status}</p>
                                  <p><span className="font-black text-navy">Booking source:</span> {booking.payment_type === "launch_pass_credit" ? "Training Package credit" : "Single Session"}</p>
                                </div>
                              </article>
                            );
                          })
                        ) : (
                          <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm font-bold text-slate-600">
                            None in this group.
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-lg border border-slate-200 bg-mist p-5 text-sm font-bold text-slate-600">
                Search for a player to see their full booking history.
              </p>
            )}
          </div>
        </section>
      ) : null}

      {activeSection === "calendar" ? (
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(20rem,0.75fr)]">
          <div className="panel overflow-hidden">
            <div className="border-b border-slate-200 p-5 sm:p-6">
              <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-start">
                <div>
                  <p className="text-xs font-black uppercase text-electric">Admin Calendar</p>
                  <h3 className="mt-2 text-2xl font-black text-navy">Training calendar</h3>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                    Supabase sessions and paid bookings are the source of truth. Google Calendar sync is shown only as a status.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(["month", "week", "day"] as CalendarView[]).map((view) => (
                    <button
                      key={view}
                      type="button"
                      onClick={() => setCalendarView(view)}
                      className={`rounded-md border px-4 py-2 text-xs font-black uppercase transition ${
                        calendarView === view
                          ? "border-navy bg-navy text-white"
                          : "border-slate-300 bg-white text-navy hover:border-electric hover:text-electric"
                      }`}
                    >
                      {view}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => moveCalendar("previous")} className={secondaryButtonClass}>
                    Previous
                  </button>
                  <button type="button" onClick={() => setCalendarAnchorDate(todayDateInput())} className={secondaryButtonClass}>
                    Today
                  </button>
                  <button type="button" onClick={() => moveCalendar("next")} className={secondaryButtonClass}>
                    Next
                  </button>
                </div>
                <h4 className="text-xl font-black text-navy">{calendarRangeLabel}</h4>
              </div>
              <div className="mt-4 rounded-lg border border-slate-200 bg-mist p-4 text-sm leading-6 text-slate-700">
                <span className="font-black text-navy">Google Calendar:</span>{" "}
                {diagnostics?.googleCalendar?.googleCalendarConfigured ? "Configured" : "Not configured"} ·{" "}
                <span className="font-black text-navy">Calendar:</span>{" "}
                {diagnostics?.googleCalendar?.googleCalendarId || "primary"} ·{" "}
                <span className="font-black text-navy">Auth:</span>{" "}
                {diagnostics?.googleCalendar?.googleAuthMode || "not configured"} ·{" "}
                <span className="font-black text-navy">Last sync:</span>{" "}
                {diagnostics?.googleCalendar?.lastCalendarEventCreationResult?.status || "none yet"}
                {diagnostics?.googleCalendar?.lastCalendarEventCreationResult?.message ? (
                  <span className="mt-1 block text-xs font-semibold text-slate-500">
                    {diagnostics.googleCalendar.lastCalendarEventCreationResult.message}
                  </span>
                ) : null}
              </div>
            </div>

            {sessions.length > 0 ? (
              <div className="bg-mist p-4 sm:p-6">
                {calendarView === "month" ? (
                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                    <div className="grid min-w-[760px] grid-cols-7 border-b border-slate-200 bg-slate-50">
                      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                        <div key={day} className="border-r border-slate-200 p-3 text-xs font-black uppercase text-slate-500 last:border-r-0">
                          {day}
                        </div>
                      ))}
                    </div>
                    <div className="grid min-w-[760px] grid-cols-7">
                      {calendarVisibleDays.map((day) => {
                        const daySessions = calendarSessionsByDay.get(day) ?? [];
                        const isCurrentMonth = day.slice(0, 7) === calendarAnchorDate.slice(0, 7);

                        return (
                          <div key={day} className={`min-h-40 border-r border-t border-slate-200 p-2 last:border-r-0 ${isCurrentMonth ? "bg-white" : "bg-slate-50"}`}>
                            <p className={`text-xs font-black uppercase ${isCurrentMonth ? "text-navy" : "text-slate-400"}`}>
                              {calendarDateHeading(day)}
                            </p>
                            <div className="mt-2 grid gap-1">
                              {daySessions.map((session) => (
                                <button
                                  key={session.id}
                                  type="button"
                                  onClick={() => setActiveCalendarSessionId(session.id)}
                                  className={`rounded-md border px-2 py-2 text-left text-[11px] font-black leading-4 transition ${adminCalendarBlockClass(session)} ${
                                    activeCalendarSessionId === session.id ? "ring-2 ring-electric/30" : ""
                                  }`}
                                >
                                  <span className="block">{formatTime(session.start_datetime, session.timezone)} · {session.paidPlayers}/{session.capacity}</span>
                                  <span className="block truncate">{sessionFocusLabel(session)}</span>
                                  {session.paidBookings.length > 0 ? (
                                    <span className="mt-1 block truncate font-semibold">{sessionPlayerSummary(session)}</span>
                                  ) : null}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                    <div
                      className="grid min-w-[860px] border-b border-slate-200 bg-slate-50"
                      style={{ gridTemplateColumns: `4.5rem repeat(${calendarVisibleDays.length}, minmax(9rem, 1fr))` }}
                    >
                      <div className="border-r border-slate-200 p-3 text-xs font-black uppercase text-slate-400">Time</div>
                      {calendarVisibleDays.map((day) => (
                        <div key={day} className="border-r border-slate-200 p-3 text-sm font-black text-navy last:border-r-0">
                          {calendarDateHeading(day)}
                        </div>
                      ))}
                    </div>
                    <div
                      className="grid min-w-[860px]"
                      style={{
                        gridTemplateColumns: `4.5rem repeat(${calendarVisibleDays.length}, minmax(9rem, 1fr))`,
                        height: `${(calendarHourEnd - calendarHourStart) * 72}px`
                      }}
                    >
                      <div className="relative border-r border-slate-200 bg-slate-50">
                        {calendarHours.slice(0, -1).map((hour) => (
                          <div key={hour} className="h-[72px] border-b border-slate-200 px-2 pt-1 text-[11px] font-bold text-slate-500">
                            {new Intl.DateTimeFormat("en-US", { hour: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 1, hour)))}
                          </div>
                        ))}
                      </div>
                      {calendarVisibleDays.map((day) => {
                        const daySessions = calendarSessionsByDay.get(day) ?? [];

                        return (
                          <div key={day} className="relative border-r border-slate-200 last:border-r-0">
                            {calendarHours.slice(0, -1).map((hour) => (
                              <div key={hour} className="h-[72px] border-b border-slate-100" />
                            ))}
                            {daySessions.map((session) => {
                              const startMinutes = minutesFromDateTime(session.start_datetime, session.timezone);
                              const endMinutes = minutesFromDateTime(session.end_datetime, session.timezone);
                              const top = Math.max(0, ((startMinutes - calendarHourStart * 60) / 60) * 72);
                              const height = Math.max(42, ((Math.max(endMinutes, startMinutes + 30) - startMinutes) / 60) * 72 - 4);

                              return (
                                <button
                                  key={session.id}
                                  type="button"
                                  onClick={() => setActiveCalendarSessionId(session.id)}
                                  className={`absolute left-1 right-1 overflow-hidden rounded-lg border px-2 py-2 text-left text-xs font-black leading-4 shadow-sm transition ${adminCalendarBlockClass(session)} ${
                                    activeCalendarSessionId === session.id ? "ring-2 ring-electric/40" : ""
                                  }`}
                                  style={{ top, height }}
                                >
                                  <span className="block">{formatTimeRange(session)}</span>
                                  <span className="block truncate">{sessionFocusLabel(session)}</span>
                                  <span className="block">{session.paidPlayers}/{session.capacity} booked</span>
                                  {session.paidBookings.length > 0 ? (
                                    <span className="mt-1 block truncate font-semibold">{sessionPlayerSummary(session)}</span>
                                  ) : null}
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-5 sm:p-6">
                <p className="rounded-lg border border-slate-200 bg-mist p-5 text-sm font-bold text-slate-600">
                  No sessions have been created yet.
                </p>
              </div>
            )}
          </div>

          <aside className="panel p-5 sm:p-6 lg:sticky lg:top-6 lg:self-start">
            {selectedCalendarSession ? (
              <div className="grid gap-5">
                <div>
                  <p className="text-xs font-black uppercase text-electric">Session Details</p>
                  <h3 className="mt-2 text-2xl font-black text-navy">{sessionFocusLabel(selectedCalendarSession)}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {formatDateTime(selectedCalendarSession.start_datetime, selectedCalendarSession.timezone)} ·{" "}
                    {formatTime(selectedCalendarSession.end_datetime, selectedCalendarSession.timezone)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase ${adminCalendarStatusBadgeClass(selectedCalendarSession)}`}>
                      {adminCalendarStatus(selectedCalendarSession)}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-mist px-3 py-1 text-[11px] font-black uppercase text-navy">
                      {selectedCalendarSession.paidPlayers}/{selectedCalendarSession.capacity} booked
                    </span>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-mist p-4 text-sm leading-6 text-slate-600">
                  <p><span className="font-black text-navy">Training group:</span> Elite Performance ages 13-18</p>
                  <p><span className="font-black text-navy">Location:</span> {selectedCalendarSession.location || business.location}</p>
                  <p><span className="font-black text-navy">Remaining spots:</span> {selectedCalendarSession.remainingSpots}</p>
                  <p>
                    <span className="font-black text-navy">Google Calendar sync:</span>{" "}
                    {diagnostics?.googleCalendar?.googleCalendarConfigured ? "Configured" : "Not configured"} · Last status:{" "}
                    {diagnostics?.googleCalendar?.lastCalendarEventCreationResult?.status || "none yet"}
                  </p>
                  <button
                    type="button"
                    onClick={() => openManualBookingForm(selectedCalendarSession)}
                    className={`${primaryButtonClass} mt-4 w-full`}
                  >
                    Add Player Manually
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyBookedPlayers(selectedCalendarSession)}
                    className={`${secondaryButtonClass} mt-3 w-full`}
                  >
                    Copy Booked Players
                  </button>
                </div>

                <div>
                  <p className="text-xs font-black uppercase text-electric">Booked Players</p>
                  <div className="mt-3 grid gap-3">
                    {selectedCalendarSession.paidBookings.length > 0 ? (
                      selectedCalendarSession.paidBookings.map((booking) => (
                        <article key={booking.id} className="rounded-lg border border-slate-200 bg-white p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <h4 className="font-black text-navy">{booking.player_name}</h4>
                              <p className="mt-1 text-sm text-slate-600">{booking.parent_name}</p>
                            </div>
                            <span className="rounded-full border border-slate-200 bg-mist px-3 py-1 text-[11px] font-black uppercase text-slate-600">
                              {paymentTypeLabel(booking)}
                            </span>
                          </div>
                          <div className="mt-3 grid gap-1 text-sm leading-6 text-slate-600">
                            <p><span className="font-black text-navy">Parent email:</span> {booking.parent_email}</p>
                            <p><span className="font-black text-navy">Parent phone:</span> {booking.parent_phone}</p>
                            <p>
                              <span className="font-black text-navy">Training Package:</span>{" "}
                              {booking.payment_type === "launch_pass_credit"
                                ? `Credit used${booking.passPurchase ? ` · ${booking.passPurchase.remaining_credits}/${booking.passPurchase.total_credits} remaining` : ""}`
                                : "Not used"}
                            </p>
                            <p>
                              <span className="font-black text-navy">Google sync:</span>{" "}
                              {booking.calendarEvent?.google_calendar_event_id
                                ? "Synced"
                                : booking.calendar_sync_status
                                  ? `${booking.calendar_sync_status}${booking.calendar_sync_message ? ` · ${booking.calendar_sync_message}` : ""}`
                                  : "Not synced / not recorded"}
                            </p>
                          </div>
                          <button type="button" onClick={() => editBookingContact(booking)} className={`${secondaryButtonClass} mt-3`}>
                            Edit Contact Info
                          </button>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button type="button" onClick={() => openEditManualBookingForm(booking, selectedCalendarSession)} className={secondaryButtonClass}>
                              Edit Booking
                            </button>
                            <button
                              type="button"
                              disabled={updatingBookingId === booking.id}
                              onClick={() => void resendBookingConfirmation(booking)}
                              className={secondaryButtonClass}
                            >
                              Resend Confirmation
                            </button>
                            <button
                              type="button"
                              disabled={updatingBookingId === booking.id}
                              onClick={() => void retryBookingCalendarSync(booking)}
                              className={secondaryButtonClass}
                            >
                              Retry Calendar Sync
                            </button>
                            <button
                              type="button"
                              disabled={updatingBookingId === booking.id}
                              onClick={() => void cancelAdminPlayerBooking(booking)}
                              className={dangerButtonClass}
                            >
                              {updatingBookingId === booking.id ? "Removing..." : "Remove Player"}
                            </button>
                          </div>
                        </article>
                      ))
                    ) : (
                      <p className="rounded-lg border border-slate-200 bg-mist p-4 text-sm font-bold text-slate-600">
                        No paid bookings for this session yet.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-mist p-5 text-sm leading-6 text-slate-600">
                <p className="font-black text-navy">Select a session</p>
                <p className="mt-2">Click any session on the calendar to see booked players and contact details.</p>
              </div>
            )}

            <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs font-black uppercase text-electric">Private 1-on-1 Calendar</p>
              <h4 className="mt-2 text-lg font-black text-navy">Scheduled private sessions</h4>
              <div className="mt-4 grid gap-3">
                {scheduledPrivateRequests.length > 0 ? (
                  scheduledPrivateRequests.map((request) => (
                    <div key={request.id} className="rounded-lg border border-slate-200 bg-mist p-4 text-sm">
                      <p className="font-black text-navy">
                        {request.scheduled_start ? formatDateTime(request.scheduled_start, request.timezone) : "Not scheduled"}
                      </p>
                      <p className="mt-1 font-bold text-slate-700">Private 1-on-1 - {request.player_name}</p>
                      <p className="mt-1 text-slate-600">{request.focus_areas.join(", ") || "General Technical Work"}</p>
                      <p className="mt-1 text-xs font-black uppercase text-slate-500">
                        Calendar: {request.calendar_status || "not synced"}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="rounded-lg border border-slate-200 bg-mist p-4 text-sm font-bold text-slate-600">
                    No private sessions scheduled yet.
                  </p>
                )}
              </div>
            </div>
          </aside>
        </section>
      ) : null}

      {activeSection === "sessions" ? (
        <section className="grid gap-6">
          <div className="panel p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase text-electric">Sessions</p>
                <h3 className="mt-2 text-2xl font-black text-navy">Create and manage openings.</h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                  Elite Performance is the default group. Add a session focus so parents know what the training day covers.
                </p>
              </div>
              <button type="button" onClick={() => setShowCreateSession((value) => !value)} className={primaryButtonClass}>
                {showCreateSession ? "Close Form" : "Create New Session"}
              </button>
            </div>

            {showCreateSession ? (
              <div className="mt-6 rounded-xl border border-slate-200 bg-mist p-4 sm:p-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-bold text-navy sm:col-span-2">
                    Training Group
                    <select className={inputClass} value={newGroupId} onChange={(event) => setNewGroupId(event.target.value as TrainingGroupId)}>
                      {trainingGroups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name} ({group.ages})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-bold text-navy sm:col-span-2">
                    Session Focus
                    <select className={inputClass} value={newTrainingFocus} onChange={(event) => setNewTrainingFocus(event.target.value)}>
                      {focusChoices.map((focus) => (
                        <option key={focus} value={focus === "General Training" ? "" : focus}>
                          {focus}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-bold text-navy">
                    Date
                    <input className={inputClass} type="date" value={newDate} onChange={(event) => setNewDate(event.target.value)} />
                  </label>
                  <label className="grid gap-2 text-sm font-bold text-navy">
                    Start Time
                    <input className={inputClass} type="time" value={newTime} onChange={(event) => setNewTime(event.target.value)} />
                  </label>
                  <label className="grid gap-2 text-sm font-bold text-navy">
                    End Time
                    <input className={inputClass} type="time" value={endTimeFromStartInput(newTime)} readOnly />
                  </label>
                  <label className="grid gap-2 text-sm font-bold text-navy">
                    Capacity
                    <input
                      className={inputClass}
                      type="number"
                      min="1"
                      max="6"
                      value={newCapacity}
                      onChange={(event) => setNewCapacity(event.target.value)}
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-bold text-navy">
                    Status
                    <select className={inputClass} value={newStatus} onChange={(event) => setNewStatus(event.target.value as "open" | "closed" | "cancelled")}>
                      <option value="open">Open</option>
                      <option value="closed">Closed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </label>
                  <label className="grid gap-2 text-sm font-bold text-navy sm:col-span-2">
                    Location
                    <input className={inputClass} value={newLocation} onChange={(event) => setNewLocation(event.target.value)} />
                  </label>
                </div>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <label className="flex items-center gap-2 text-sm font-bold text-slate-600">
                    <input
                      type="checkbox"
                      checked={createAnother}
                      onChange={(event) => setCreateAnother(event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    Create another after saving
                  </label>
                  <button type="button" disabled={isSaving} onClick={addSession} className={primaryButtonClass}>
                    Save Session
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="panel p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase text-electric">Bulk Create Sessions</p>
                <h3 className="mt-2 text-2xl font-black text-navy">Create a month of openings.</h3>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                  Add weekly patterns, preview every session first, then create only the new sessions. Existing matching
                  sessions are skipped.
                </p>
              </div>
              <button type="button" onClick={() => setShowBulkCreate((value) => !value)} className={secondaryButtonClass}>
                {showBulkCreate ? "Close Bulk Tool" : "Bulk Create Sessions"}
              </button>
            </div>

            {showBulkCreate ? (
              <div className="mt-6 grid gap-5">
                <div className="rounded-xl border border-slate-200 bg-mist p-4 sm:p-5">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="grid gap-2 text-sm font-bold text-navy">
                      Start Date
                      <input
                        className={inputClass}
                        type="date"
                        value={bulkStartDate}
                        onChange={(event) => {
                          setBulkStartDate(event.target.value);
                          setBulkPreviewVisible(false);
                        }}
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-bold text-navy">
                      End Date
                      <input
                        className={inputClass}
                        type="date"
                        value={bulkEndDate}
                        onChange={(event) => {
                          setBulkEndDate(event.target.value);
                          setBulkPreviewVisible(false);
                        }}
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-bold text-navy lg:col-span-2">
                      Training Group
                      <select
                        className={inputClass}
                        value={bulkGroupId}
                        onChange={(event) => {
                          setBulkGroupId(event.target.value as TrainingGroupId);
                          setBulkPreviewVisible(false);
                        }}
                      >
                        {trainingGroups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.name} ({group.ages})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-2 text-sm font-bold text-navy">
                      Capacity
                      <input
                        className={inputClass}
                        type="number"
                        min="1"
                        max="6"
                        value={bulkCapacity}
                        onChange={(event) => {
                          setBulkCapacity(event.target.value);
                          setBulkPreviewVisible(false);
                        }}
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-bold text-navy sm:col-span-2 lg:col-span-3">
                      Location
                      <input
                        className={inputClass}
                        value={bulkLocation}
                        onChange={(event) => {
                          setBulkLocation(event.target.value);
                          setBulkPreviewVisible(false);
                        }}
                      />
                    </label>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h4 className="text-lg font-black text-navy">Weekly session patterns</h4>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        Add one row for each weekly time block and focus.
                      </p>
                    </div>
                    <button type="button" onClick={addBulkPattern} className={secondaryButtonClass}>
                      Add Pattern
                    </button>
                  </div>

                  <div className="mt-5 grid gap-3">
                    {bulkPatterns.map((pattern, index) => (
                      <div key={pattern.id} className="grid gap-3 rounded-lg border border-slate-200 bg-mist p-3 lg:grid-cols-[1fr_1fr_1fr_2fr_auto] lg:items-end">
                        <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                          Day of Week
                          <select
                            className={inputClass}
                            value={pattern.dayOfWeek}
                            onChange={(event) => updateBulkPattern(pattern.id, { dayOfWeek: Number(event.target.value) })}
                          >
                            {dayOptions.map((day) => (
                              <option key={day.value} value={day.value}>
                                {day.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                          Start Time
                          <input
                            className={inputClass}
                            type="time"
                            value={pattern.startTime}
                            onChange={(event) => updateBulkPattern(pattern.id, { startTime: event.target.value })}
                          />
                        </label>
                        <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                          End Time
                          <input
                            className={inputClass}
                            type="time"
                            value={pattern.endTime}
                            onChange={(event) => updateBulkPattern(pattern.id, { endTime: event.target.value })}
                          />
                        </label>
                        <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                          Session Focus
                          <select
                            className={inputClass}
                            value={pattern.trainingFocus}
                            onChange={(event) => updateBulkPattern(pattern.id, { trainingFocus: event.target.value })}
                          >
                            {focusChoices.map((focus) => (
                              <option key={focus} value={focus}>
                                {focus}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          onClick={() => removeBulkPattern(pattern.id)}
                          disabled={bulkPatterns.length === 1}
                          className={bulkPatterns.length === 1 ? secondaryButtonClass : dangerButtonClass}
                        >
                          Remove
                          <span className="sr-only"> pattern {index + 1}</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <button type="button" onClick={previewBulkSchedule} className={navyButtonClass}>
                    Preview Schedule
                  </button>
                  {bulkPreviewVisible ? (
                    <p className="text-sm font-bold text-slate-600">
                      Preview: {bulkNewSessionsCount} new / {bulkSkippedSessionsCount} skipped
                    </p>
                  ) : null}
                </div>

                {bulkPreviewVisible ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
                    <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h4 className="text-lg font-black text-navy">Preview Schedule</h4>
                        <p className="mt-1 text-sm leading-6 text-slate-600">
                          Review every session before creating. Matching existing sessions are marked and skipped.
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={isSaving || bulkNewSessionsCount === 0}
                        onClick={() => void createBulkSessions()}
                        className={primaryButtonClass}
                      >
                        Create Sessions
                      </button>
                    </div>

                    <div className="mt-4 grid gap-3">
                      {bulkPreviewSessions.map((session) => {
                        const skipped = session.alreadyExists || session.duplicateInPreview;

                        return (
                          <div
                            key={session.key}
                            className={`grid gap-3 rounded-lg border p-4 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-center ${
                              skipped ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-mist"
                            }`}
                          >
                            <div>
                              <p className="text-xs font-black uppercase text-slate-500">{session.dayLabel}</p>
                              <p className="mt-1 text-lg font-black text-navy">{session.date}</p>
                              <p className="mt-1 text-sm font-semibold text-slate-600">
                                {session.startTime}-{session.endTime}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs font-black uppercase text-slate-500">Session Focus</p>
                              <p className="mt-1 font-black text-navy">{session.trainingFocus}</p>
                              <p className="mt-1 text-sm text-slate-600">{session.trainingGroupLabel}</p>
                            </div>
                            <div>
                              <p className="text-xs font-black uppercase text-slate-500">Details</p>
                              <p className="mt-1 text-sm font-semibold text-slate-600">Capacity {session.capacity}</p>
                              <p className="mt-1 text-sm text-slate-600">{session.location}</p>
                            </div>
                            <span
                              className={`rounded-full border px-3 py-1 text-center text-[11px] font-black uppercase ${
                                skipped
                                  ? "border-amber-300 bg-white text-amber-700"
                                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
                              }`}
                            >
                              {session.alreadyExists
                                ? "Already exists"
                                : session.duplicateInPreview
                                  ? "Duplicate in preview"
                                  : "New"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="panel p-5 sm:p-6">
            <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
              <div>
                <h3 className="text-xl font-black text-navy">Close Unavailable Day</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  This closes existing sessions on the selected date. Parents only see open sessions with remaining spots.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(14rem,1fr)_auto]">
                <input className={inputClass} type="date" value={blockDate} onChange={(event) => setBlockDate(event.target.value)} />
                <button type="button" disabled={isSaving} onClick={closeSessionsOnDate} className={navyButtonClass}>
                  Close Day
                </button>
              </div>
            </div>
          </div>

          <section className="panel overflow-hidden">
            <div className="border-b border-slate-200 p-5 sm:p-6">
              <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
                <div>
                  <p className="text-xs font-black uppercase text-electric">Session List</p>
                  <h3 className="mt-2 text-xl font-black text-navy">Grouped by date</h3>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg border border-slate-200 bg-mist p-3">
                    <p className="text-xl font-black text-navy">{counts.open}</p>
                    <p className="text-[10px] font-black uppercase text-slate-500">Open</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-mist p-3">
                    <p className="text-xl font-black text-navy">{counts.full}</p>
                    <p className="text-[10px] font-black uppercase text-slate-500">Full</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-mist p-3">
                    <p className="text-xl font-black text-navy">{counts.unavailable}</p>
                    <p className="text-[10px] font-black uppercase text-slate-500">Unavailable</p>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-4">
                <div className="flex flex-wrap gap-2">
                  {[
                    ["all", "All"],
                    ["open", "Open"],
                    ["full", "Full"],
                    ["closed", "Closed"],
                    ["cancelled", "Cancelled"],
                    ["shooting-attacking", "Shooting / Attacking"],
                    ["defending", "Defending"],
                    ["technical", "Technical Work"],
                    ["shooting-finishing", "Shooting & Finishing"]
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setSessionFilter(value as SessionFilter)}
                      className={`rounded-md border px-4 py-2 text-xs font-black uppercase transition ${
                        sessionFilter === value
                          ? "border-navy bg-navy text-white"
                          : "border-slate-300 bg-white text-navy hover:border-electric hover:text-electric"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="grid gap-3 md:grid-cols-[minmax(12rem,15rem)_minmax(12rem,15rem)_auto] md:items-end">
                  <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                    Date Range
                    <select className={inputClass} value={sessionDateRange} onChange={(event) => setSessionDateRange(event.target.value as SessionDateRange)}>
                      <option value="upcoming">Upcoming</option>
                      <option value="today">Today</option>
                      <option value="this-week">This Week</option>
                      <option value="all">All Dates</option>
                      <option value="past">Past</option>
                    </select>
                  </label>
                  <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                    Exact Date
                    <input className={inputClass} type="date" value={sessionDateFilter} onChange={(event) => setSessionDateFilter(event.target.value)} />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setSessionFilter("all");
                      setSessionDateRange("upcoming");
                      setSessionDateFilter("");
                    }}
                    className={secondaryButtonClass}
                  >
                    Clear Filters
                  </button>
                </div>
              </div>
            </div>

            {groupedSessions.length > 0 ? (
              <div className="grid gap-5 bg-mist p-4 sm:p-6">
                {groupedSessions.map((group) => (
                  <div key={group.key} className="grid gap-3">
                    <h4 className="text-sm font-black uppercase tracking-wide text-slate-500">{group.label}</h4>
                    <div className="grid gap-4">
                      {group.sessions.map((session) => {
                        const trainingGroup = trainingGroups.find((item) => item.id === session.training_group);
                        const isFull = session.remainingSpots <= 0;
                        const detailsOpen = expandedSessionId === session.id;
                        const actionsOpen = actionsSessionId === session.id;
                        const paidBookingNames = session.paidBookings.map((booking) => booking.player_name).join(", ");
                        const launchPassBookings = session.paidBookings.filter(
                          (booking) =>
                            booking.payment_type === "launch_pass_credit" ||
                            Boolean(booking.pass_purchase_id) ||
                            Boolean(booking.credit_redemption_id)
                        );
                        const creditedLaunchPassBookings = launchPassBookings.filter((booking) => booking.creditAdjustment);
                        const cardPaidBookings = session.paidBookings.filter(
                          (booking) =>
                            !(
                              booking.payment_type === "launch_pass_credit" ||
                              Boolean(booking.pass_purchase_id) ||
                              Boolean(booking.credit_redemption_id)
                            )
                        );

                        return (
                          <article key={session.id} className="grid gap-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                            <div className="grid gap-5 xl:grid-cols-[1fr_auto] xl:items-start">
                              <div className="grid gap-4">
                                <div className="flex flex-wrap gap-2">
                                  <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase ${sessionFocusBadgeClass(session)}`}>
                                    {sessionFocusLabel(session)}
                                  </span>
                                  <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase ${statusBadgeClass(session.status)}`}>
                                    {session.status}
                                  </span>
                                  {isFull ? (
                                    <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-black uppercase text-amber-700">
                                      Full
                                    </span>
                                  ) : null}
                                </div>

                                <div>
                                  <p className="text-xs font-black uppercase text-electric">
                                    {trainingGroup?.name ?? session.title} {trainingGroup ? `(${trainingGroup.ages})` : ""}
                                  </p>
                                  <h4 className="mt-1 text-2xl font-black text-navy">{formatTimeRange(session)}</h4>
                                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                                    {session.location || business.location}
                                  </p>
                                </div>

                                <div className="grid gap-3 sm:grid-cols-3">
                                  <div className="rounded-lg border border-slate-200 bg-mist p-3">
                                    <p className="text-xl font-black text-navy">{session.capacity}</p>
                                    <p className="text-[10px] font-black uppercase text-slate-500">Capacity</p>
                                  </div>
                                  <div className="rounded-lg border border-slate-200 bg-mist p-3">
                                    <p className="text-xl font-black text-navy">{session.paidPlayers}</p>
                                    <p className="text-[10px] font-black uppercase text-slate-500">Booked</p>
                                  </div>
                                  <div className="rounded-lg border border-slate-200 bg-mist p-3">
                                    <p className="text-xl font-black text-navy">{session.remainingSpots}</p>
                                    <p className="text-[10px] font-black uppercase text-slate-500">Remaining</p>
                                  </div>
                                </div>

                                <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-600">
                                  <span className="font-black text-navy">Confirmed bookings:</span>{" "}
                                  {session.paidBookings.length > 0 ? paidBookingNames : "None yet"}
                                </div>
                              </div>
                              <div className="flex flex-col gap-2 sm:flex-row xl:flex-col">
                                <button
                                  type="button"
                                  onClick={() => setExpandedSessionId(detailsOpen ? "" : session.id)}
                                  className={navyButtonClass}
                                >
                                  {detailsOpen ? "Hide Bookings" : "View Bookings"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openManualBookingForm(session)}
                                  className={primaryButtonClass}
                                >
                                  Add Player Manually
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setActionsSessionId(actionsOpen ? "" : session.id)}
                                  className={secondaryButtonClass}
                                >
                                  {actionsOpen ? "Close Actions" : "Manage"}
                                </button>
                              </div>
                            </div>

                            {actionsOpen ? (
                              <div className="grid gap-4 rounded-lg border border-slate-200 bg-mist p-4 lg:grid-cols-4">
                                <div>
                                  <p className="text-xs font-black uppercase text-slate-500">Primary</p>
                                  <div className="mt-3 grid gap-2">
                                    <button type="button" onClick={() => setExpandedSessionId(detailsOpen ? "" : session.id)} className={secondaryButtonClass}>
                                      View Details
                                    </button>
                                    <button type="button" onClick={() => editSessionFocus(session)} className={secondaryButtonClass}>
                                      Edit Focus
                                    </button>
                                    <button type="button" onClick={() => duplicateSession(session)} className={secondaryButtonClass}>
                                      Duplicate
                                    </button>
                                    <button type="button" onClick={() => openManualBookingForm(session)} className={primaryButtonClass}>
                                      Add Player Manually
                                    </button>
                                  </div>
                                </div>
                                <div>
                                  <p className="text-xs font-black uppercase text-slate-500">Status</p>
                                  <div className="mt-3 grid gap-2">
                                    <button type="button" disabled={isSaving} onClick={() => void updateSession(session.id, { status: "open" })} className={secondaryButtonClass}>
                                      Open
                                    </button>
                                    <button type="button" disabled={isSaving} onClick={() => void updateSession(session.id, { status: "closed" })} className={secondaryButtonClass}>
                                      Close
                                    </button>
                                    <button type="button" disabled={isSaving} onClick={() => void updateSession(session.id, { status: "cancelled" })} className={secondaryButtonClass}>
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                                <div>
                                  <p className="text-xs font-black uppercase text-slate-500">Session Focus</p>
                                  <div className="mt-3 grid gap-2">
                                    <button type="button" disabled={isSaving} onClick={() => void updateSession(session.id, { training_focus: null })} className={secondaryButtonClass}>
                                      Set General
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isSaving}
                                      onClick={() => void updateSession(session.id, { training_focus: "Shooting & Finishing" })}
                                      className={secondaryButtonClass}
                                    >
                                      Set Shooting & Finishing
                                    </button>
                                    <button type="button" disabled={isSaving} onClick={() => editCapacity(session)} className={secondaryButtonClass}>
                                      Update Capacity
                                    </button>
                                    <button type="button" disabled={isSaving} onClick={() => editLocation(session)} className={secondaryButtonClass}>
                                      Update Location
                                    </button>
                                  </div>
                                </div>
                                <div>
                                  <p className="text-xs font-black uppercase text-red-700">Danger</p>
                                  <button type="button" disabled={isSaving} onClick={() => void removeSession(session)} className={`mt-3 w-full ${dangerButtonClass}`}>
                                    Delete Session
                                  </button>
                                  {session.paidBookings.length > 0 ? (
                                    <p className="mt-3 text-xs font-bold leading-5 text-red-700">
                                      This session has bookings. Closing or cancelling is usually safer.
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                            ) : null}

                            {detailsOpen ? (
                              session.paidBookings.length > 0 ? (
                                <div className="rounded-lg border border-slate-200 bg-mist p-4">
                                  <p className="text-xs font-black uppercase text-electric">Confirmed Bookings</p>
                                  {session.status === "cancelled" && launchPassBookings.length > 0 ? (
                                    <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-800">
                                      This cancelled session has Training Package bookings. You may issue makeup credits to affected players.
                                    </p>
                                  ) : null}
                                  {session.status === "cancelled" && creditedLaunchPassBookings.length > 0 ? (
                                    <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold leading-6 text-emerald-800">
                                      {creditedLaunchPassBookings.length} Training credit
                                      {creditedLaunchPassBookings.length === 1 ? " was" : "s were"} returned:{" "}
                                      {creditedLaunchPassBookings.map((booking) => booking.player_name).join(", ")}.
                                    </p>
                                  ) : null}
                                  {session.status === "cancelled" && cardPaidBookings.length > 0 ? (
                                    <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold leading-6 text-red-700">
                                      This session has card-paid bookings. Refunds must be handled separately in Stripe or manually.
                                    </p>
                                  ) : null}
                                  <div className="mt-3 grid gap-4">
                                    {session.paidBookings.map((booking) => {
                                      const isLaunchPassBooking =
                                        booking.payment_type === "launch_pass_credit" ||
                                        Boolean(booking.pass_purchase_id) ||
                                        Boolean(booking.credit_redemption_id);
                                      const canIssueMakeupCredit =
                                        session.status === "cancelled" && isLaunchPassBooking && !booking.creditAdjustment;

                                      return (
                                        <article key={booking.id} className="rounded-lg border border-slate-200 bg-white p-4">
                                          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                                            <div>
                                              <h5 className="font-black text-navy">{booking.player_name}</h5>
                                              <p className="mt-1 text-sm text-slate-600">
                                                {booking.player_count} player(s) - Payment: {booking.status}
                                              </p>
                                              <p className="mt-1 text-sm text-slate-600">
                                                Payment type:{" "}
                                                {paymentTypeLabel(booking)}
                                              </p>
                                              {booking.manual_source ? (
                                                <p className="mt-1 text-sm font-bold text-slate-600">
                                                  Manual admin booking · {booking.admin_payment_status || booking.status}
                                                </p>
                                              ) : null}
                                              <p className="mt-1 text-sm text-slate-600">Amount paid: {formatMoney(booking.amount_paid)}</p>
                                              {booking.creditAdjustment ? (
                                                <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold leading-5 text-emerald-700">
                                                  Makeup credit added on {formatWaiverTimestamp(booking.creditAdjustment.created_at)}. Email:{" "}
                                                  {booking.creditAdjustment.email_status}
                                                </p>
                                              ) : null}
                                            </div>
                                            <div className="grid gap-1 text-sm text-slate-600">
                                              <p><span className="font-black text-navy">Parent:</span> {booking.parent_name}</p>
                                              <p><span className="font-black text-navy">Phone:</span> {booking.parent_phone}</p>
                                              <p><span className="font-black text-navy">Email:</span> {booking.parent_email}</p>
                                              <p><span className="font-black text-navy">Emergency:</span> {booking.emergency_name || "Not recorded"} - {booking.emergency_phone || "Not recorded"}</p>
                                              <p><span className="font-black text-navy">Notes:</span> {booking.notes || "None"}</p>
                                              <p><span className="font-black text-navy">Internal:</span> {booking.internal_note || "None"}</p>
                                              <p><span className="font-black text-navy">Medical:</span> {booking.medical_notes || "None"}</p>
                                            </div>
                                          </div>

                                          <div className="mt-4 rounded-lg border border-slate-200 bg-mist p-4">
                                            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
                                              <div>
                                                <p className="text-xs font-black uppercase text-electric">Waiver Record</p>
                                                <div className="mt-3 grid gap-1 text-sm text-slate-600 sm:grid-cols-2">
                                                  <p><span className="font-black text-navy">Waiver Signed:</span> {booking.waiver?.waiver_signed ? "Yes" : "Not recorded"}</p>
                                                  <p><span className="font-black text-navy">Typed Signature:</span> {booking.waiver?.typed_signature || "Not recorded"}</p>
                                                  <p><span className="font-black text-navy">Signed Timestamp:</span> {formatWaiverTimestamp(booking.waiver?.signed_at)}</p>
                                                  <p><span className="font-black text-navy">Media Consent:</span> {booking.waiver?.media_consent || "Not recorded"}</p>
                                                </div>
                                              </div>
                                              <div className="flex flex-col gap-2">
                                                {canIssueMakeupCredit ? (
                                                  <button
                                                    type="button"
                                                    disabled={creditingBookingId === booking.id}
                                                    onClick={() => void issueMakeupCredit(booking)}
                                                    className={primaryButtonClass}
                                                  >
                                                    {creditingBookingId === booking.id ? "Issuing..." : "Issue Makeup Credit"}
                                                  </button>
                                                ) : null}
                                                <button type="button" onClick={() => editBookingContact(booking)} className={secondaryButtonClass}>
                                                  Edit Contact Info
                                                </button>
                                                <button type="button" onClick={() => openEditManualBookingForm(booking, session)} className={secondaryButtonClass}>
                                                  Edit Booking
                                                </button>
                                                <button
                                                  type="button"
                                                  disabled={updatingBookingId === booking.id}
                                                  onClick={() => void resendBookingConfirmation(booking)}
                                                  className={secondaryButtonClass}
                                                >
                                                  Resend Confirmation
                                                </button>
                                                <button
                                                  type="button"
                                                  disabled={updatingBookingId === booking.id}
                                                  onClick={() => void retryBookingCalendarSync(booking)}
                                                  className={secondaryButtonClass}
                                                >
                                                  Retry Calendar Sync
                                                </button>
                                                <button
                                                  type="button"
                                                  disabled={updatingBookingId === booking.id}
                                                  onClick={() => void cancelAdminPlayerBooking(booking)}
                                                  className={dangerButtonClass}
                                                >
                                                  {updatingBookingId === booking.id ? "Removing..." : "Remove Player"}
                                                </button>
                                                <button type="button" onClick={() => setActiveWaiverRecord({ booking, session })} className={navyButtonClass}>
                                                  View Waiver Record
                                                </button>
                                                <button type="button" onClick={() => printWaiverRecord(booking, session)} className={secondaryButtonClass}>
                                                  Print Waiver
                                                </button>
                                                <button type="button" onClick={() => downloadWaiverRecord(booking, session)} className={secondaryButtonClass}>
                                                  Download Waiver
                                                </button>
                                              </div>
                                            </div>
                                          </div>
                                        </article>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : (
                                <p className="rounded-lg border border-slate-200 bg-mist p-4 text-sm font-bold text-slate-600">
                                  No confirmed bookings for this session yet.
                                </p>
                              )
                            ) : null}
                          </article>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-5 sm:p-6">
                <p className="rounded-lg border border-slate-200 bg-mist p-5 text-sm font-bold text-slate-600">
                  No sessions match the current filters.
                </p>
              </div>
            )}
          </section>
        </section>
      ) : null}

      {activeSection === "bookings" ? (
        <section className="panel overflow-hidden">
          <div className="border-b border-slate-200 p-5 sm:p-6">
            <p className="text-xs font-black uppercase text-electric">Bookings</p>
            <h3 className="mt-2 text-2xl font-black text-navy">Player registrations</h3>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setBookingFilter("confirmed")}
                className={`rounded-lg border p-4 text-left transition ${
                  bookingFilter === "confirmed"
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-slate-200 bg-white hover:border-electric/50"
                }`}
              >
                <p className="text-2xl font-black text-navy">{confirmedBookings.length}</p>
                <p className="mt-1 text-xs font-black uppercase text-emerald-700">Confirmed bookings</p>
                <p className="mt-2 text-sm font-semibold text-slate-600">Paid bookings that count toward session capacity.</p>
              </button>
              <button
                type="button"
                onClick={() => setBookingFilter("incomplete")}
                className={`rounded-lg border p-4 text-left transition ${
                  bookingFilter === "incomplete"
                    ? "border-amber-300 bg-amber-50"
                    : "border-slate-200 bg-white hover:border-electric/50"
                }`}
              >
                <p className="text-2xl font-black text-navy">{incompleteBookings.length}</p>
                <p className="mt-1 text-xs font-black uppercase text-amber-700">Pending / incomplete bookings</p>
                <p className="mt-2 text-sm font-semibold text-slate-600">Not paid yet — do not count as confirmed.</p>
              </button>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-[minmax(12rem,15rem)_minmax(12rem,1fr)_minmax(12rem,15rem)_auto] md:items-end">
              <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                Status
                <select className={inputClass} value={bookingFilter} onChange={(event) => setBookingFilter(event.target.value as BookingFilter)}>
                  <option value="confirmed">Confirmed</option>
                  <option value="incomplete">Pending / Incomplete</option>
                  <option value="upcoming">Upcoming Confirmed</option>
                  <option value="all">All</option>
                  <option value="past">Past Confirmed</option>
                </select>
              </label>
              <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                Session Focus
                <input
                  className={inputClass}
                  value={bookingFocusFilter}
                  onChange={(event) => setBookingFocusFilter(event.target.value)}
                  placeholder="Shooting, Defending..."
                />
              </label>
              <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                Date
                <input className={inputClass} type="date" value={bookingDateFilter} onChange={(event) => setBookingDateFilter(event.target.value)} />
              </label>
              <button
                type="button"
                onClick={() => {
                  setBookingFilter("confirmed");
                  setBookingFocusFilter("");
                  setBookingDateFilter("");
                }}
                className={secondaryButtonClass}
              >
                Clear
              </button>
            </div>
          </div>

          {filteredBookings.length > 0 ? (
            <div className="grid gap-4 bg-mist p-4 sm:p-6">
              {filteredBookings.map((booking) => {
                const session = sessionById.get(booking.session_id);
                const isExpanded = expandedBookingId === booking.id;
                const isConfirmed = isBookingConfirmedForAdmin(booking);
                const isUpdatingBooking = updatingBookingId === booking.id;

                return (
                  <article
                    key={booking.id}
                    className={`rounded-xl border p-5 shadow-sm ${
                      isConfirmed ? "border-slate-200 bg-white" : "border-amber-200 bg-amber-50/70"
                    }`}
                  >
                    {!isConfirmed ? (
                      <p className="mb-4 rounded-lg border border-amber-300 bg-amber-100 p-4 text-sm font-black leading-6 text-amber-900">
                        Not paid yet — do not count as confirmed.
                      </p>
                    ) : null}
                    <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-start">
                      <div className="grid gap-4 md:grid-cols-3">
                        <div>
                          <p className="text-xs font-black uppercase text-slate-500">Player</p>
                          <h4 className="mt-1 text-xl font-black text-navy">{booking.player_name}</h4>
                          <p className="mt-1 text-sm text-slate-600">Age {booking.player_age}</p>
                        </div>
                        <div>
                          <p className="text-xs font-black uppercase text-slate-500">Parent</p>
                          <p className="mt-1 font-black text-navy">{booking.parent_name}</p>
                          <p className="mt-1 break-words text-sm text-slate-600">{booking.parent_email}</p>
                          <p className="mt-1 text-sm text-slate-600">{booking.parent_phone}</p>
                        </div>
                        <div>
                          <p className="text-xs font-black uppercase text-slate-500">Session</p>
                          <p className="mt-1 font-black text-navy">
                            {session ? formatDateTime(session.start_datetime, session.timezone) : "Session not loaded"}
                          </p>
                          <p className="mt-1 text-sm text-slate-600">{session ? sessionFocusLabel(session) : "Not recorded"}</p>
                          <p className="mt-1 text-sm text-slate-600">{bookingProgramLabel(booking)}</p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <span className={`rounded-full border px-3 py-1 text-center text-[11px] font-black uppercase ${bookingAdminStatusBadgeClass(booking)}`}>
                          {bookingAdminStatusLabel(booking)}
                        </span>
                        <span className={`rounded-full border px-3 py-1 text-center text-[11px] font-black uppercase ${statusBadgeClass(booking.status)}`}>
                          {booking.status}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-mist px-3 py-1 text-center text-[11px] font-black uppercase text-slate-600">
                          {booking.waiver?.waiver_signed ? "Waiver signed" : "Waiver missing"}
                        </span>
                        <button type="button" onClick={() => setExpandedBookingId(isExpanded ? "" : booking.id)} className={secondaryButtonClass}>
                          {isExpanded ? "Hide Details" : "View Details"}
                        </button>
                      </div>
                    </div>

                    {isExpanded ? (
                      <div className="mt-5 grid gap-4 rounded-lg border border-slate-200 bg-mist p-4 lg:grid-cols-2">
                        <div className="grid gap-2 text-sm text-slate-600">
                          <p><span className="font-black text-navy">Booking source:</span> {booking.payment_type === "launch_pass_credit" ? "Training credit" : "Single Session"}</p>
                          {booking.manual_source ? (
                            <p><span className="font-black text-navy">Admin payment:</span> {booking.admin_payment_status || booking.status} · {paymentTypeLabel(booking)}</p>
                          ) : null}
                          <p><span className="font-black text-navy">Created:</span> {formatWaiverTimestamp(booking.created_at)}</p>
                          <p><span className="font-black text-navy">Amount:</span> {formatMoney(booking.amount_paid)}</p>
                          <p><span className="font-black text-navy">Player count:</span> {booking.player_count}</p>
                          <p><span className="font-black text-navy">Emergency:</span> {booking.emergency_name || "Not recorded"} - {booking.emergency_phone || "Not recorded"}</p>
                          <p><span className="font-black text-navy">Notes:</span> {booking.notes || "None"}</p>
                          <p><span className="font-black text-navy">Internal note:</span> {booking.internal_note || "None"}</p>
                          <p><span className="font-black text-navy">Medical:</span> {booking.medical_notes || "None"}</p>
                        </div>
                        <div className="grid gap-2 text-sm text-slate-600">
                          <p><span className="font-black text-navy">Media consent:</span> {booking.waiver?.media_consent || "Not recorded"}</p>
                          <p><span className="font-black text-navy">Waiver signature:</span> {booking.waiver?.typed_signature || "Not recorded"}</p>
                          <p><span className="font-black text-navy">Signed:</span> {formatWaiverTimestamp(booking.waiver?.signed_at)}</p>
                          <p><span className="font-black text-navy">Payment intent:</span> {booking.stripe_payment_intent_id || "Not recorded"}</p>
                          <p>
                            <span className="font-black text-navy">Calendar event:</span>{" "}
                            {booking.calendarEvent?.google_calendar_event_id || "Not recorded"}
                          </p>
                          <p>
                            <span className="font-black text-navy">Calendar status:</span>{" "}
                            {booking.calendar_sync_status || "Not recorded"}
                            {booking.calendar_sync_message ? ` · ${booking.calendar_sync_message}` : ""}
                          </p>
                          <p>
                            <span className="font-black text-navy">Email logs:</span>{" "}
                            {booking.emailLogs.length > 0
                              ? booking.emailLogs.map((log) => `${log.email_type}: ${log.status}`).join(" / ")
                              : "No email logs yet"}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button type="button" onClick={() => editBookingContact(booking)} className={secondaryButtonClass}>
                              Edit Contact Info
                            </button>
                            <button type="button" onClick={() => openEditManualBookingForm(booking, session)} className={secondaryButtonClass}>
                              Edit Booking
                            </button>
                            {isConfirmed ? (
                              <>
                                <button
                                  type="button"
                                  disabled={isUpdatingBooking}
                                  onClick={() => void resendBookingConfirmation(booking)}
                                  className={secondaryButtonClass}
                                >
                                  Resend Confirmation Email
                                </button>
                                <button
                                  type="button"
                                  disabled={isUpdatingBooking}
                                  onClick={() => void retryBookingCalendarSync(booking)}
                                  className={secondaryButtonClass}
                                >
                                  Retry Google Calendar Sync
                                </button>
                                <button
                                  type="button"
                                  disabled={isUpdatingBooking}
                                  onClick={() => void cancelAdminPlayerBooking(booking)}
                                  className={dangerButtonClass}
                                >
                                  {isUpdatingBooking ? "Removing..." : "Remove Player"}
                                </button>
                              </>
                            ) : null}
                            {!isConfirmed ? (
                              <>
                                <button
                                  type="button"
                                  disabled={isUpdatingBooking}
                                  onClick={() => void markBookingManuallyPaid(booking)}
                                  className={primaryButtonClass}
                                >
                                  {isUpdatingBooking ? "Updating..." : "Mark Manually Paid"}
                                </button>
                                <button
                                  type="button"
                                  disabled={isUpdatingBooking}
                                  onClick={() => void cancelIncompleteBooking(booking)}
                                  className={secondaryButtonClass}
                                >
                                  Cancel Incomplete
                                </button>
                                <button
                                  type="button"
                                  disabled={isUpdatingBooking}
                                  onClick={() => void deleteIncompleteBooking(booking)}
                                  className={dangerButtonClass}
                                >
                                  Delete Incomplete
                                </button>
                              </>
                            ) : null}
                            <button type="button" onClick={() => setActiveWaiverRecord({ booking, session })} className={navyButtonClass}>
                              View Waiver
                            </button>
                            <button type="button" onClick={() => printWaiverRecord(booking, session)} className={secondaryButtonClass}>
                              Print Waiver
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="p-5 sm:p-6">
              <p className="rounded-lg border border-slate-200 bg-mist p-5 text-sm font-bold text-slate-600">
                No bookings match the current filters.
              </p>
            </div>
          )}
        </section>
      ) : null}

      {activeSection === "passes" ? (
        <section className="panel overflow-hidden">
          <div className="grid gap-4 border-b border-slate-200 p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
            <div>
              <p className="text-xs font-black uppercase text-electric">Training Packages & Credits</p>
              <h3 className="mt-2 text-2xl font-black text-navy">Training Package tracking</h3>
              <p className="mt-2 text-sm text-slate-600">Review package purchases, remaining credits, and redemptions.</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-slate-200 bg-mist p-3">
                <p className="text-xl font-black text-navy">{passCounts.active}</p>
                <p className="text-[10px] font-black uppercase text-slate-500">Active</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-mist p-3">
                <p className="text-xl font-black text-navy">{passCounts.remainingCredits}</p>
                <p className="text-[10px] font-black uppercase text-slate-500">Credits Left</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-mist p-3">
                <p className="text-xl font-black text-navy">{passCounts.soldThisMonth}</p>
                <p className="text-[10px] font-black uppercase text-slate-500">This Month</p>
              </div>
            </div>
          </div>

          <div className="border-b border-slate-200 p-5 sm:p-6">
            <div className="flex flex-wrap gap-2">
              {[
                ["active", "Active Packages"],
                ["all", "All"],
                ["used-up", "Used Up"],
                ["four", "4-Session Package"],
                ["six", "6-Session Package"]
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPassFilter(value as PassFilter)}
                  className={`rounded-md border px-4 py-2 text-xs font-black uppercase transition ${
                    passFilter === value
                      ? "border-navy bg-navy text-white"
                      : "border-slate-300 bg-white text-navy hover:border-electric hover:text-electric"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-5 border-b border-slate-200 bg-mist p-5 sm:p-6">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
                <div>
                  <p className="text-xs font-black uppercase text-electric">Private Schedule Confirmation</p>
                  <h4 className="mt-1 text-xl font-black text-navy">Schedule Approval Link</h4>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Select an existing Training Package holder with open credits, or create a new manual 6-Session
                    Training Package for a player who already paid directly.
                  </p>
                </div>
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm font-black text-navy">
                  {scheduleApprovalSessionIds.length}/{scheduleApprovalRequiredSessionCount} sessions selected
                </div>
              </div>

              <div className="mt-5 grid gap-4">
                <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                  Existing Training Package Holder
                  <select
                    className={inputClass}
                    value={scheduleApprovalPassId}
                    onChange={(event) => selectScheduleApprovalPass(event.target.value)}
                  >
                    <option value="">Create new manual Training Package</option>
                    {activePasses.map((pass) => (
                      <option key={pass.id} value={pass.id}>
                        {pass.player_name} - {pass.parent_name} - {pass.remaining_credits} credit
                        {pass.remaining_credits === 1 ? "" : "s"} - {passTypeLabel(pass.pass_type)} - {pass.parent_email}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedScheduleApprovalPass ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold leading-6 text-emerald-900">
                    Existing package selected. Contact details have been filled in from the paid Training Package.
                    Available credits: {selectedScheduleApprovalPass.remaining_credits}.
                  </div>
                ) : null}
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-4">
                <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                  Player Name
                  <input className={inputClass} value={scheduleApprovalPlayerName} onChange={(event) => setScheduleApprovalPlayerName(event.target.value)} />
                </label>
                <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                  Player Age
                  <input className={inputClass} value={scheduleApprovalPlayerAge} onChange={(event) => setScheduleApprovalPlayerAge(event.target.value)} />
                </label>
                <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                  Parent Name
                  <input className={inputClass} value={scheduleApprovalParentName} onChange={(event) => setScheduleApprovalParentName(event.target.value)} />
                </label>
                <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                  Parent Email
                  <input className={inputClass} type="email" value={scheduleApprovalParentEmail} onChange={(event) => setScheduleApprovalParentEmail(event.target.value)} />
                </label>
                <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                  Parent Phone
                  <input className={inputClass} value={scheduleApprovalParentPhone} onChange={(event) => setScheduleApprovalParentPhone(event.target.value)} />
                </label>
                <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                  Training Group
                  <select
                    className={inputClass}
                    value={scheduleApprovalGroup}
                    disabled={Boolean(selectedScheduleApprovalPass)}
                    onChange={(event) => {
                      setScheduleApprovalGroup(event.target.value as TrainingGroupId);
                      setScheduleApprovalSessionIds([]);
                    }}
                  >
                    {trainingGroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name} ({group.ages})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                  Plan Type
                  <input className={inputClass} value={selectedScheduleApprovalPass ? passTypeLabel(selectedScheduleApprovalPass.pass_type) : "6-Session Training Package"} readOnly />
                </label>
                <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                  Amount Paid
                  <input className={inputClass} type="number" min={0} value={scheduleApprovalAmountPaid} onChange={(event) => setScheduleApprovalAmountPaid(event.target.value)} />
                </label>
                <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                  Payment Method
                  <select className={inputClass} value={scheduleApprovalPaymentMethod} onChange={(event) => setScheduleApprovalPaymentMethod(event.target.value as ScheduleApprovalPaymentMethod)}>
                    {scheduleApprovalPaymentMethods.map((method) => (
                      <option key={method.value} value={method.value}>
                        {method.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-xs font-black uppercase text-slate-500 lg:col-span-3">
                  Internal Note
                  <input
                    className={inputClass}
                    value={scheduleApprovalNote}
                    onChange={(event) => setScheduleApprovalNote(event.target.value)}
                    placeholder="Optional note, visible only in admin records"
                  />
                </label>
              </div>

              <div className="mt-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs font-black uppercase text-slate-500">
                    Propose {scheduleApprovalRequiredSessionCount} Sessions
                  </p>
                  {selectedScheduleApprovalPass ? (
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                      <input
                        type="checkbox"
                        checked={scheduleApprovalOverrideCount}
                        onChange={(event) => {
                          setScheduleApprovalOverrideCount(event.target.checked);
                          setScheduleApprovalSessionIds([]);
                          setScheduleApprovalOverrideSessionCount(String(selectedScheduleApprovalPass.remaining_credits));
                        }}
                      />
                      Override session count
                    </label>
                  ) : null}
                </div>
                {scheduleApprovalOverrideCount ? (
                  <label className="mt-3 grid max-w-xs gap-2 text-xs font-black uppercase text-slate-500">
                    Sessions to propose
                    <input
                      className={inputClass}
                      type="number"
                      min={1}
                      max={selectedScheduleApprovalPass?.remaining_credits ?? 6}
                      value={scheduleApprovalOverrideSessionCount}
                      onChange={(event) => {
                        setScheduleApprovalOverrideSessionCount(event.target.value);
                        setScheduleApprovalSessionIds([]);
                      }}
                    />
                  </label>
                ) : null}
                <div className="mt-3 grid max-h-[28rem] gap-3 overflow-y-auto rounded-lg border border-slate-200 bg-mist p-3">
                  {scheduleApprovalSessions.length > 0 ? (
                    scheduleApprovalSessions.map((session) => {
                      const selected = scheduleApprovalSessionIds.includes(session.id);

                      return (
                        <button
                          key={session.id}
                          type="button"
                          onClick={() => toggleScheduleApprovalSession(session.id)}
                          className={`rounded-lg border p-4 text-left transition ${
                            selected
                              ? "border-electric bg-blue-50 shadow-sm shadow-electric/10"
                              : "border-slate-200 bg-white hover:border-electric/60"
                          }`}
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-sm font-black text-navy">{formatDateTime(session.start_datetime, session.timezone)}</p>
                              <p className="mt-1 text-sm font-bold text-slate-600">{sessionFocusLabel(session)}</p>
                              <p className="mt-1 text-xs font-bold text-slate-500">{session.location || business.location}</p>
                            </div>
                            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-black uppercase text-navy">
                              {session.remainingSpots} spots left
                            </span>
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm font-bold text-slate-600">
                      No open future sessions are available for this training group.
                    </p>
                  )}
                </div>
              </div>

              {scheduleApprovalUrl ? (
                <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-sm font-black text-emerald-900">Private link created</p>
                  <input className={`${inputClass} mt-3`} readOnly value={scheduleApprovalUrl} />
                </div>
              ) : null}

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold leading-6 text-slate-600">
                  Parent will not pay again. The sessions book only after they confirm the private link.
                </p>
                <button
                  type="button"
                  disabled={isSaving || scheduleApprovalSessionIds.length !== scheduleApprovalRequiredSessionCount}
                  onClick={() => void createScheduleApprovalLink()}
                  className={primaryButtonClass}
                >
                  Create & Send Link
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
                <div>
                  <p className="text-xs font-black uppercase text-electric">Manual Credit Adjustment</p>
                  <h4 className="mt-1 text-xl font-black text-navy">Add Manual Credit</h4>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Use this for weather, past cancellations, corrections, or goodwill credits. Manual credits require confirmation before saving.
                  </p>
                </div>
                {selectedManualCreditPass ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                    <p className="font-black">Current remaining: {selectedManualCreditPass.remaining_credits}</p>
                    <p className="mt-1 font-black">After credit: {selectedManualCreditPass.remaining_credits + manualCreditAmountNumber}</p>
                  </div>
                ) : null}
              </div>
              <div className="mt-5 grid gap-4 lg:grid-cols-4">
                <label className="grid gap-2 text-xs font-black uppercase text-slate-500 lg:col-span-2">
                  Select Training Package
                  <select className={inputClass} value={manualCreditPassId} onChange={(event) => setManualCreditPassId(event.target.value)}>
                    <option value="">Choose a paid Training Package</option>
                    {paidPasses.map((pass) => (
                      <option key={pass.id} value={pass.id}>
                        {pass.player_name} - {pass.parent_email} - {pass.remaining_credits}/{pass.total_credits} credits
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                  Credit Amount
                  <input
                    className={inputClass}
                    min={1}
                    type="number"
                    value={manualCreditAmount}
                    onChange={(event) => setManualCreditAmount(event.target.value)}
                  />
                </label>
                <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                  Reason
                  <select className={inputClass} value={manualCreditReason} onChange={(event) => setManualCreditReason(event.target.value)}>
                    {manualCreditReasons.map((reason) => (
                      <option key={reason} value={reason}>
                        {reason}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-xs font-black uppercase text-slate-500 lg:col-span-3">
                  Optional Note
                  <input
                    className={inputClass}
                    value={manualCreditNote}
                    onChange={(event) => setManualCreditNote(event.target.value)}
                    placeholder="Internal note for this adjustment"
                  />
                </label>
                <div className="grid gap-3">
                  <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-mist p-3 text-sm font-bold text-slate-700">
                    <input
                      className="mt-1"
                      type="checkbox"
                      checked={manualCreditSendEmail}
                      onChange={(event) => setManualCreditSendEmail(event.target.checked)}
                    />
                    Send parent email confirmation
                  </label>
                  <button type="button" disabled={isSaving || !selectedManualCreditPass} onClick={() => void addManualCredit()} className={primaryButtonClass}>
                    Add Manual Credit
                  </button>
                </div>
              </div>
            </div>
          </div>

          {filteredPasses.length > 0 ? (
            <div className="grid divide-y divide-slate-200">
              {filteredPasses.map((pass) => {
                const selectedSessions = (pass.selected_session_ids ?? [])
                  .map((sessionId) => sessionById.get(sessionId))
                  .filter((session): session is AdminTrainingSession => Boolean(session));

                return (
                  <article key={pass.id} className="grid gap-4 p-5">
                    <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
                      <div>
                        <p className="text-xs font-black uppercase text-electric">{passTypeLabel(pass.pass_type)}</p>
                        <h4 className="mt-1 text-lg font-black text-navy">{pass.player_name}</h4>
                        <p className="mt-1 text-sm text-slate-600">
                          Parent: {pass.parent_name} - {pass.parent_email} - {pass.parent_phone}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">Training group: {trainingGroupLabel(pass.training_group)}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-mist p-4 text-sm">
                        <p className="font-black text-navy">
                          {pass.remaining_credits}/{pass.total_credits} credits remaining
                        </p>
                        <p className="mt-1 text-slate-600">Status: {pass.status}</p>
                        <p className="mt-1 text-slate-600">Training credits do not expire</p>
                        <p className="mt-1 text-slate-600">Paid: {formatMoney(pass.amount_paid)}</p>
                        <button type="button" onClick={() => editPassContact(pass)} className={`${secondaryButtonClass} mt-3 w-full`}>
                          Edit Contact Info
                        </button>
                      </div>
                    </div>
                    {(pass.selected_session_ids ?? []).length > 0 ? (
                      <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <p className="text-xs font-black uppercase text-electric">Sessions Selected At Purchase</p>
                        <div className="mt-3 grid gap-2 text-sm text-slate-600">
                          {selectedSessions.length > 0 ? (
                            selectedSessions.map((session) => (
                              <p key={session.id}>
                                {formatDateTime(session.start_datetime, session.timezone)} - {sessionFocusLabel(session)}
                              </p>
                            ))
                          ) : (
                            <p>{(pass.selected_session_ids ?? []).join(", ")}</p>
                          )}
                        </div>
                      </div>
                    ) : null}
                    {pass.redemptions.length > 0 ? (
                      <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <p className="text-xs font-black uppercase text-electric">Redemption History</p>
                        <div className="mt-3 grid gap-2 text-sm text-slate-600">
                          {pass.redemptions.map((redemption) => {
                            const session = sessionById.get(redemption.session_id);

                            return (
                              <p key={redemption.id}>
                                {formatWaiverTimestamp(redemption.created_at)} - {redemption.credits_used} credit used
                                {redemption.booking ? ` for ${redemption.booking.player_name}` : ""}
                                {session ? ` (${formatDateTime(session.start_datetime, session.timezone)})` : ""}
                              </p>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <p className="rounded-lg border border-slate-200 bg-mist p-4 text-sm font-bold text-slate-600">
                        No credits used yet.
                      </p>
                    )}
                    {pass.adjustments.length > 0 ? (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                        <p className="text-xs font-black uppercase text-emerald-700">Credit Adjustments</p>
                        <div className="mt-3 grid gap-2 text-sm text-emerald-900">
                          {pass.adjustments.map((adjustment) => {
                            const relatedSession = adjustment.original_session_id
                              ? sessionById.get(adjustment.original_session_id)
                              : null;

                            return (
                              <p key={adjustment.id}>
                                Credit added: {adjustment.credit_amount} - {adjustment.reason} -{" "}
                                {formatWaiverTimestamp(adjustment.created_at)}
                                {relatedSession ? ` (${formatDateTime(relatedSession.start_datetime, relatedSession.timezone)})` : ""}
                                {` - Type: ${adjustment.adjustment_type || "credit"} - Email: ${adjustment.email_status}`}
                              </p>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="p-5 sm:p-6">
              <p className="rounded-lg border border-slate-200 bg-mist p-5 text-sm font-bold text-slate-600">
                No Training Packages match this filter.
              </p>
            </div>
          )}
        </section>
      ) : null}

      {activeSection === "private-requests" ? (
        <section className="panel overflow-hidden">
          <div className="grid gap-4 border-b border-slate-200 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-start">
            <div>
              <p className="text-xs font-black uppercase text-electric">Private 1-on-1 Requests</p>
              <h3 className="mt-2 text-2xl font-black text-navy">Review and schedule private session inquiries.</h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                These requests are inquiry-only. Scheduling a request adds it to the admin queue and attempts Google
                Calendar sync, but it does not affect small group capacity or training credits.
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-mist p-4 text-sm">
              <p className="text-2xl font-black text-navy">{privateSessionRequests.length}</p>
              <p className="text-[10px] font-black uppercase text-slate-500">Total Requests</p>
              <p className="mt-2 font-black text-electric">
                {privateSessionRequests.filter((request) => request.status === "new").length} New
              </p>
            </div>
          </div>

          {privateSessionRequests.length > 0 ? (
            <div className="grid divide-y divide-slate-200">
              {privateSessionRequests.map((request) => {
                const scheduleInput = privateRequestScheduleInputs[request.id] ?? {
                  date: request.scheduled_start ? formatDateOnly(request.scheduled_start, request.timezone) : "",
                  startTime: request.scheduled_start ? formatTimeInput(request.scheduled_start, request.timezone) : "17:00",
                  endTime: request.scheduled_end ? formatTimeInput(request.scheduled_end, request.timezone) : "18:00",
                  location: request.location || business.location
                };

                return (
                  <article key={request.id} className="grid gap-5 p-5 sm:p-6">
                    <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-electric/30 bg-blue-50 px-3 py-1 text-[11px] font-black uppercase text-electric">
                            Private 1-on-1
                          </span>
                          <span className="rounded-full border border-slate-200 bg-mist px-3 py-1 text-[11px] font-black uppercase text-navy">
                            {request.status}
                          </span>
                          {request.calendar_status ? (
                            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-black uppercase text-slate-600">
                              Calendar: {request.calendar_status}
                            </span>
                          ) : null}
                        </div>
                        <h4 className="mt-3 text-xl font-black text-navy">{request.player_name}</h4>
                        <p className="mt-1 text-sm font-bold text-slate-600">Age {request.player_age}</p>
                        <p className="mt-3 text-sm leading-6 text-slate-600">
                          Parent: {request.parent_name} - {request.parent_email} - {request.parent_phone}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          Preferred times: {request.preferred_times}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          Focus: {request.focus_areas.length > 0 ? request.focus_areas.join(", ") : "Not selected"}
                        </p>
                        {request.notes ? <p className="mt-2 text-sm leading-6 text-slate-600">Notes: {request.notes}</p> : null}
                        {request.scheduled_start ? (
                          <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-900">
                            Scheduled: {formatDateTime(request.scheduled_start, request.timezone)}
                          </p>
                        ) : null}
                        {request.calendar_message ? (
                          <p className="mt-2 text-sm font-semibold text-slate-600">{request.calendar_message}</p>
                        ) : null}
                      </div>
                      <div className="grid gap-3 rounded-lg border border-slate-200 bg-mist p-4 text-sm">
                        <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                          Status
                          <select
                            className={inputClass}
                            value={request.status}
                            disabled={isSaving}
                            onChange={(event) =>
                              void updatePrivateRequestStatus(request.id, event.target.value as PrivateSessionRequestStatus)
                            }
                          >
                            {["new", "contacted", "scheduled", "completed", "cancelled"].map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                      <p className="text-xs font-black uppercase text-electric">Schedule Private Session</p>
                      <div className="mt-4 grid gap-4 lg:grid-cols-4">
                        <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                          Date
                          <input
                            className={inputClass}
                            type="date"
                            value={scheduleInput.date}
                            onChange={(event) => updatePrivateRequestScheduleInput(request, { date: event.target.value })}
                          />
                        </label>
                        <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                          Start Time
                          <input
                            className={inputClass}
                            type="time"
                            value={scheduleInput.startTime}
                            onChange={(event) => updatePrivateRequestScheduleInput(request, { startTime: event.target.value })}
                          />
                        </label>
                        <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                          End Time
                          <input
                            className={inputClass}
                            type="time"
                            value={scheduleInput.endTime}
                            onChange={(event) => updatePrivateRequestScheduleInput(request, { endTime: event.target.value })}
                          />
                        </label>
                        <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                          Location
                          <input
                            className={inputClass}
                            value={scheduleInput.location}
                            onChange={(event) => updatePrivateRequestScheduleInput(request, { location: event.target.value })}
                          />
                        </label>
                      </div>
                      <div className="mt-4 flex justify-end">
                        <button
                          type="button"
                          disabled={isSaving || !scheduleInput.date || !scheduleInput.startTime}
                          onClick={() => void schedulePrivateRequest(request)}
                          className={primaryButtonClass}
                        >
                          Schedule Private Session
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="p-5 text-sm font-bold text-slate-600">No private session requests yet.</p>
          )}
        </section>
      ) : null}

      {activeSection === "direct-payments" ? (
        <section className="panel overflow-hidden">
          <div className="grid gap-4 border-b border-slate-200 p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
            <div>
              <p className="text-xs font-black uppercase text-electric">Direct Payments</p>
              <h3 className="mt-2 text-2xl font-black text-navy">Pay + waiver submissions</h3>
              <p className="mt-2 text-sm text-slate-600">Review card and Zelle submissions from the direct payment page.</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-slate-200 bg-mist p-3">
                <p className="text-xl font-black text-navy">{directPaymentCounts.pending}</p>
                <p className="text-[10px] font-black uppercase text-slate-500">Pending</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-mist p-3">
                <p className="text-xl font-black text-navy">{directPaymentCounts.zellePending}</p>
                <p className="text-[10px] font-black uppercase text-slate-500">Zelle</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-mist p-3">
                <p className="text-xl font-black text-navy">{directPaymentCounts.paid}</p>
                <p className="text-[10px] font-black uppercase text-slate-500">Paid</p>
              </div>
            </div>
          </div>

          <div className="border-b border-slate-200 p-5 sm:p-6">
            <div className="flex flex-wrap gap-2">
              {[
                ["all", "All"],
                ["zelle-pending", "Zelle Pending"],
                ["card-paid", "Card Paid"],
                ["pending-card", "Pending Card"],
                ["single-session", "Single Session"],
                ["four-pass", "4-Session Package"],
                ["six-pass", "6-Session Package"]
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setDirectPaymentFilter(value as DirectPaymentFilter)}
                  className={`rounded-md border px-4 py-2 text-xs font-black uppercase transition ${
                    directPaymentFilter === value
                      ? "border-navy bg-navy text-white"
                      : "border-slate-300 bg-white text-navy hover:border-electric hover:text-electric"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {filteredDirectPayments.length > 0 ? (
            <div className="grid gap-4 bg-mist p-4 sm:p-6">
              {filteredDirectPayments.map((payment) => {
                const isExpanded = expandedDirectPaymentId === payment.id;

                return (
                  <article key={payment.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
                      <div className="grid gap-4 md:grid-cols-4">
                        <div>
                          <p className="text-xs font-black uppercase text-slate-500">Player(s)</p>
                          <h4 className="mt-1 text-lg font-black text-navy">{playerNamesForDirectPayment(payment)}</h4>
                          <p className="mt-1 text-sm text-slate-600">
                            {payment.player_count} player(s)
                            {payment.payment_option === "single_session" ? ` - ${payment.session_count || 1} session(s)` : ""}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-black uppercase text-slate-500">Parent</p>
                          <p className="mt-1 font-black text-navy">{payment.parent_name}</p>
                          <p className="mt-1 break-words text-sm text-slate-600">{payment.parent_email}</p>
                        </div>
                        <div>
                          <p className="text-xs font-black uppercase text-slate-500">Payment</p>
                          <p className="mt-1 font-black text-navy">{directPaymentOptionLabel(payment.payment_option)}</p>
                          <p className="mt-1 text-sm text-slate-600">{directPaymentMethodLabel(payment.payment_method)}</p>
                        </div>
                        <div>
                          <p className="text-xs font-black uppercase text-slate-500">Total</p>
                          <p className="mt-1 text-lg font-black text-navy">{formatMoney(payment.amount_due)}</p>
                          <span className={`mt-2 inline-flex rounded-full border px-3 py-1 text-[11px] font-black uppercase ${directPaymentStatusBadge(payment.status)}`}>
                            {paymentStatusLabel(payment.status)}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        {payment.status === "zelle_pending" ? (
                          <button type="button" disabled={isSaving} onClick={() => void updateDirectPayment(payment.id, "paid")} className={primaryButtonClass}>
                            Mark Zelle Paid
                          </button>
                        ) : null}
                        <button type="button" onClick={() => setExpandedDirectPaymentId(isExpanded ? "" : payment.id)} className={secondaryButtonClass}>
                          {isExpanded ? "Hide Details" : "View Details"}
                        </button>
                        <button type="button" onClick={() => editDirectPaymentContact(payment)} className={secondaryButtonClass}>
                          Edit Contact Info
                        </button>
                      </div>
                    </div>

                    {isExpanded ? (
                      <div className="mt-5 grid gap-4 rounded-lg border border-slate-200 bg-mist p-4 lg:grid-cols-2">
                        <div className="grid gap-2 text-sm text-slate-600">
                          <p><span className="font-black text-navy">Parent phone:</span> {payment.parent_phone}</p>
                          <p><span className="font-black text-navy">Player 1 age:</span> {payment.player_age}</p>
                          {payment.player_count === 2 ? (
                            <p><span className="font-black text-navy">Player 2 age:</span> {payment.second_player_age || "Not recorded"}</p>
                          ) : null}
                          <p><span className="font-black text-navy">Emergency:</span> {payment.emergency_name} - {payment.emergency_phone}</p>
                          <p><span className="font-black text-navy">Medical:</span> {payment.medical_notes}</p>
                          <p><span className="font-black text-navy">Submitted:</span> {formatWaiverTimestamp(payment.created_at)}</p>
                        </div>
                        <div className="grid gap-2 text-sm text-slate-600">
                          <p><span className="font-black text-navy">Waiver status:</span> {payment.waiver_signed ? "Signed" : "Missing"}</p>
                          <p><span className="font-black text-navy">Typed signature:</span> {payment.typed_signature || "Not recorded"}</p>
                          <p><span className="font-black text-navy">Signed at:</span> {formatWaiverTimestamp(payment.signed_at)}</p>
                          <p><span className="font-black text-navy">Media consent:</span> {payment.media_consent}</p>
                          <p><span className="font-black text-navy">Stripe session:</span> {payment.stripe_checkout_session_id || "Not recorded"}</p>
                          <p><span className="font-black text-navy">Payment intent:</span> {payment.stripe_payment_intent_id || "Not recorded"}</p>
                          {payment.status !== "cancelled" ? (
                            <button type="button" disabled={isSaving} onClick={() => void updateDirectPayment(payment.id, "cancelled")} className={`${dangerButtonClass} mt-2 w-fit`}>
                              Cancel Record
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="p-5 sm:p-6">
              <p className="rounded-lg border border-slate-200 bg-mist p-5 text-sm font-bold text-slate-600">
                No direct payments match this filter.
              </p>
            </div>
          )}
        </section>
      ) : null}

      {activeSection === "email-list" ? (
        <section className="panel overflow-hidden">
          <div className="grid gap-4 border-b border-slate-200 p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
            <div>
              <p className="text-xs font-black uppercase text-electric">Email List</p>
              <h3 className="mt-2 text-2xl font-black text-navy">Marketing opt-ins for Brevo</h3>
              <p className="mt-2 text-sm text-slate-600">
                Export only parents who checked the email list box. Transactional booking emails are separate.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center sm:min-w-64">
              <div className="rounded-lg border border-slate-200 bg-mist p-3">
                <p className="text-xl font-black text-navy">{activeEmailSubscribers.length}</p>
                <p className="text-[10px] font-black uppercase text-slate-500">Active</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-mist p-3">
                <p className="text-xl font-black text-navy">{emailSubscribers.length}</p>
                <p className="text-[10px] font-black uppercase text-slate-500">Total</p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold leading-6 text-slate-600">
                CSV export includes active subscribers only: opted in and not unsubscribed.
              </p>
              <button
                type="button"
                onClick={exportEmailSubscribersCsv}
                disabled={activeEmailSubscribers.length === 0}
                className={primaryButtonClass}
              >
                Export CSV
              </button>
            </div>

            {emailSubscribers.length > 0 ? (
              <div className="grid gap-3">
                {emailSubscribers.map((subscriber) => {
                  const isActive = subscriber.opted_in && !subscriber.unsubscribed;

                  return (
                    <article key={subscriber.id} className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 lg:grid-cols-[1fr_auto] lg:items-start">
                      <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
                        <p>
                          <span className="block text-[10px] font-black uppercase text-slate-500">Parent Name</span>
                          <span className="font-black text-navy">{subscriber.parent_name || "Not provided"}</span>
                        </p>
                        <p>
                          <span className="block text-[10px] font-black uppercase text-slate-500">Email</span>
                          <span className="break-words font-black text-navy">{subscriber.email}</span>
                        </p>
                        <p>
                          <span className="block text-[10px] font-black uppercase text-slate-500">Phone</span>
                          <span className="font-semibold">{subscriber.phone || "Not provided"}</span>
                        </p>
                        <p>
                          <span className="block text-[10px] font-black uppercase text-slate-500">Player</span>
                          <span className="font-semibold">
                            {subscriber.player_name || "Not provided"}
                            {subscriber.player_age ? `, ${subscriber.player_age}` : ""}
                          </span>
                        </p>
                        <p>
                          <span className="block text-[10px] font-black uppercase text-slate-500">Source</span>
                          <span className="font-semibold">{subscriber.source || "Not recorded"}</span>
                        </p>
                        <p>
                          <span className="block text-[10px] font-black uppercase text-slate-500">Opt-in Date</span>
                          <span className="font-semibold">{formatWaiverTimestamp(subscriber.opted_in_at)}</span>
                        </p>
                        <p>
                          <span className="block text-[10px] font-black uppercase text-slate-500">Status</span>
                          <span className={`font-black ${isActive ? "text-field" : "text-red-700"}`}>
                            {isActive ? "Active" : "Unsubscribed"}
                          </span>
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => editEmailSubscriberContact(subscriber)}
                          className={secondaryButtonClass}
                        >
                          Edit Contact Info
                        </button>
                        {subscriber.unsubscribed ? (
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => void updateEmailSubscriber(subscriber.id, false)}
                            className={secondaryButtonClass}
                          >
                            Reactivate
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => void updateEmailSubscriber(subscriber.id, true)}
                            className="rounded-md border border-amber-200 px-4 py-2 text-xs font-black uppercase text-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Unsubscribe
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => void removeEmailSubscriber(subscriber.id)}
                          className={dangerButtonClass}
                        >
                          Remove
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-lg border border-slate-200 bg-mist p-5 text-sm font-bold text-slate-600">
                No email subscribers yet.
              </p>
            )}
          </div>
        </section>
      ) : null}

      {activeManualBooking ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-navy/70 px-4 py-8">
          <div className="mx-auto max-w-5xl rounded-xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase text-electric">Admin Booking</p>
                <h3 className="mt-1 text-2xl font-black text-navy">
                  {activeManualBooking.mode === "add" ? "Add Player Manually" : "Edit Booking"}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {activeManualBooking.mode === "add"
                    ? `${sessionFocusLabel(activeManualBooking.session)} · ${formatDateTime(activeManualBooking.session.start_datetime, activeManualBooking.session.timezone)}`
                    : activeManualBooking.session
                      ? `${sessionFocusLabel(activeManualBooking.session)} · ${formatDateTime(activeManualBooking.session.start_datetime, activeManualBooking.session.timezone)}`
                      : "Update saved booking details."}
                </p>
              </div>
              <button type="button" onClick={() => setActiveManualBooking(null)} className={secondaryButtonClass}>
                Close
              </button>
            </div>

            {Object.keys(manualBookingErrors).length > 0 ? (
              <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-black text-red-700">
                Please complete the highlighted required fields before saving.
              </p>
            ) : null}

            <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr]">
              <div className="grid gap-4">
                <div className="rounded-lg border border-slate-200 bg-mist p-4">
                  <p className="text-xs font-black uppercase text-electric">Player & Parent</p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                      Player Name
                      <input
                        className={manualFieldClass("playerName")}
                        value={manualBookingForm.playerName}
                        onChange={(event) => updateManualBookingField("playerName", event.target.value)}
                      />
                      {manualFieldError("playerName")}
                    </label>
                    <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                      Player Age
                      <input
                        className={manualFieldClass("playerAge")}
                        value={manualBookingForm.playerAge}
                        onChange={(event) => updateManualBookingField("playerAge", event.target.value)}
                      />
                      {manualFieldError("playerAge")}
                    </label>
                    <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                      Parent Name
                      <input
                        className={manualFieldClass("parentName")}
                        value={manualBookingForm.parentName}
                        onChange={(event) => updateManualBookingField("parentName", event.target.value)}
                      />
                      {manualFieldError("parentName")}
                    </label>
                    <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                      Parent Email
                      <input
                        className={manualFieldClass("parentEmail")}
                        type="email"
                        value={manualBookingForm.parentEmail}
                        onChange={(event) => updateManualBookingField("parentEmail", event.target.value)}
                      />
                      {manualFieldError("parentEmail")}
                    </label>
                    <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                      Parent Phone
                      <input
                        className={manualFieldClass("parentPhone")}
                        value={manualBookingForm.parentPhone}
                        onChange={(event) => updateManualBookingField("parentPhone", event.target.value)}
                      />
                      {manualFieldError("parentPhone")}
                    </label>
                    <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                      Emergency Contact Name
                      <input
                        className={inputClass}
                        value={manualBookingForm.emergencyName}
                        onChange={(event) => updateManualBookingField("emergencyName", event.target.value)}
                      />
                    </label>
                    <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                      Emergency Contact Phone
                      <input
                        className={inputClass}
                        value={manualBookingForm.emergencyPhone}
                        onChange={(event) => updateManualBookingField("emergencyPhone", event.target.value)}
                      />
                    </label>
                    <label className="grid gap-2 text-xs font-black uppercase text-slate-500 sm:col-span-2">
                      Medical Notes
                      <textarea
                        className={`${inputClass} min-h-24`}
                        value={manualBookingForm.medicalNotes}
                        onChange={(event) => updateManualBookingField("medicalNotes", event.target.value)}
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div className="grid gap-4">
                <div className="rounded-lg border border-slate-200 bg-mist p-4">
                  <p className="text-xs font-black uppercase text-electric">Payment & Admin Notes</p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                      Payment Status
                      <select
                        className={inputClass}
                        value={manualBookingForm.paymentStatus}
                        onChange={(event) => updateManualBookingField("paymentStatus", event.target.value as ManualBookingPaymentStatus)}
                      >
                        {manualBookingPaymentStatuses.map((status) => (
                          <option key={status.value} value={status.value}>
                            {status.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                      Payment Method
                      <select
                        className={inputClass}
                        value={manualBookingForm.paymentMethod}
                        onChange={(event) => updateManualBookingField("paymentMethod", event.target.value as ManualBookingPaymentMethod)}
                      >
                        {manualBookingPaymentMethods.map((method) => (
                          <option key={method.value} value={method.value}>
                            {method.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                      Amount Paid
                      <input
                        className={manualFieldClass("amountPaid")}
                        type="number"
                        min="0"
                        step="0.01"
                        value={manualBookingForm.amountPaid}
                        onChange={(event) => updateManualBookingField("amountPaid", event.target.value)}
                      />
                      {manualFieldError("amountPaid")}
                    </label>
                    <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                      Waiver Status
                      <select
                        className={inputClass}
                        value={manualBookingForm.waiverStatus}
                        onChange={(event) => updateManualBookingField("waiverStatus", event.target.value as ManualBookingWaiverStatus)}
                      >
                        <option value="missing">Waiver missing</option>
                        <option value="signed">Waiver signed</option>
                      </select>
                    </label>

                    {manualBookingForm.paymentMethod === "Training Package credit" ? (
                      <label className="grid gap-2 text-xs font-black uppercase text-slate-500 sm:col-span-2">
                        Training Package Holder
                        <select
                          className={manualFieldClass("passPurchaseId")}
                          value={manualBookingForm.passPurchaseId}
                          onChange={(event) => updateManualBookingField("passPurchaseId", event.target.value)}
                        >
                          <option value="">Choose active package...</option>
                          {activePasses.map((pass) => (
                            <option key={pass.id} value={pass.id}>
                              {pass.player_name} · {pass.parent_email} · {pass.remaining_credits}/{pass.total_credits} credits
                            </option>
                          ))}
                        </select>
                        {manualFieldError("passPurchaseId")}
                      </label>
                    ) : null}

                    <label className="grid gap-2 text-xs font-black uppercase text-slate-500 sm:col-span-2">
                      Internal Note
                      <textarea
                        className={`${inputClass} min-h-24`}
                        value={manualBookingForm.internalNote}
                        onChange={(event) => updateManualBookingField("internalNote", event.target.value)}
                      />
                    </label>
                  </div>
                </div>

                {activeManualBooking.mode === "add" ? (
                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <label className="flex items-start gap-3 text-sm font-bold leading-6 text-slate-700">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-electric"
                        checked={manualBookingForm.overrideCapacity}
                        onChange={(event) => updateManualBookingField("overrideCapacity", event.target.checked)}
                      />
                      <span>Admin override: allow this booking even if the session is full or closed.</span>
                    </label>
                    <label className="mt-3 flex items-start gap-3 text-sm font-bold leading-6 text-slate-700">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-electric"
                        checked={manualBookingForm.sendConfirmationEmail}
                        onChange={(event) => updateManualBookingField("sendConfirmationEmail", event.target.checked)}
                        disabled={manualBookingForm.paymentStatus === "pending_payment"}
                      />
                      <span>Send confirmation email to parent</span>
                    </label>
                    {manualBookingForm.paymentStatus === "pending_payment" ? (
                      <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800">
                        Pending bookings do not count as confirmed and will not send confirmation email or sync to Google Calendar.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setActiveManualBooking(null)} className={secondaryButtonClass}>
                Cancel
              </button>
              <button type="button" disabled={savingManualBooking} onClick={() => void saveManualBooking()} className={primaryButtonClass}>
                {savingManualBooking ? "Saving..." : activeManualBooking.mode === "add" ? "Save Manual Booking" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activeContactEdit ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-navy/70 px-4 py-8">
          <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase text-electric">Admin Edit</p>
                <h3 className="mt-1 text-2xl font-black text-navy">{activeContactEdit.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Update names, email, phone, or player age without changing payment status, waiver language, or credit balances.
                </p>
              </div>
              <button type="button" onClick={() => setActiveContactEdit(null)} className={secondaryButtonClass}>
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                Parent/Guardian Name
                <input
                  className={inputClass}
                  value={contactForm.parentName}
                  onChange={(event) => setContactForm((current) => ({ ...current, parentName: event.target.value }))}
                />
              </label>
              <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                Parent Email
                <input
                  className={inputClass}
                  type="email"
                  value={contactForm.parentEmail}
                  onChange={(event) => setContactForm((current) => ({ ...current, parentEmail: event.target.value }))}
                />
              </label>
              <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                Parent Phone
                <input
                  className={inputClass}
                  value={contactForm.parentPhone}
                  onChange={(event) => setContactForm((current) => ({ ...current, parentPhone: event.target.value }))}
                />
              </label>

              {activeContactEdit.showPlayerFullName ? (
                <>
                  <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                    Player Full Name
                    <input
                      className={inputClass}
                      value={contactForm.playerName}
                      onChange={(event) => setContactForm((current) => ({ ...current, playerName: event.target.value }))}
                    />
                  </label>
                  <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                    Player Age
                    <input
                      className={inputClass}
                      value={contactForm.playerAge}
                      onChange={(event) => setContactForm((current) => ({ ...current, playerAge: event.target.value }))}
                    />
                  </label>
                </>
              ) : null}

              {activeContactEdit.showPlayerSplitName ? (
                <>
                  <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                    Player 1 First Name
                    <input
                      className={inputClass}
                      value={contactForm.playerFirstName}
                      onChange={(event) => setContactForm((current) => ({ ...current, playerFirstName: event.target.value }))}
                    />
                  </label>
                  <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                    Player 1 Last Name
                    <input
                      className={inputClass}
                      value={contactForm.playerLastName}
                      onChange={(event) => setContactForm((current) => ({ ...current, playerLastName: event.target.value }))}
                    />
                  </label>
                  <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                    Player 1 Age
                    <input
                      className={inputClass}
                      value={contactForm.playerAge}
                      onChange={(event) => setContactForm((current) => ({ ...current, playerAge: event.target.value }))}
                    />
                  </label>
                  {activeContactEdit.showSecondPlayer ? (
                    <>
                      <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                        Player 2 First Name
                        <input
                          className={inputClass}
                          value={contactForm.secondPlayerFirstName}
                          onChange={(event) => setContactForm((current) => ({ ...current, secondPlayerFirstName: event.target.value }))}
                        />
                      </label>
                      <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                        Player 2 Last Name
                        <input
                          className={inputClass}
                          value={contactForm.secondPlayerLastName}
                          onChange={(event) => setContactForm((current) => ({ ...current, secondPlayerLastName: event.target.value }))}
                        />
                      </label>
                      <label className="grid gap-2 text-xs font-black uppercase text-slate-500">
                        Player 2 Age
                        <input
                          className={inputClass}
                          value={contactForm.secondPlayerAge}
                          onChange={(event) => setContactForm((current) => ({ ...current, secondPlayerAge: event.target.value }))}
                        />
                      </label>
                    </>
                  ) : null}
                </>
              ) : null}
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setActiveContactEdit(null)} className={secondaryButtonClass}>
                Cancel
              </button>
              <button type="button" disabled={isSaving} onClick={() => void saveContactInfo()} className={primaryButtonClass}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activeWaiverRecord ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-navy/70 px-4 py-8">
          <div className="mx-auto max-w-4xl border border-slate-300 bg-[#fffdf8] p-5 shadow-2xl sm:p-8">
            <div className="flex flex-col gap-4 border-b border-slate-300 pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase text-electric">Waiver Record</p>
                <h3 className="mt-1 text-2xl font-black text-navy">
                  Signed waiver for {activeWaiverRecord.booking.player_name}
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => printWaiverRecord(activeWaiverRecord.booking, activeWaiverRecord.session)}
                  className={navyButtonClass}
                >
                  Print Waiver
                </button>
                <button
                  type="button"
                  onClick={() => downloadWaiverRecord(activeWaiverRecord.booking, activeWaiverRecord.session)}
                  className={secondaryButtonClass}
                >
                  Download
                </button>
                <button type="button" onClick={() => setActiveWaiverRecord(null)} className={secondaryButtonClass}>
                  Close
                </button>
              </div>
            </div>
            <pre className="mt-5 whitespace-pre-wrap text-sm leading-7 text-slate-700">
              {bookingWaiverRecordText(activeWaiverRecord.booking, activeWaiverRecord.session)}
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}

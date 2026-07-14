import {
  getTrainingGroup,
  getTrainingGroupSessionLabel,
  slotCapacity,
  type BookingRecord,
  type CalendarSyncStatus,
  type TrainingGroupId
} from "@/lib/booking-data";
import { sessionUnitAmountCents } from "@/lib/pricing";
import {
  getDirectPaymentOption,
  getLaunchPassOption,
  launchPassExpirationDate,
  type DirectPaymentOption,
  type LaunchPassType
} from "@/lib/pricing";
import { normalizeTrainingFocusForStorage } from "@/lib/session-focus";
import { business } from "@/lib/site-data";
import type {
  PublicAvailablePrivateSession,
  PublicAvailableSession,
  PublicAvailabilityDebugResponse,
  PublicAvailabilityResponse
} from "@/lib/public-availability";

type SupabaseConfig = {
  url: string;
  serviceRoleKey: string;
};

export type TrainingSessionRow = {
  id: string;
  training_group: TrainingGroupId;
  title: string;
  training_focus?: string | null;
  start_datetime: string;
  end_datetime: string;
  timezone: string;
  location: string;
  capacity: number;
  status: "open" | "closed" | "cancelled";
  created_at: string;
  updated_at: string;
};

export type BookingRow = {
  id: string;
  session_id: string;
  parent_name: string;
  parent_email: string;
  parent_phone: string;
  player_name: string;
  player_age: string;
  training_group: TrainingGroupId;
  status: "pending_payment" | "paid" | "cancelled";
  stripe_checkout_session_id?: string | null;
  stripe_payment_intent_id?: string | null;
  amount_paid: number;
  player_count: number;
  notes?: string | null;
  medical_notes?: string | null;
  emergency_name?: string | null;
  emergency_phone?: string | null;
  payment_type?: "single_session" | "launch_pass_credit";
  pass_purchase_id?: string | null;
  credit_redemption_id?: string | null;
  manual_source?: boolean | null;
  admin_payment_status?: ManualBookingPaymentStatus | null;
  admin_payment_method?: ManualBookingPaymentMethod | null;
  waiver_status?: ManualBookingWaiverStatus | null;
  internal_note?: string | null;
  admin_override_capacity?: boolean | null;
  calendar_sync_status?: string | null;
  calendar_sync_message?: string | null;
  calendar_synced_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type ManualBookingPaymentStatus = "paid" | "pending_payment" | "comped" | "training_credit_used";
export type ManualBookingPaymentMethod =
  | "Zelle"
  | "Cash"
  | "Venmo"
  | "Card"
  | "Training Package credit"
  | "Comped"
  | "Other";
export type ManualBookingWaiverStatus = "signed" | "missing";

export type PassPurchaseRow = {
  id: string;
  parent_name: string;
  parent_email: string;
  parent_phone: string;
  player_name: string;
  player_age: string;
  training_group: TrainingGroupId;
  pass_type: LaunchPassType;
  total_credits: number;
  remaining_credits: number;
  amount_paid: number;
  status: "pending_payment" | "paid" | "cancelled" | "expired";
  stripe_checkout_session_id?: string | null;
  stripe_payment_intent_id?: string | null;
  selected_session_ids?: string[] | null;
  booking_details?: PassPurchaseBookingDetails | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

export type PassPurchaseBookingDetails = {
  notes?: string;
  medicalNotes?: string;
  emergencyName?: string;
  emergencyPhone?: string;
  guardianSignature?: string;
  waiverAccepted?: boolean;
  waiverAcceptedAt?: string;
  waiverVersion?: string;
  mediaConsent?: "Granted" | "Declined";
  ipAddress?: string;
};

export type CreditRedemptionRow = {
  id: string;
  pass_purchase_id: string;
  booking_id: string;
  session_id: string;
  credits_used: number;
  created_at: string;
};

export type CreditAdjustmentRow = {
  id: string;
  pass_purchase_id: string;
  original_booking_id?: string | null;
  original_session_id?: string | null;
  player_name: string;
  parent_email: string;
  credit_amount: number;
  reason: string;
  note?: string | null;
  adjustment_type?: "automatic_cancellation_credit" | "manual_credit" | string | null;
  created_by?: string | null;
  email_status: "not_sent" | "sent" | "failed";
  email_error?: string | null;
  email_sent?: boolean | null;
  email_sent_at?: string | null;
  created_at: string;
};

export type AdminPassPurchase = PassPurchaseRow & {
  redemptions: Array<CreditRedemptionRow & { booking?: BookingRow | null }>;
  adjustments: CreditAdjustmentRow[];
};

export type ScheduleApprovalPaymentMethod = "cash" | "zelle" | "venmo" | "stripe_manual" | "other";

export type ScheduleApprovalRow = {
  id: string;
  token: string;
  pass_purchase_id: string;
  parent_name: string;
  parent_email: string;
  parent_phone: string;
  player_name: string;
  player_age: string;
  training_group: TrainingGroupId;
  plan_type: LaunchPassType;
  amount_paid: number;
  payment_method: ScheduleApprovalPaymentMethod;
  internal_note?: string | null;
  proposed_session_ids: string[];
  status: "pending" | "confirmed" | "cancelled";
  booking_ids: string[];
  confirmed_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type ScheduleApprovalDetails = {
  approval: ScheduleApprovalRow;
  pass: PassPurchaseRow | null;
  sessions: TrainingSessionRow[];
};

export type CustomPaymentLinkPlanType =
  | "single_session"
  | "four_session_training_package"
  | "six_session_training_package"
  | "private_1_on_1"
  | "custom_amount";

export type CustomPaymentLinkMode =
  | "payment_only"
  | "payment_plus_choose_sessions"
  | "payment_plus_confirm_proposed_schedule"
  | "payment_plus_choose_private_sessions";

export type CustomPaymentLinkStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "paid"
  | "partially_scheduled"
  | "fully_scheduled"
  | "cancelled";

export type CustomPaymentLinkRow = {
  id: string;
  token: string;
  player_name: string;
  player_age: string;
  parent_name: string;
  parent_email: string;
  parent_phone: string;
  training_group: TrainingGroupId;
  plan_type: CustomPaymentLinkPlanType;
  link_mode: CustomPaymentLinkMode;
  amount_cents: number;
  private_session_amount_cents?: number | null;
  allowed_purchase_options?: CustomPaymentLinkPlanType[] | null;
  selected_plan_type?: CustomPaymentLinkPlanType | null;
  selected_amount_cents?: number | null;
  selected_total_credits?: number | null;
  notes_to_parent?: string | null;
  internal_note?: string | null;
  suggested_availability?: string | null;
  proposed_session_ids: string[];
  allowed_private_session_ids: string[];
  selected_session_ids: string[];
  selected_private_session_ids: string[];
  selected_payment_method?: "card" | "zelle" | null;
  emergency_name?: string | null;
  emergency_phone?: string | null;
  medical_notes?: string | null;
  waiver_signed?: boolean | null;
  typed_signature?: string | null;
  signed_at?: string | null;
  waiver_version?: string | null;
  media_consent?: "Granted" | "Declined" | null;
  ip_address?: string | null;
  status: CustomPaymentLinkStatus;
  total_credits: number;
  credits_used: number;
  credits_remaining: number;
  pass_purchase_id?: string | null;
  booking_ids: string[];
  stripe_checkout_session_id?: string | null;
  stripe_payment_intent_id?: string | null;
  payment_status?: string | null;
  viewed_at?: string | null;
  paid_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminCustomPaymentLink = CustomPaymentLinkRow & {
  passPurchase?: PassPurchaseRow | null;
  bookings: BookingRow[];
  selectedSessions: TrainingSessionRow[];
  proposedSessions: TrainingSessionRow[];
  allowedPrivateSessions: PrivateSessionAvailabilityRow[];
  selectedPrivateSessions: PrivateSessionAvailabilityRow[];
};

export type CustomPaymentLinkDetails = {
  link: CustomPaymentLinkRow;
  passPurchase?: PassPurchaseRow | null;
  bookings: BookingRow[];
  selectedSessions: TrainingSessionRow[];
  proposedSessions: TrainingSessionRow[];
  allowedPrivateSessions: PrivateSessionAvailabilityRow[];
  selectedPrivateSessions: PrivateSessionAvailabilityRow[];
};

export type WaiverRow = {
  id: string;
  booking_id: string;
  parent_name: string;
  player_name: string;
  typed_signature: string;
  waiver_signed: boolean;
  signed_at: string;
  media_consent: "Granted" | "Declined";
  emergency_medical_notes?: string | null;
  ip_address?: string | null;
  created_at: string;
};

export type CalendarEventRow = {
  id: string;
  booking_id: string;
  google_calendar_event_id: string;
  created_at: string;
};

export type EmailLogRow = {
  id: string;
  booking_id: string;
  email_type: "customer" | "admin";
  recipient: string;
  status: "sent" | "failed";
  error_message?: string | null;
  created_at: string;
};

export type AdminAlertLogRow = {
  id: string;
  booking_id?: string | null;
  source: string;
  source_id?: string | null;
  dedupe_key: string;
  recipient: string;
  status: "sent" | "failed" | "skipped";
  title: string;
  message: string;
  error_message?: string | null;
  created_at: string;
};

export type EmailSubscriberRow = {
  id: string;
  parent_name?: string | null;
  email: string;
  phone?: string | null;
  player_name?: string | null;
  player_age?: string | null;
  source?: string | null;
  opted_in: boolean;
  opted_in_at?: string | null;
  unsubscribed: boolean;
  unsubscribed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type EmailSubscriberInput = {
  parentName?: string;
  email: string;
  phone?: string;
  playerName?: string;
  playerAge?: string;
  source?: string;
};

export type DirectPaymentStatus = "pending_card_payment" | "zelle_pending" | "paid" | "cancelled";

export type DirectPaymentRow = {
  id: string;
  player_count: number;
  session_count: number;
  player_first_name: string;
  player_last_name: string;
  player_age: string;
  second_player_first_name?: string | null;
  second_player_last_name?: string | null;
  second_player_age?: string | null;
  parent_name: string;
  parent_email: string;
  parent_phone: string;
  payment_option: DirectPaymentOption;
  payment_method: "card" | "zelle";
  status: DirectPaymentStatus;
  amount_due: number;
  amount_paid: number;
  stripe_checkout_session_id?: string | null;
  stripe_payment_intent_id?: string | null;
  waiver_signed: boolean;
  typed_signature: string;
  signed_at: string;
  waiver_version?: string | null;
  media_consent: "Granted" | "Declined";
  emergency_name: string;
  emergency_phone: string;
  medical_notes: string;
  ip_address?: string | null;
  created_at: string;
  updated_at: string;
};

export type DirectPaymentPaidRow = DirectPaymentRow & {
  wasAlreadyPaid: boolean;
};

export type PrivateSessionRequestStatus = "new" | "contacted" | "scheduled" | "completed" | "cancelled";

export type PrivateSessionRequestRow = {
  id: string;
  player_name: string;
  player_age: string;
  parent_name: string;
  parent_email: string;
  parent_phone: string;
  preferred_times: string;
  focus_areas: string[];
  notes?: string | null;
  status: PrivateSessionRequestStatus;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  timezone: string;
  location: string;
  google_calendar_event_id?: string | null;
  calendar_status?: string | null;
  calendar_message?: string | null;
  created_at: string;
  updated_at: string;
};

export type PrivateSessionAvailabilityStatus = "available" | "booked" | "closed" | "cancelled";
export type PrivateSessionVisibility = "public" | "private_link" | "hidden";
export type PrivateSessionPaymentMethod = "card" | "zelle";
export type PrivateSessionPaymentStatus =
  | "not_started"
  | "pending_card_payment"
  | "paid"
  | "zelle_pending"
  | "cancelled";

export type PrivateSessionAvailabilityRow = {
  id: string;
  start_datetime: string;
  end_datetime: string;
  timezone: string;
  location: string;
  session_focus: string;
  notes?: string | null;
  status: PrivateSessionAvailabilityStatus;
  visibility?: PrivateSessionVisibility | null;
  player_name?: string | null;
  player_age?: string | null;
  parent_name?: string | null;
  parent_email?: string | null;
  parent_phone?: string | null;
  payment_method: PrivateSessionPaymentMethod;
  payment_status: PrivateSessionPaymentStatus;
  custom_payment_link_id?: string | null;
  stripe_checkout_session_id?: string | null;
  stripe_payment_intent_id?: string | null;
  amount_paid: number;
  waiver_signed: boolean;
  typed_signature?: string | null;
  signed_at?: string | null;
  waiver_version?: string | null;
  media_consent?: "Granted" | "Declined" | null;
  emergency_name?: string | null;
  emergency_phone?: string | null;
  medical_notes?: string | null;
  ip_address?: string | null;
  booked_at?: string | null;
  google_calendar_event_id?: string | null;
  calendar_status?: string | null;
  calendar_message?: string | null;
  email_status?: string | null;
  email_message?: string | null;
  pushover_status?: string | null;
  pushover_message?: string | null;
  created_at: string;
  updated_at: string;
};

export type PrivateSessionAvailabilityInput = {
  date: string;
  startTime: string;
  endTime?: string;
  location?: string;
  sessionFocus?: string;
  notes?: string;
  status?: PrivateSessionAvailabilityStatus;
  visibility?: PrivateSessionVisibility;
};

export type PrivateSessionRequestInput = {
  playerName: string;
  playerAge: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  preferredTimes: string;
  focusAreas: string[];
  notes?: string;
};

export type AdminBookingRecord = BookingRow & {
  waiver?: WaiverRow | null;
  calendarEvent?: CalendarEventRow | null;
  emailLogs: EmailLogRow[];
  alertLogs: AdminAlertLogRow[];
  passPurchase?: PassPurchaseRow | null;
  creditRedemption?: CreditRedemptionRow | null;
  creditAdjustment?: CreditAdjustmentRow | null;
};

export type AdminTrainingSession = TrainingSessionRow & {
  paidPlayers: number;
  remainingSpots: number;
  paidBookings: AdminBookingRecord[];
};

export function isAdminBookingConfirmed(
  booking: Pick<
    BookingRow,
    | "status"
    | "amount_paid"
    | "payment_type"
    | "stripe_payment_intent_id"
    | "pass_purchase_id"
    | "credit_redemption_id"
    | "manual_source"
    | "admin_payment_status"
  >
) {
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

export type DirectPaymentInput = {
  playerCount: number;
  sessionCount: number;
  playerFirstName: string;
  playerLastName: string;
  playerAge: string;
  secondPlayerFirstName?: string;
  secondPlayerLastName?: string;
  secondPlayerAge?: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  paymentOption: DirectPaymentOption;
  paymentMethod: "card" | "zelle";
  waiverSigned: boolean;
  typedSignature: string;
  signedAt: string;
  waiverVersion: string;
  mediaConsent: "Granted" | "Declined";
  emergencyName: string;
  emergencyPhone: string;
  medicalNotes: string;
  ipAddress?: string;
};

export type ContactInfoInput = {
  parentName?: string;
  parentEmail?: string;
  parentPhone?: string;
  playerName?: string;
  playerFirstName?: string;
  playerLastName?: string;
  playerAge?: string;
  secondPlayerFirstName?: string;
  secondPlayerLastName?: string;
  secondPlayerAge?: string;
};

export type ManualBookingInput = {
  sessionId: string;
  playerName: string;
  playerAge: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  emergencyName?: string;
  emergencyPhone?: string;
  medicalNotes?: string;
  paymentStatus: ManualBookingPaymentStatus;
  paymentMethod: ManualBookingPaymentMethod;
  amountPaid: number;
  waiverStatus: ManualBookingWaiverStatus;
  internalNote?: string;
  passPurchaseId?: string;
  overrideCapacity?: boolean;
};

export type ManualBookingUpdateInput = {
  playerName?: string;
  playerAge?: string;
  parentName?: string;
  parentEmail?: string;
  parentPhone?: string;
  paymentStatus?: ManualBookingPaymentStatus;
  paymentMethod?: ManualBookingPaymentMethod;
  amountPaid?: number;
  waiverStatus?: ManualBookingWaiverStatus;
  notes?: string;
  medicalNotes?: string;
  emergencyName?: string;
  emergencyPhone?: string;
  internalNote?: string;
};

export type SupabaseDiagnostics = {
  configured: boolean;
  urlConfigured: boolean;
  serviceRoleKeyConfigured: boolean;
};

type SupabaseError = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
};

const defaultTimeZone = "America/Los_Angeles";

export function isSupabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getSupabaseDiagnostics(): SupabaseDiagnostics {
  return {
    configured: isSupabaseConfigured(),
    urlConfigured: Boolean(process.env.SUPABASE_URL),
    serviceRoleKeyConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  };
}

function getSupabaseConfig(): SupabaseConfig {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel.");
  }

  return {
    url,
    serviceRoleKey
  };
}

async function supabaseRequest<T>(path: string, init: RequestInit = {}) {
  const config = getSupabaseConfig();
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as SupabaseError;
    throw new Error(error.message || error.details || `Supabase request failed with ${response.status}.`);
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
}

function encodeFilter(value: string) {
  return encodeURIComponent(value);
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset"
  }).formatToParts(date);
  const value = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = value.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);

  if (!match) {
    return 0;
  }

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? "0");

  return sign * (hours * 60 + minutes);
}

function zonedDateTimeToUtc(dateIso: string, time24: string, timeZone = defaultTimeZone) {
  const [year, month, day] = dateIso.split("-").map(Number);
  const [hour, minute] = time24.split(":").map(Number);
  let utc = new Date(Date.UTC(year, month - 1, day, hour, minute || 0, 0));

  for (let index = 0; index < 2; index += 1) {
    const offsetMinutes = getTimeZoneOffsetMinutes(utc, timeZone);
    utc = new Date(Date.UTC(year, month - 1, day, hour, minute || 0, 0) - offsetMinutes * 60_000);
  }

  return utc;
}

function displayParts(iso: string, timeZone = defaultTimeZone) {
  const date = new Date(iso);
  const dateParts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((current, part) => {
      if (part.type !== "literal") {
        current[part.type] = part.value;
      }

      return current;
    }, {});

  return {
    date: `${dateParts.year}-${dateParts.month}-${dateParts.day}`,
    dateLabel: new Intl.DateTimeFormat("en-US", {
      timeZone,
      month: "short",
      day: "numeric"
    }).format(date),
    dayLabel: new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "long"
    }).format(date),
    time: new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit"
    }).format(date)
  };
}

function paidPlayerCounts(bookings: BookingRow[]) {
  return bookings.reduce<Record<string, number>>((counts, booking) => {
    counts[booking.session_id] = (counts[booking.session_id] ?? 0) + (Number(booking.player_count) || 1);

    return counts;
  }, {});
}

function toPublicSession(session: TrainingSessionRow, paidPlayers: number): PublicAvailableSession {
  const start = displayParts(session.start_datetime, session.timezone || defaultTimeZone);
  const end = displayParts(session.end_datetime, session.timezone || defaultTimeZone);
  const group = getTrainingGroup(session.training_group);

  return {
    id: session.id,
    date: start.date,
    dateLabel: start.dateLabel,
    dayLabel: start.dayLabel,
    startTime: start.time,
    endTime: end.time,
    isoDateTime: session.start_datetime,
    timeZone: session.timezone || defaultTimeZone,
    trainingGroupId: session.training_group,
    trainingGroup: group.name,
    trainingGroupAges: group.ages,
    trainingFocusValue: session.training_focus ?? undefined,
    trainingFocus: undefined,
    trainingFocusDescription: undefined,
    capacity: session.capacity,
    bookedCount: paidPlayers,
    remainingSpots: Math.max(0, session.capacity - paidPlayers),
    location: session.location || business.location,
    duration: "60 min"
  };
}

function toPublicPrivateSession(session: PrivateSessionAvailabilityRow): PublicAvailablePrivateSession {
  const start = displayParts(session.start_datetime, session.timezone || defaultTimeZone);
  const end = displayParts(session.end_datetime, session.timezone || defaultTimeZone);

  return {
    id: session.id,
    date: start.date,
    dateLabel: start.dateLabel,
    dayLabel: start.dayLabel,
    startTime: start.time,
    endTime: end.time,
    isoDateTime: session.start_datetime,
    timeZone: session.timezone || defaultTimeZone,
    title: "Private Session",
    location: session.location || business.location,
    duration: "60 min",
    status: "available"
  };
}

function publicSessionProgramName(publicSession: PublicAvailableSession) {
  return getTrainingGroupSessionLabel(publicSession.trainingGroupId);
}

export async function listTrainingSessions() {
  return supabaseRequest<TrainingSessionRow[]>("training_sessions?select=*&order=start_datetime.asc");
}

async function listPaidBookings() {
  const bookings = await supabaseRequest<BookingRow[]>("bookings?select=*&status=eq.paid");

  return bookings.filter(isAdminBookingConfirmed);
}

function toBookingRecordFromRows(input: {
  booking: BookingRow;
  session: TrainingSessionRow;
  waiver?: WaiverRow | null;
  remainingCreditsAfter?: number;
}): BookingRecord {
  const publicSession = toPublicSession(input.session, 0);

  return {
    id: input.booking.id,
    createdAt: input.booking.created_at,
    parentName: input.booking.parent_name,
    playerName: input.booking.player_name,
    playerAge: input.booking.player_age,
    phone: input.booking.parent_phone,
    email: input.booking.parent_email,
    players: String(input.booking.player_count || 1),
    notes: input.booking.notes || "",
    medicalNotes: input.booking.medical_notes || input.waiver?.emergency_medical_notes || "",
    emergencyName: input.booking.emergency_name || "",
    emergencyPhone: input.booking.emergency_phone || "",
    guardianSignature: input.waiver?.typed_signature || "",
    waiverAccepted: Boolean(input.waiver?.waiver_signed),
    waiverAcceptedAt: input.waiver?.signed_at || "",
    waiverVersion: "",
    ipAddress: input.waiver?.ip_address || "",
    mediaConsent: input.waiver?.media_consent || "Granted",
    programId: input.session.training_group,
    programName: publicSessionProgramName(publicSession),
    sessionId: input.session.id,
    sessionDateIso: publicSession.date,
    sessionDate: publicSession.dateLabel,
    sessionTime: publicSession.startTime,
    sessionDurationMinutes: 60,
    paymentStatus: input.booking.status === "paid" ? "Paid" : input.booking.status === "pending_payment" ? "pending_payment" : "Failed",
    notificationStatus: "Ready",
    calendarStatus: "Ready",
    paymentType: input.booking.payment_type || "single_session",
    passPurchaseId: input.booking.pass_purchase_id || undefined,
    creditRedemptionId: input.booking.credit_redemption_id || undefined,
    remainingCreditsAfter: input.remainingCreditsAfter
  };
}

export async function getSupabaseAvailability(): Promise<PublicAvailabilityResponse> {
  if (!isSupabaseConfigured()) {
    return {
      status: "Failed",
      sessions: [],
      privateSessions: [],
      generatedAt: new Date().toISOString(),
      timeZone: defaultTimeZone,
      message: "Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel."
    };
  }

  const now = new Date();
  const sessions = await supabaseRequest<TrainingSessionRow[]>(
    `training_sessions?select=*&status=eq.open&start_datetime=gt.${encodeFilter(now.toISOString())}&order=start_datetime.asc`
  );
  const paidBookings = await listPaidBookings();
  const publicPrivateSessions = await listPublicBookingPrivateSessionAvailability();
  const counts = paidPlayerCounts(paidBookings);
  const publicSessions = sessions
    .map((session) => toPublicSession(session, counts[session.id] ?? 0))
    .filter((session) => session.remainingSpots > 0);

  return {
    status: "Synced" as CalendarSyncStatus,
    sessions: publicSessions,
    privateSessions: publicPrivateSessions.map(toPublicPrivateSession),
    generatedAt: now.toISOString(),
    timeZone: defaultTimeZone
  };
}

export async function getSupabaseAvailabilityDebug(): Promise<PublicAvailabilityDebugResponse & { supabaseConfigured: boolean }> {
  const now = new Date();

  if (!isSupabaseConfigured()) {
    return {
      supabaseConfigured: false,
      status: "Failed",
      sessions: [],
      privateSessions: [],
      generatedAt: now.toISOString(),
      timeZone: defaultTimeZone,
      message: "Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel.",
      summary: {
        allSessionsLoaded: 0,
        openFutureSessions: 0,
        sessionsWithRemainingSpots: 0,
        finalSessionsReturned: 0
      },
      loadedSessions: []
    };
  }

  const sessions = await listTrainingSessions();
  const paidBookings = await listPaidBookings();
  const counts = paidPlayerCounts(paidBookings);
  const response = await getSupabaseAvailability();

  return {
    ...response,
    supabaseConfigured: true,
    summary: {
      allSessionsLoaded: sessions.length,
      openFutureSessions: sessions.filter((session) => session.status === "open" && new Date(session.start_datetime).getTime() > now.getTime()).length,
      sessionsWithRemainingSpots: sessions.filter((session) => {
        const paidPlayers = counts[session.id] ?? 0;
        return session.capacity - paidPlayers > 0;
      }).length,
      finalSessionsReturned: response.sessions.length
    },
    loadedSessions: sessions.map((session) => {
      const paidPlayers = counts[session.id] ?? 0;
      const publicSession = toPublicSession(session, paidPlayers);
      const activeEnabled = session.status === "open";
      const futureDate = new Date(session.start_datetime).getTime() > now.getTime();
      const capacity = session.capacity > 0 && paidPlayers < session.capacity;
      const remainingSpots = publicSession.remainingSpots > 0;
      const removedReasons = [
        activeEnabled ? "" : `status is ${session.status}`,
        futureDate ? "" : "session is not in the future",
        capacity ? "" : "capacity is full or invalid",
        remainingSpots ? "" : "no remaining spots"
      ].filter(Boolean);

      return {
        id: session.id,
        date: publicSession.date,
        time: publicSession.startTime,
        trainingGroup: publicSession.trainingGroup,
        trainingFocusValue: publicSession.trainingFocusValue,
        trainingFocus: publicSession.trainingFocus,
        status: session.status,
        capacity: session.capacity,
        bookedCount: paidPlayers,
        remainingSpots: publicSession.remainingSpots,
        checks: {
          activeEnabled,
          futureDate,
          capacity,
          remainingSpots
        },
        included: removedReasons.length === 0,
        removedReasons
      };
    })
  };
}

export async function createTrainingSession(input: {
  trainingGroup: TrainingGroupId;
  date: string;
  time: string;
  endTime?: string;
  trainingFocus?: string;
  capacity?: number;
  location?: string;
  status?: "open" | "closed" | "cancelled";
}) {
  const group = getTrainingGroup(input.trainingGroup);
  const start = zonedDateTimeToUtc(input.date, input.time, defaultTimeZone);
  const explicitEnd = input.endTime ? zonedDateTimeToUtc(input.date, input.endTime, defaultTimeZone) : null;
  const end = explicitEnd && explicitEnd.getTime() > start.getTime() ? explicitEnd : new Date(start.getTime() + 60 * 60_000);
  const payload: Partial<TrainingSessionRow> & {
    training_group: TrainingGroupId;
    start_datetime: string;
    end_datetime: string;
  } = {
    training_group: input.trainingGroup,
    title: group.name,
    start_datetime: start.toISOString(),
    end_datetime: end.toISOString(),
    timezone: defaultTimeZone,
    location: input.location || business.location,
    capacity: Math.min(slotCapacity, Math.max(1, Number(input.capacity) || slotCapacity)),
    status: input.status || "open"
  };

  const normalizedTrainingFocus = normalizeTrainingFocusForStorage(input.trainingFocus);

  if (normalizedTrainingFocus) {
    payload.training_focus = normalizedTrainingFocus;
  }

  return supabaseRequest<TrainingSessionRow[]>("training_sessions", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateTrainingSession(
  id: string,
  updates: Partial<Pick<TrainingSessionRow, "capacity" | "location" | "status" | "title" | "training_focus">>
) {
  return supabaseRequest<TrainingSessionRow[]>(
    `training_sessions?id=eq.${encodeFilter(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(updates)
    }
  );
}

export async function deleteTrainingSession(id: string) {
  return supabaseRequest<null>(`training_sessions?id=eq.${encodeFilter(id)}`, {
    method: "DELETE"
  });
}

export async function listAdminBookings() {
  const [bookings, waivers, calendarEvents, emailLogs, alertLogs, passPurchases, redemptions, adjustments] = await Promise.all([
    supabaseRequest<BookingRow[]>("bookings?select=*&order=created_at.desc"),
    supabaseRequest<WaiverRow[]>("waivers?select=*"),
    supabaseRequest<CalendarEventRow[]>("calendar_events?select=*"),
    supabaseRequest<EmailLogRow[]>("email_logs?select=*&order=created_at.desc"),
    supabaseRequest<AdminAlertLogRow[]>("admin_alert_logs?select=*&order=created_at.desc").catch(() => []),
    supabaseRequest<PassPurchaseRow[]>("pass_purchases?select=*&order=created_at.desc").catch(() => []),
    supabaseRequest<CreditRedemptionRow[]>("credit_redemptions?select=*&order=created_at.desc").catch(() => []),
    supabaseRequest<CreditAdjustmentRow[]>("credit_adjustments?select=*&order=created_at.desc").catch(() => [])
  ]);
  const waiverMap = new Map(waivers.map((waiver) => [waiver.booking_id, waiver]));
  const calendarMap = new Map(calendarEvents.map((event) => [event.booking_id, event]));
  const passMap = new Map(passPurchases.map((pass) => [pass.id, pass]));
  const redemptionMap = new Map(redemptions.map((redemption) => [redemption.booking_id, redemption]));
  const adjustmentMap = new Map(
    adjustments
      .filter((adjustment) => Boolean(adjustment.original_booking_id))
      .map((adjustment) => [adjustment.original_booking_id as string, adjustment])
  );

  return bookings.map((booking) => ({
    ...booking,
    waiver: waiverMap.get(booking.id) ?? null,
    calendarEvent: calendarMap.get(booking.id) ?? null,
    emailLogs: emailLogs.filter((log) => log.booking_id === booking.id),
    alertLogs: alertLogs.filter((log) => log.booking_id === booking.id),
    passPurchase: booking.pass_purchase_id ? passMap.get(booking.pass_purchase_id) ?? null : null,
    creditRedemption: redemptionMap.get(booking.id) ?? null,
    creditAdjustment: adjustmentMap.get(booking.id) ?? null
  }));
}

export async function getAdminBookingById(bookingId: string) {
  const bookings = await listAdminBookings();

  return bookings.find((booking) => booking.id === bookingId) ?? null;
}

export async function cancelIncompleteBooking(bookingId: string) {
  const booking = await getAdminBookingById(bookingId);

  if (!booking) {
    throw new Error("Booking was not found.");
  }

  if (isAdminBookingConfirmed(booking)) {
    throw new Error("Confirmed bookings cannot be cancelled from the incomplete booking action.");
  }

  const rows = await supabaseRequest<BookingRow[]>(`bookings?id=eq.${encodeFilter(bookingId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "cancelled"
    })
  });

  return rows[0] ?? null;
}

export async function deleteIncompleteBooking(bookingId: string) {
  const booking = await getAdminBookingById(bookingId);

  if (!booking) {
    throw new Error("Booking was not found.");
  }

  if (isAdminBookingConfirmed(booking)) {
    throw new Error("Confirmed bookings cannot be deleted from the incomplete booking action.");
  }

  await supabaseRequest<null>(`bookings?id=eq.${encodeFilter(bookingId)}`, {
    method: "DELETE"
  });
}

export async function listAdminPassPurchases(): Promise<AdminPassPurchase[]> {
  const [passes, redemptions, adjustments, bookings] = await Promise.all([
    supabaseRequest<PassPurchaseRow[]>("pass_purchases?select=*&order=created_at.desc").catch(() => []),
    supabaseRequest<CreditRedemptionRow[]>("credit_redemptions?select=*&order=created_at.desc").catch(() => []),
    supabaseRequest<CreditAdjustmentRow[]>("credit_adjustments?select=*&order=created_at.desc").catch(() => []),
    supabaseRequest<BookingRow[]>("bookings?select=*&order=created_at.desc").catch(() => [])
  ]);
  const bookingMap = new Map(bookings.map((booking) => [booking.id, booking]));

  return passes.map((pass) => ({
    ...pass,
    redemptions: redemptions
      .filter((redemption) => redemption.pass_purchase_id === pass.id)
      .map((redemption) => ({
        ...redemption,
        booking: bookingMap.get(redemption.booking_id) ?? null
      })),
    adjustments: adjustments.filter((adjustment) => adjustment.pass_purchase_id === pass.id)
  }));
}

function customPaymentLinkCredits(planType: CustomPaymentLinkPlanType) {
  if (planType === "four_session_training_package") {
    return 4;
  }

  if (planType === "six_session_training_package") {
    return 6;
  }

  if (planType === "single_session" || planType === "private_1_on_1") {
    return 1;
  }

  return 0;
}

function isCustomPaymentLinkPlanType(value: string): value is CustomPaymentLinkPlanType {
  return [
    "single_session",
    "four_session_training_package",
    "six_session_training_package",
    "private_1_on_1",
    "custom_amount"
  ].includes(value);
}

export function normalizeCustomPaymentLinkOptions(
  values: unknown,
  fallback: CustomPaymentLinkPlanType
): CustomPaymentLinkPlanType[] {
  const raw = Array.isArray(values) ? values : [];
  const filtered = raw.filter((value): value is CustomPaymentLinkPlanType => typeof value === "string" && isCustomPaymentLinkPlanType(value));
  const unique = Array.from(new Set(filtered));

  return unique.length > 0 ? unique : [fallback];
}

export function customPaymentLinkAmountCents(
  planType: CustomPaymentLinkPlanType,
  privateAmountCents = 0,
  fallbackAmountCents = 0
) {
  switch (planType) {
    case "single_session":
      return 5500;
    case "four_session_training_package":
      return 20000;
    case "six_session_training_package":
      return 28500;
    case "private_1_on_1":
      return Math.max(0, Math.round(privateAmountCents || fallbackAmountCents || 0));
    case "custom_amount":
    default:
      return Math.max(0, Math.round(fallbackAmountCents || 0));
  }
}

export function customPaymentLinkOptionMeta(
  planType: CustomPaymentLinkPlanType,
  privateAmountCents = 0,
  fallbackAmountCents = 0
) {
  return {
    planType,
    label: customPaymentLinkPlanLabel(planType),
    amountCents: customPaymentLinkAmountCents(planType, privateAmountCents, fallbackAmountCents),
    credits: customPaymentLinkCredits(planType)
  };
}

export function customPaymentLinkPlanLabel(planType: CustomPaymentLinkPlanType) {
  switch (planType) {
    case "four_session_training_package":
      return "4-Session Training Package";
    case "six_session_training_package":
      return "6-Session Training Package";
    case "private_1_on_1":
      return "Private 1-on-1 Session";
    case "custom_amount":
      return "Custom Amount";
    case "single_session":
    default:
      return "Single Session";
  }
}

export function customPaymentLinkModeLabel(mode: CustomPaymentLinkMode) {
  switch (mode) {
    case "payment_only":
      return "Payment only";
    case "payment_plus_confirm_proposed_schedule":
      return "Payment + confirm proposed schedule";
    case "payment_plus_choose_private_sessions":
      return "Payment + choose private session times";
    case "payment_plus_choose_sessions":
    default:
      return "Payment + choose sessions";
  }
}

export function customPaymentLinkPassType(planType: CustomPaymentLinkPlanType): LaunchPassType | null {
  if (planType === "four_session_training_package") {
    return "four_session_launch_pass";
  }

  if (planType === "six_session_training_package") {
    return "six_session_launch_pass";
  }

  return null;
}

async function loadCustomPaymentLinkDetails(link: CustomPaymentLinkRow): Promise<CustomPaymentLinkDetails> {
  const sessionIds = Array.from(
    new Set([...(link.proposed_session_ids ?? []), ...(link.selected_session_ids ?? [])].filter(Boolean))
  );
  const privateSessionIds = Array.from(
    new Set([...(link.allowed_private_session_ids ?? []), ...(link.selected_private_session_ids ?? [])].filter(Boolean))
  );
  const [passPurchase, bookings, sessions, privateSessions] = await Promise.all([
    link.pass_purchase_id ? getPassPurchaseById(link.pass_purchase_id) : Promise.resolve(null),
    link.booking_ids.length > 0
      ? supabaseRequest<BookingRow[]>(
          `bookings?select=*&id=in.(${link.booking_ids.map(encodeFilter).join(",")})`
        ).catch(() => [])
      : Promise.resolve([]),
    sessionIds.length > 0
      ? supabaseRequest<TrainingSessionRow[]>(
          `training_sessions?select=*&id=in.(${sessionIds.map(encodeFilter).join(",")})&order=start_datetime.asc`
        ).catch(() => [])
      : Promise.resolve([]),
    privateSessionIds.length > 0
      ? supabaseRequest<PrivateSessionAvailabilityRow[]>(
          `private_session_availability?select=*&id=in.(${privateSessionIds.map(encodeFilter).join(",")})&order=start_datetime.asc`
        ).catch(() => [])
      : Promise.resolve([])
  ]);
  const sessionMap = new Map(sessions.map((session) => [session.id, session]));
  const privateSessionMap = new Map(privateSessions.map((session) => [session.id, session]));

  return {
    link,
    passPurchase,
    bookings,
    proposedSessions: (link.proposed_session_ids ?? [])
      .map((sessionId) => sessionMap.get(sessionId))
      .filter((session): session is TrainingSessionRow => Boolean(session)),
    selectedSessions: (link.selected_session_ids ?? [])
      .map((sessionId) => sessionMap.get(sessionId))
      .filter((session): session is TrainingSessionRow => Boolean(session)),
    allowedPrivateSessions: (link.allowed_private_session_ids ?? [])
      .map((sessionId) => privateSessionMap.get(sessionId))
      .filter((session): session is PrivateSessionAvailabilityRow => Boolean(session)),
    selectedPrivateSessions: (link.selected_private_session_ids ?? [])
      .map((sessionId) => privateSessionMap.get(sessionId))
      .filter((session): session is PrivateSessionAvailabilityRow => Boolean(session))
  };
}

export async function listAdminCustomPaymentLinks(): Promise<AdminCustomPaymentLink[]> {
  const links = await supabaseRequest<CustomPaymentLinkRow[]>(
    "custom_payment_links?select=*&order=created_at.desc"
  ).catch(() => []);
  const details = await Promise.all(links.map(loadCustomPaymentLinkDetails));

  return details.map((detail) => ({
    ...detail.link,
    passPurchase: detail.passPurchase,
    bookings: detail.bookings,
    proposedSessions: detail.proposedSessions,
    selectedSessions: detail.selectedSessions,
    allowedPrivateSessions: detail.allowedPrivateSessions,
    selectedPrivateSessions: detail.selectedPrivateSessions
  }));
}

export async function createCustomPaymentLink(input: {
  token: string;
  playerName?: string;
  playerAge?: string;
  parentName?: string;
  parentEmail?: string;
  parentPhone?: string;
  trainingGroup: TrainingGroupId;
  planType: CustomPaymentLinkPlanType;
  linkMode: CustomPaymentLinkMode;
  amountCents: number;
  privateSessionAmountCents?: number;
  allowedPurchaseOptions?: CustomPaymentLinkPlanType[];
  notesToParent?: string;
  internalNote?: string;
  suggestedAvailability?: string;
  proposedSessionIds?: string[];
  allowedPrivateSessionIds?: string[];
}) {
  const allowedPurchaseOptions = normalizeCustomPaymentLinkOptions(input.allowedPurchaseOptions, input.planType);
  const primaryPlanType = allowedPurchaseOptions[0] ?? input.planType;
  const privateAmountCents = Math.max(
    0,
    Math.round(input.privateSessionAmountCents ?? (input.planType === "private_1_on_1" ? input.amountCents : 0))
  );
  const primaryAmountCents = customPaymentLinkAmountCents(primaryPlanType, privateAmountCents, input.amountCents);
  const credits = customPaymentLinkCredits(primaryPlanType);
  const rows = await supabaseRequest<CustomPaymentLinkRow[]>("custom_payment_links", {
    method: "POST",
    body: JSON.stringify({
      token: input.token,
      player_name: input.playerName?.trim() || "Parent will complete",
      player_age: input.playerAge?.trim() || "Parent will complete",
      parent_name: input.parentName?.trim() || "Parent will complete",
      parent_email: input.parentEmail?.trim().toLowerCase() || "pending@elitesoccertrainingcv.com",
      parent_phone: input.parentPhone?.trim() || "Parent will complete",
      training_group: input.trainingGroup,
      plan_type: primaryPlanType,
      link_mode: input.linkMode,
      amount_cents: primaryAmountCents,
      private_session_amount_cents: privateAmountCents,
      allowed_purchase_options: allowedPurchaseOptions,
      notes_to_parent: input.notesToParent?.trim() || null,
      internal_note: input.internalNote?.trim() || null,
      suggested_availability: input.suggestedAvailability?.trim() || null,
      proposed_session_ids: Array.from(new Set(input.proposedSessionIds ?? [])),
      allowed_private_session_ids: Array.from(new Set(input.allowedPrivateSessionIds ?? [])),
      selected_session_ids: [],
      selected_private_session_ids: [],
      total_credits: credits,
      credits_used: 0,
      credits_remaining: credits,
      status: "draft"
    })
  });
  const link = rows[0];

  if (!link) {
    throw new Error("Custom payment link could not be created.");
  }

  return link;
}

export async function getCustomPaymentLinkByToken(token: string): Promise<CustomPaymentLinkDetails | null> {
  const rows = await supabaseRequest<CustomPaymentLinkRow[]>(
    `custom_payment_links?select=*&token=eq.${encodeFilter(token)}&limit=1`
  ).catch(() => []);
  const link = rows[0];

  return link ? loadCustomPaymentLinkDetails(link) : null;
}

export async function getCustomPaymentLinkById(id: string): Promise<CustomPaymentLinkDetails | null> {
  const rows = await supabaseRequest<CustomPaymentLinkRow[]>(
    `custom_payment_links?select=*&id=eq.${encodeFilter(id)}&limit=1`
  ).catch(() => []);
  const link = rows[0];

  return link ? loadCustomPaymentLinkDetails(link) : null;
}

export async function markCustomPaymentLinkViewed(token: string) {
  const existing = await getCustomPaymentLinkByToken(token);

  if (!existing || ["paid", "partially_scheduled", "fully_scheduled", "cancelled"].includes(existing.link.status)) {
    return existing?.link ?? null;
  }

  const rows = await supabaseRequest<CustomPaymentLinkRow[]>(
    `custom_payment_links?token=eq.${encodeFilter(token)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        status: existing.link.status === "draft" || existing.link.status === "sent" ? "viewed" : existing.link.status,
        viewed_at: existing.link.viewed_at || new Date().toISOString()
      })
    }
  );

  return rows[0] ?? null;
}

export async function updateCustomPaymentLink(input: {
  id: string;
  status?: CustomPaymentLinkStatus;
  selectedSessionIds?: string[];
  selectedPrivateSessionIds?: string[];
  selectedPaymentMethod?: "card" | "zelle" | null;
  selectedPlanType?: CustomPaymentLinkPlanType | null;
  selectedAmountCents?: number | null;
  selectedTotalCredits?: number | null;
  playerName?: string;
  playerAge?: string;
  parentName?: string;
  parentEmail?: string;
  parentPhone?: string;
  emergencyName?: string;
  emergencyPhone?: string;
  medicalNotes?: string;
  waiverSigned?: boolean;
  typedSignature?: string;
  signedAt?: string;
  waiverVersion?: string;
  mediaConsent?: "Granted" | "Declined";
  ipAddress?: string;
  passPurchaseId?: string | null;
  bookingIds?: string[];
  checkoutSessionId?: string | null;
  paymentIntentId?: string | null;
  paymentStatus?: string | null;
  creditsUsed?: number;
  creditsRemaining?: number;
  paidAt?: string | null;
}) {
  const patch: Partial<CustomPaymentLinkRow> = {};

  if (input.status) patch.status = input.status;
  if (input.selectedSessionIds) patch.selected_session_ids = input.selectedSessionIds;
  if (input.selectedPrivateSessionIds) patch.selected_private_session_ids = input.selectedPrivateSessionIds;
  if (input.selectedPaymentMethod !== undefined) patch.selected_payment_method = input.selectedPaymentMethod;
  if (input.selectedPlanType !== undefined) patch.selected_plan_type = input.selectedPlanType;
  if (input.selectedAmountCents !== undefined) patch.selected_amount_cents = input.selectedAmountCents;
  if (input.selectedTotalCredits !== undefined) patch.selected_total_credits = input.selectedTotalCredits;
  if (input.playerName !== undefined) patch.player_name = input.playerName.trim();
  if (input.playerAge !== undefined) patch.player_age = input.playerAge.trim();
  if (input.parentName !== undefined) patch.parent_name = input.parentName.trim();
  if (input.parentEmail !== undefined) patch.parent_email = input.parentEmail.trim().toLowerCase();
  if (input.parentPhone !== undefined) patch.parent_phone = input.parentPhone.trim();
  if (input.emergencyName !== undefined) patch.emergency_name = input.emergencyName.trim();
  if (input.emergencyPhone !== undefined) patch.emergency_phone = input.emergencyPhone.trim();
  if (input.medicalNotes !== undefined) patch.medical_notes = input.medicalNotes.trim();
  if (input.waiverSigned !== undefined) patch.waiver_signed = input.waiverSigned;
  if (input.typedSignature !== undefined) patch.typed_signature = input.typedSignature.trim();
  if (input.signedAt !== undefined) patch.signed_at = input.signedAt;
  if (input.waiverVersion !== undefined) patch.waiver_version = input.waiverVersion;
  if (input.mediaConsent !== undefined) patch.media_consent = input.mediaConsent;
  if (input.ipAddress !== undefined) patch.ip_address = input.ipAddress;
  if (input.passPurchaseId !== undefined) patch.pass_purchase_id = input.passPurchaseId;
  if (input.bookingIds) patch.booking_ids = input.bookingIds;
  if (input.checkoutSessionId !== undefined) patch.stripe_checkout_session_id = input.checkoutSessionId;
  if (input.paymentIntentId !== undefined) patch.stripe_payment_intent_id = input.paymentIntentId;
  if (input.paymentStatus !== undefined) patch.payment_status = input.paymentStatus;
  if (typeof input.creditsUsed === "number") patch.credits_used = Math.max(0, input.creditsUsed);
  if (typeof input.creditsRemaining === "number") patch.credits_remaining = Math.max(0, input.creditsRemaining);
  if (input.paidAt !== undefined) patch.paid_at = input.paidAt;

  const rows = await supabaseRequest<CustomPaymentLinkRow[]>(
    `custom_payment_links?id=eq.${encodeFilter(input.id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(patch)
    }
  );

  return rows[0] ?? null;
}

export async function confirmCustomPaymentLinkPaid(input: {
  customPaymentLinkId: string;
  checkoutSessionId?: string;
  paymentIntentId?: string;
  paymentStatus?: string;
  selectedSessionIds?: string[];
  selectedPrivateSessionIds?: string[];
  passPurchaseId?: string | null;
  bookingIds?: string[];
  creditsUsed?: number;
  creditsRemaining?: number;
}) {
  const details = await getCustomPaymentLinkById(input.customPaymentLinkId);

  if (!details) {
    throw new Error("Custom payment link could not be found.");
  }

  const totalCredits = Number(details.link.selected_total_credits ?? details.link.total_credits) || 0;
  const creditsUsed = Math.max(0, Number(input.creditsUsed ?? details.link.credits_used) || 0);
  const creditsRemaining =
    typeof input.creditsRemaining === "number"
      ? Math.max(0, input.creditsRemaining)
      : totalCredits > 0
        ? Math.max(0, totalCredits - creditsUsed)
        : 0;
  const selectedCount =
    input.selectedSessionIds?.length ??
    input.selectedPrivateSessionIds?.length ??
    details.link.selected_session_ids.length + details.link.selected_private_session_ids.length;
  const nextStatus: CustomPaymentLinkStatus =
    totalCredits > 0 && creditsRemaining === 0
      ? "fully_scheduled"
      : selectedCount > 0
        ? "partially_scheduled"
        : "paid";

  return updateCustomPaymentLink({
    id: input.customPaymentLinkId,
    status: nextStatus,
    selectedSessionIds: input.selectedSessionIds,
    selectedPrivateSessionIds: input.selectedPrivateSessionIds,
    passPurchaseId: input.passPurchaseId,
    bookingIds: input.bookingIds,
    checkoutSessionId: input.checkoutSessionId,
    paymentIntentId: input.paymentIntentId,
    paymentStatus: input.paymentStatus || "paid",
    creditsUsed,
    creditsRemaining,
    paidAt: new Date().toISOString()
  });
}

export async function createManualScheduleApprovalLink(input: {
  token: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  playerName: string;
  playerAge: string;
  trainingGroup: TrainingGroupId;
  amountPaid: number;
  paymentMethod: ScheduleApprovalPaymentMethod;
  internalNote?: string;
  proposedSessionIds: string[];
}) {
  const option = getLaunchPassOption("six_session_launch_pass");
  const insertedPasses = await supabaseRequest<PassPurchaseRow[]>("pass_purchases", {
    method: "POST",
    body: JSON.stringify({
      parent_name: input.parentName.trim(),
      parent_email: input.parentEmail.trim().toLowerCase(),
      parent_phone: input.parentPhone.trim(),
      player_name: input.playerName.trim(),
      player_age: input.playerAge.trim(),
      training_group: input.trainingGroup,
      pass_type: "six_session_launch_pass",
      total_credits: option.credits,
      remaining_credits: option.credits,
      amount_paid: input.amountPaid,
      status: "paid",
      selected_session_ids: input.proposedSessionIds,
      booking_details: {
        source: "manual_schedule_approval",
        paymentMethod: input.paymentMethod,
        internalNote: input.internalNote ?? ""
      },
      expires_at: launchPassExpirationDate
    })
  });
  const pass = insertedPasses[0];

  if (!pass) {
    throw new Error("Manual Training Package could not be created.");
  }

  const insertedApprovals = await supabaseRequest<ScheduleApprovalRow[]>("schedule_approval_links", {
    method: "POST",
    body: JSON.stringify({
      token: input.token,
      pass_purchase_id: pass.id,
      parent_name: input.parentName.trim(),
      parent_email: input.parentEmail.trim().toLowerCase(),
      parent_phone: input.parentPhone.trim(),
      player_name: input.playerName.trim(),
      player_age: input.playerAge.trim(),
      training_group: input.trainingGroup,
      plan_type: "six_session_launch_pass",
      amount_paid: input.amountPaid,
      payment_method: input.paymentMethod,
      internal_note: input.internalNote?.trim() || null,
      proposed_session_ids: input.proposedSessionIds,
      status: "pending"
    })
  });
  const approval = insertedApprovals[0];

  if (!approval) {
    throw new Error("Schedule approval link could not be created.");
  }

  return {
    pass,
    approval
  };
}

export async function createScheduleApprovalForExistingPass(input: {
  token: string;
  passPurchaseId: string;
  internalNote?: string;
  proposedSessionIds: string[];
}) {
  const pass = await getPassPurchaseById(input.passPurchaseId);

  if (!pass) {
    throw new Error("Training Package could not be found.");
  }

  if (pass.status !== "paid") {
    throw new Error("Training Package is not marked paid.");
  }

  if (pass.remaining_credits < input.proposedSessionIds.length) {
    throw new Error("Training Package does not have enough remaining credits for this schedule.");
  }

  const insertedApprovals = await supabaseRequest<ScheduleApprovalRow[]>("schedule_approval_links", {
    method: "POST",
    body: JSON.stringify({
      token: input.token,
      pass_purchase_id: pass.id,
      parent_name: pass.parent_name,
      parent_email: pass.parent_email,
      parent_phone: pass.parent_phone,
      player_name: pass.player_name,
      player_age: pass.player_age,
      training_group: pass.training_group,
      plan_type: pass.pass_type,
      amount_paid: pass.amount_paid,
      payment_method: "other",
      internal_note: input.internalNote?.trim() || null,
      proposed_session_ids: input.proposedSessionIds,
      status: "pending"
    })
  });
  const approval = insertedApprovals[0];

  if (!approval) {
    throw new Error("Schedule approval link could not be created.");
  }

  return {
    pass,
    approval
  };
}

export async function getScheduleApprovalByToken(token: string): Promise<ScheduleApprovalDetails | null> {
  const approvals = await supabaseRequest<ScheduleApprovalRow[]>(
    `schedule_approval_links?select=*&token=eq.${encodeFilter(token)}&limit=1`
  ).catch(() => []);
  const approval = approvals[0];

  if (!approval) {
    return null;
  }

  const [pass, sessions] = await Promise.all([
    getPassPurchaseById(approval.pass_purchase_id),
    approval.proposed_session_ids.length > 0
      ? supabaseRequest<TrainingSessionRow[]>(
          `training_sessions?select=*&id=in.(${approval.proposed_session_ids.map(encodeFilter).join(",")})`
        ).catch(() => [])
      : Promise.resolve([])
  ]);
  const sessionMap = new Map(sessions.map((session) => [session.id, session]));

  return {
    approval,
    pass,
    sessions: approval.proposed_session_ids
      .map((sessionId) => sessionMap.get(sessionId))
      .filter((session): session is TrainingSessionRow => Boolean(session))
  };
}

export async function confirmScheduleApprovalLink(token: string) {
  return supabaseRequest<Array<{ booking_id: string; session_id: string; credit_redemption_id: string; remaining_credits: number }>>(
    "rpc/confirm_schedule_approval_link",
    {
      method: "POST",
      body: JSON.stringify({
        p_token: token
      })
    }
  );
}

export async function listAdminDirectPayments() {
  return supabaseRequest<DirectPaymentRow[]>("direct_payments?select=*&order=created_at.desc").catch(() => []);
}

export async function createPrivateSessionRequest(input: PrivateSessionRequestInput) {
  const rows = await supabaseRequest<PrivateSessionRequestRow[]>("private_session_requests", {
    method: "POST",
    body: JSON.stringify({
      player_name: input.playerName.trim(),
      player_age: input.playerAge.trim(),
      parent_name: input.parentName.trim(),
      parent_email: input.parentEmail.trim().toLowerCase(),
      parent_phone: input.parentPhone.trim(),
      preferred_times: input.preferredTimes.trim(),
      focus_areas: input.focusAreas.filter(Boolean),
      notes: input.notes?.trim() || null,
      status: "new",
      location: business.location,
      timezone: defaultTimeZone
    })
  });

  return rows[0] ?? null;
}

export async function listAdminPrivateSessionRequests() {
  return supabaseRequest<PrivateSessionRequestRow[]>(
    "private_session_requests?select=*&order=created_at.desc"
  ).catch(() => []);
}

export async function updatePrivateSessionRequest(
  id: string,
  updates: Partial<Pick<PrivateSessionRequestRow, "status" | "scheduled_start" | "scheduled_end" | "location" | "google_calendar_event_id" | "calendar_status" | "calendar_message">>
) {
  const rows = await supabaseRequest<PrivateSessionRequestRow[]>(`private_session_requests?id=eq.${encodeFilter(id)}`, {
    method: "PATCH",
    body: JSON.stringify(updates)
  });

  return rows[0] ?? null;
}

export async function listAdminPrivateSessionAvailability() {
  return supabaseRequest<PrivateSessionAvailabilityRow[]>(
    "private_session_availability?select=*&order=start_datetime.asc"
  ).catch(() => []);
}

export async function listPublicPrivateSessionAvailability() {
  const now = new Date().toISOString();

  return supabaseRequest<PrivateSessionAvailabilityRow[]>(
    [
      "private_session_availability?select=*",
      "status=eq.available",
      `start_datetime=gt.${encodeFilter(now)}`,
      "order=start_datetime.asc"
    ].join("&")
  ).catch(() => []);
}

export async function listPublicBookingPrivateSessionAvailability() {
  const now = new Date().toISOString();

  return supabaseRequest<PrivateSessionAvailabilityRow[]>(
    [
      "private_session_availability?select=*",
      "status=eq.available",
      "visibility=eq.public",
      `start_datetime=gt.${encodeFilter(now)}`,
      "order=start_datetime.asc"
    ].join("&")
  ).catch(() => []);
}

export async function createPrivateSessionAvailability(input: PrivateSessionAvailabilityInput) {
  const start = zonedDateTimeToUtc(input.date, input.startTime, defaultTimeZone);
  const explicitEnd = input.endTime ? zonedDateTimeToUtc(input.date, input.endTime, defaultTimeZone) : null;
  const end = explicitEnd && explicitEnd.getTime() > start.getTime() ? explicitEnd : new Date(start.getTime() + 60 * 60_000);
  const rows = await supabaseRequest<PrivateSessionAvailabilityRow[]>("private_session_availability", {
    method: "POST",
    body: JSON.stringify({
      start_datetime: start.toISOString(),
      end_datetime: end.toISOString(),
      timezone: defaultTimeZone,
      location: input.location?.trim() || business.location,
      session_focus: input.sessionFocus?.trim() || "Private Session",
      notes: input.notes?.trim() || null,
      status: input.status || "available",
      visibility: input.visibility || "private_link"
    })
  });

  return rows[0] ?? null;
}

export async function updatePrivateSessionAvailability(
  id: string,
  updates: Partial<
    Pick<
      PrivateSessionAvailabilityRow,
      | "location"
      | "session_focus"
      | "notes"
      | "status"
      | "visibility"
      | "payment_method"
      | "payment_status"
      | "waiver_signed"
      | "typed_signature"
      | "signed_at"
      | "waiver_version"
      | "media_consent"
      | "emergency_name"
      | "emergency_phone"
      | "medical_notes"
      | "ip_address"
      | "google_calendar_event_id"
      | "calendar_status"
      | "calendar_message"
      | "email_status"
      | "email_message"
      | "pushover_status"
      | "pushover_message"
    >
  > & {
    date?: string;
    startTime?: string;
    endTime?: string;
  }
) {
  const payload: Record<string, unknown> = {};

  if (updates.date && updates.startTime) {
    const start = zonedDateTimeToUtc(updates.date, updates.startTime, defaultTimeZone);
    const explicitEnd = updates.endTime ? zonedDateTimeToUtc(updates.date, updates.endTime, defaultTimeZone) : null;
    const end = explicitEnd && explicitEnd.getTime() > start.getTime() ? explicitEnd : new Date(start.getTime() + 60 * 60_000);
    payload.start_datetime = start.toISOString();
    payload.end_datetime = end.toISOString();
    payload.timezone = defaultTimeZone;
  }

  if (typeof updates.location === "string") payload.location = updates.location.trim() || business.location;
  if (typeof updates.session_focus === "string") payload.session_focus = updates.session_focus.trim() || "Private Session";
  if (typeof updates.notes === "string" || updates.notes === null) payload.notes = updates.notes?.trim() || null;
  if (updates.status) payload.status = updates.status;
  if (updates.visibility) payload.visibility = updates.visibility;
  if (updates.payment_method) payload.payment_method = updates.payment_method;
  if (updates.payment_status) payload.payment_status = updates.payment_status;
  if (updates.waiver_signed !== undefined) payload.waiver_signed = updates.waiver_signed;
  if (updates.typed_signature !== undefined) payload.typed_signature = updates.typed_signature?.trim() || null;
  if (updates.signed_at !== undefined) payload.signed_at = updates.signed_at;
  if (updates.waiver_version !== undefined) payload.waiver_version = updates.waiver_version;
  if (updates.media_consent !== undefined) payload.media_consent = updates.media_consent;
  if (updates.emergency_name !== undefined) payload.emergency_name = updates.emergency_name?.trim() || null;
  if (updates.emergency_phone !== undefined) payload.emergency_phone = updates.emergency_phone?.trim() || null;
  if (updates.medical_notes !== undefined) payload.medical_notes = updates.medical_notes?.trim() || null;
  if (updates.ip_address !== undefined) payload.ip_address = updates.ip_address;
  if (updates.google_calendar_event_id !== undefined) payload.google_calendar_event_id = updates.google_calendar_event_id;
  if (updates.calendar_status !== undefined) payload.calendar_status = updates.calendar_status;
  if (updates.calendar_message !== undefined) payload.calendar_message = updates.calendar_message;
  if (updates.email_status !== undefined) payload.email_status = updates.email_status;
  if (updates.email_message !== undefined) payload.email_message = updates.email_message;
  if (updates.pushover_status !== undefined) payload.pushover_status = updates.pushover_status;
  if (updates.pushover_message !== undefined) payload.pushover_message = updates.pushover_message;

  const rows = await supabaseRequest<PrivateSessionAvailabilityRow[]>(
    `private_session_availability?id=eq.${encodeFilter(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload)
    }
  );

  return rows[0] ?? null;
}

export async function deletePrivateSessionAvailability(id: string) {
  return supabaseRequest<null>(`private_session_availability?id=eq.${encodeFilter(id)}`, {
    method: "DELETE"
  });
}

export async function bookPrivateSessionAvailability(input: {
  privateSessionId: string;
  customPaymentLinkId?: string | null;
  playerName: string;
  playerAge: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  paymentMethod?: PrivateSessionPaymentMethod;
  paymentStatus?: PrivateSessionPaymentStatus;
  checkoutSessionId?: string;
  paymentIntentId?: string;
  amountPaid?: number;
  waiverSigned?: boolean;
  typedSignature?: string;
  signedAt?: string;
  waiverVersion?: string;
  mediaConsent?: "Granted" | "Declined";
  emergencyName?: string;
  emergencyPhone?: string;
  medicalNotes?: string;
  ipAddress?: string;
}) {
  const rows = await supabaseRequest<PrivateSessionAvailabilityRow[]>(
    [
      `private_session_availability?id=eq.${encodeFilter(input.privateSessionId)}`,
      "status=eq.available"
    ].join("&"),
    {
      method: "PATCH",
      body: JSON.stringify({
        status: "booked",
        player_name: input.playerName,
        player_age: input.playerAge,
        parent_name: input.parentName,
        parent_email: input.parentEmail,
        parent_phone: input.parentPhone,
        payment_method: input.paymentMethod || "card",
        payment_status: input.paymentStatus || "paid",
        custom_payment_link_id: input.customPaymentLinkId || null,
        stripe_checkout_session_id: input.checkoutSessionId || null,
        stripe_payment_intent_id: input.paymentIntentId || null,
        amount_paid: input.amountPaid ?? 0,
        waiver_signed: input.waiverSigned ?? true,
        typed_signature: input.typedSignature?.trim() || null,
        signed_at: input.signedAt || new Date().toISOString(),
        waiver_version: input.waiverVersion || null,
        media_consent: input.mediaConsent || null,
        emergency_name: input.emergencyName?.trim() || null,
        emergency_phone: input.emergencyPhone?.trim() || null,
        medical_notes: input.medicalNotes?.trim() || null,
        ip_address: input.ipAddress || null,
        booked_at: new Date().toISOString()
      })
    }
  );
  const booked = rows[0];

  if (!booked) {
    throw new Error("That private session time is no longer available.");
  }

  return booked;
}

export async function confirmPrivateSessionAvailabilityPayment(input: {
  privateSessionId: string;
  checkoutSessionId: string;
  paymentIntentId?: string;
  amountPaid?: number;
}) {
  const rows = await supabaseRequest<PrivateSessionAvailabilityRow[]>(
    [
      `private_session_availability?id=eq.${encodeFilter(input.privateSessionId)}`,
      "status=eq.booked",
      "payment_status=eq.pending_card_payment",
      `stripe_checkout_session_id=eq.${encodeFilter(input.checkoutSessionId)}`
    ].join("&"),
    {
      method: "PATCH",
      body: JSON.stringify({
        payment_status: "paid",
        stripe_payment_intent_id: input.paymentIntentId || null,
        amount_paid: input.amountPaid ?? 0,
        booked_at: new Date().toISOString()
      })
    }
  );
  const confirmed = rows[0];

  if (!confirmed) {
    throw new Error("That private session payment could not be matched to a pending private booking.");
  }

  return confirmed;
}

export async function schedulePrivateSessionRequest(input: {
  id: string;
  date: string;
  startTime: string;
  endTime?: string;
  location?: string;
}) {
  const start = zonedDateTimeToUtc(input.date, input.startTime, defaultTimeZone);
  const explicitEnd = input.endTime ? zonedDateTimeToUtc(input.date, input.endTime, defaultTimeZone) : null;
  const end = explicitEnd && explicitEnd.getTime() > start.getTime() ? explicitEnd : new Date(start.getTime() + 60 * 60_000);

  return updatePrivateSessionRequest(input.id, {
    status: "scheduled",
    scheduled_start: start.toISOString(),
    scheduled_end: end.toISOString(),
    location: input.location?.trim() || business.location,
    calendar_status: "Ready",
    calendar_message: null
  });
}

export async function listAdminEmailSubscribers() {
  return supabaseRequest<EmailSubscriberRow[]>("email_subscribers?select=*&order=opted_in_at.desc").catch(() => []);
}

async function upsertEmailSubscriber(input: EmailSubscriberInput) {
  const email = input.email.trim().toLowerCase();

  if (!email) {
    return null;
  }

  const now = new Date().toISOString();
  const payload = {
    parent_name: input.parentName?.trim() || null,
    email,
    phone: input.phone?.trim() || null,
    player_name: input.playerName?.trim() || null,
    player_age: input.playerAge?.trim() || null,
    source: input.source?.trim() || null,
    opted_in: true,
    opted_in_at: now,
    updated_at: now
  };
  const existing = await supabaseRequest<EmailSubscriberRow[]>(
    `email_subscribers?select=*&email=eq.${encodeFilter(email)}&limit=1`
  );
  const current = existing[0];

  if (current) {
    const updated = await supabaseRequest<EmailSubscriberRow[]>(`email_subscribers?id=eq.${encodeFilter(current.id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });

    return updated[0] ?? current;
  }

  const inserted = await supabaseRequest<EmailSubscriberRow[]>("email_subscribers", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      unsubscribed: false
    })
  });

  return inserted[0] ?? null;
}

export async function saveEmailSubscriberOptIn(input: EmailSubscriberInput) {
  try {
    const subscriber = await upsertEmailSubscriber(input);

    if (subscriber) {
      console.info("[EST Email List] Opt-in saved", {
        email: subscriber.email,
        source: subscriber.source
      });
    }

    return subscriber;
  } catch (error) {
    console.error("[EST Email List] Opt-in could not be saved", {
      email: input.email,
      source: input.source,
      error: error instanceof Error ? error.message : String(error)
    });

    return null;
  }
}

export async function updateEmailSubscriberStatus(id: string, unsubscribed: boolean) {
  const rows = await supabaseRequest<EmailSubscriberRow[]>(`email_subscribers?id=eq.${encodeFilter(id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      unsubscribed,
      unsubscribed_at: unsubscribed ? new Date().toISOString() : null
    })
  });

  return rows[0] ?? null;
}

export async function deleteEmailSubscriber(id: string) {
  await supabaseRequest<null>(`email_subscribers?id=eq.${encodeFilter(id)}`, {
    method: "DELETE",
    headers: {
      Prefer: "return=minimal"
    }
  });
}

export async function createDirectPaymentRecord(input: DirectPaymentInput) {
  const option = getDirectPaymentOption(input.paymentOption);
  const playerCount = input.playerCount === 2 ? 2 : 1;
  const sessionCount =
    input.paymentOption === "single_session" ? Math.min(6, Math.max(1, Math.floor(input.sessionCount || 1))) : 1;
  const status: DirectPaymentStatus = input.paymentMethod === "card" ? "pending_card_payment" : "zelle_pending";
  const basePayload: Record<string, unknown> = {
    player_count: playerCount,
    player_first_name: input.playerFirstName.trim(),
    player_last_name: input.playerLastName.trim(),
    player_age: input.playerAge.trim(),
    second_player_first_name: playerCount === 2 ? input.secondPlayerFirstName?.trim() || null : null,
    second_player_last_name: playerCount === 2 ? input.secondPlayerLastName?.trim() || null : null,
    second_player_age: playerCount === 2 ? input.secondPlayerAge?.trim() || null : null,
    parent_name: input.parentName.trim(),
    parent_email: input.parentEmail.trim().toLowerCase(),
    parent_phone: input.parentPhone.trim(),
    payment_option: input.paymentOption,
    payment_method: input.paymentMethod,
    status,
    amount_due: option.amountCents * playerCount * sessionCount,
    amount_paid: 0,
    waiver_signed: input.waiverSigned,
    typed_signature: input.typedSignature.trim(),
    signed_at: input.signedAt,
    waiver_version: input.waiverVersion,
    media_consent: input.mediaConsent,
    emergency_name: input.emergencyName.trim(),
    emergency_phone: input.emergencyPhone.trim(),
    medical_notes: input.medicalNotes.trim(),
    ip_address: input.ipAddress || null
  };

  if (input.paymentOption === "single_session") {
    basePayload.session_count = sessionCount;
  }

  const inserted = await supabaseRequest<DirectPaymentRow[]>("direct_payments", {
    method: "POST",
    body: JSON.stringify(basePayload)
  });
  const record = inserted[0];

  if (!record) {
    throw new Error("Direct payment record could not be saved.");
  }

  return record;
}

export async function attachDirectPaymentStripeCheckoutSession(directPaymentId: string, checkoutSessionId: string) {
  await supabaseRequest<DirectPaymentRow[]>(`direct_payments?id=eq.${encodeFilter(directPaymentId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      stripe_checkout_session_id: checkoutSessionId
    })
  });
}

export async function markDirectPaymentPaid(input: {
  directPaymentId: string;
  checkoutSessionId?: string;
  paymentIntentId?: string;
  amountPaid?: number;
}): Promise<DirectPaymentPaidRow> {
  const existing = await supabaseRequest<DirectPaymentRow[]>(
    `direct_payments?select=*&id=eq.${encodeFilter(input.directPaymentId)}&limit=1`
  );
  const current = existing[0];

  if (!current) {
    throw new Error("Direct payment record was not found.");
  }

  const wasAlreadyPaid = current.status === "paid";
  const rows = await supabaseRequest<DirectPaymentRow[]>(`direct_payments?id=eq.${encodeFilter(input.directPaymentId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "paid",
      stripe_checkout_session_id: input.checkoutSessionId || current.stripe_checkout_session_id || null,
      stripe_payment_intent_id: input.paymentIntentId || current.stripe_payment_intent_id || null,
      amount_paid: (input.amountPaid ?? current.amount_paid) || current.amount_due
    })
  });
  const record = rows[0];

  if (!record) {
    throw new Error("Direct payment record could not be marked paid.");
  }

  return {
    ...record,
    wasAlreadyPaid
  };
}

export async function updateDirectPaymentStatus(id: string, status: DirectPaymentStatus) {
  const existing = await supabaseRequest<DirectPaymentRow[]>(
    `direct_payments?select=*&id=eq.${encodeFilter(id)}&limit=1`
  );
  const current = existing[0];

  if (!current) {
    throw new Error("Direct payment record was not found.");
  }

  const rows = await supabaseRequest<DirectPaymentRow[]>(`direct_payments?id=eq.${encodeFilter(id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      status,
      amount_paid: status === "paid" ? current.amount_due : 0
    })
  });

  return rows[0] ?? null;
}

export async function updateBookingContactInfo(id: string, input: ContactInfoInput) {
  const payload: Record<string, string> = {};

  if (typeof input.parentName === "string") payload.parent_name = input.parentName.trim();
  if (typeof input.parentEmail === "string") payload.parent_email = input.parentEmail.trim().toLowerCase();
  if (typeof input.parentPhone === "string") payload.parent_phone = input.parentPhone.trim();
  if (typeof input.playerName === "string") payload.player_name = input.playerName.trim();
  if (typeof input.playerAge === "string") payload.player_age = input.playerAge.trim();

  if (Object.keys(payload).length === 0) {
    throw new Error("No contact changes were provided.");
  }

  const rows = await supabaseRequest<BookingRow[]>(`bookings?id=eq.${encodeFilter(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });

  return rows[0] ?? null;
}

export async function updatePassPurchaseContactInfo(id: string, input: ContactInfoInput) {
  const payload: Record<string, string> = {};

  if (typeof input.parentName === "string") payload.parent_name = input.parentName.trim();
  if (typeof input.parentEmail === "string") payload.parent_email = input.parentEmail.trim().toLowerCase();
  if (typeof input.parentPhone === "string") payload.parent_phone = input.parentPhone.trim();
  if (typeof input.playerName === "string") payload.player_name = input.playerName.trim();
  if (typeof input.playerAge === "string") payload.player_age = input.playerAge.trim();

  if (Object.keys(payload).length === 0) {
    throw new Error("No contact changes were provided.");
  }

  const rows = await supabaseRequest<PassPurchaseRow[]>(`pass_purchases?id=eq.${encodeFilter(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });

  return rows[0] ?? null;
}

export async function updateDirectPaymentContactInfo(id: string, input: ContactInfoInput) {
  const payload: Record<string, string> = {};

  if (typeof input.parentName === "string") payload.parent_name = input.parentName.trim();
  if (typeof input.parentEmail === "string") payload.parent_email = input.parentEmail.trim().toLowerCase();
  if (typeof input.parentPhone === "string") payload.parent_phone = input.parentPhone.trim();
  if (typeof input.playerFirstName === "string") payload.player_first_name = input.playerFirstName.trim();
  if (typeof input.playerLastName === "string") payload.player_last_name = input.playerLastName.trim();
  if (typeof input.playerAge === "string") payload.player_age = input.playerAge.trim();
  if (typeof input.secondPlayerFirstName === "string") payload.second_player_first_name = input.secondPlayerFirstName.trim();
  if (typeof input.secondPlayerLastName === "string") payload.second_player_last_name = input.secondPlayerLastName.trim();
  if (typeof input.secondPlayerAge === "string") payload.second_player_age = input.secondPlayerAge.trim();

  if (Object.keys(payload).length === 0) {
    throw new Error("No contact changes were provided.");
  }

  const rows = await supabaseRequest<DirectPaymentRow[]>(`direct_payments?id=eq.${encodeFilter(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });

  return rows[0] ?? null;
}

export async function updateEmailSubscriberContactInfo(id: string, input: ContactInfoInput) {
  const payload: Record<string, string> = {};

  if (typeof input.parentName === "string") payload.parent_name = input.parentName.trim();
  if (typeof input.parentEmail === "string") payload.email = input.parentEmail.trim().toLowerCase();
  if (typeof input.parentPhone === "string") payload.phone = input.parentPhone.trim();
  if (typeof input.playerName === "string") payload.player_name = input.playerName.trim();
  if (typeof input.playerAge === "string") payload.player_age = input.playerAge.trim();

  if (Object.keys(payload).length === 0) {
    throw new Error("No contact changes were provided.");
  }

  const rows = await supabaseRequest<EmailSubscriberRow[]>(`email_subscribers?id=eq.${encodeFilter(id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...payload,
      updated_at: new Date().toISOString()
    })
  });

  return rows[0] ?? null;
}

function adminStatusToBookingStatus(status: ManualBookingPaymentStatus): BookingRow["status"] {
  return status === "pending_payment" ? "pending_payment" : "paid";
}

function normalizeManualPaymentMethod(method: string): ManualBookingPaymentMethod {
  const allowed: ManualBookingPaymentMethod[] = [
    "Zelle",
    "Cash",
    "Venmo",
    "Card",
    "Training Package credit",
    "Comped",
    "Other"
  ];

  return allowed.includes(method as ManualBookingPaymentMethod) ? (method as ManualBookingPaymentMethod) : "Other";
}

function normalizeManualPaymentStatus(status: string): ManualBookingPaymentStatus {
  const allowed: ManualBookingPaymentStatus[] = ["paid", "pending_payment", "comped", "training_credit_used"];

  return allowed.includes(status as ManualBookingPaymentStatus) ? (status as ManualBookingPaymentStatus) : "pending_payment";
}

function normalizeWaiverStatus(status: string): ManualBookingWaiverStatus {
  return status === "signed" ? "signed" : "missing";
}

async function ensureManualCapacity(input: {
  session: TrainingSessionRow;
  playerCount?: number;
  overrideCapacity?: boolean;
  excludeBookingId?: string;
}) {
  if (input.overrideCapacity) {
    return;
  }

  if (input.session.status !== "open") {
    throw new Error("This session is not open. Use admin override only if you intentionally want to add the player anyway.");
  }

  const bookings = await listAdminBookings();
  const confirmedPlayers = bookings
    .filter((booking) => booking.session_id === input.session.id && booking.id !== input.excludeBookingId && isAdminBookingConfirmed(booking))
    .reduce((total, booking) => total + (Number(booking.player_count) || 1), 0);

  if (confirmedPlayers + (input.playerCount || 1) > input.session.capacity) {
    throw new Error("This session is full. Turn on admin override only if you intentionally want to exceed capacity.");
  }
}

async function saveManualWaiverIfNeeded(booking: BookingRecord, waiverStatus: ManualBookingWaiverStatus) {
  if (waiverStatus !== "signed") {
    return;
  }

  await saveWaiverForBooking({
    ...booking,
    waiverAccepted: true,
    guardianSignature: booking.guardianSignature || booking.parentName,
    waiverAcceptedAt: booking.waiverAcceptedAt || new Date().toISOString(),
    mediaConsent: booking.mediaConsent || "Granted"
  });
}

export async function createManualAdminBooking(input: ManualBookingInput) {
  const session = await getSessionOrThrow(input.sessionId);
  const paymentStatus = normalizeManualPaymentStatus(input.paymentStatus);
  const paymentMethod = normalizeManualPaymentMethod(input.paymentMethod);
  const waiverStatus = normalizeWaiverStatus(input.waiverStatus);
  const isTrainingCredit = paymentMethod === "Training Package credit" || paymentStatus === "training_credit_used";

  if (isTrainingCredit) {
    if (!input.passPurchaseId) {
      throw new Error("Choose a Training Package holder before using a Training credit.");
    }

    const redeemed = await supabaseRequest<Array<{ booking_id: string; credit_redemption_id: string; remaining_credits: number }>>(
      "rpc/admin_redeem_launch_pass_credit",
      {
        method: "POST",
        body: JSON.stringify({
          p_pass_purchase_id: input.passPurchaseId,
          p_session_id: session.id,
          p_parent_name: input.parentName,
          p_parent_email: input.parentEmail,
          p_parent_phone: input.parentPhone,
          p_player_name: input.playerName,
          p_player_age: input.playerAge,
          p_training_group: session.training_group,
          p_notes: "",
          p_medical_notes: input.medicalNotes || "",
          p_emergency_name: input.emergencyName || "",
          p_emergency_phone: input.emergencyPhone || "",
          p_admin_payment_status: "training_credit_used",
          p_admin_payment_method: "Training Package credit",
          p_internal_note: input.internalNote || "",
          p_waiver_status: waiverStatus,
          p_override_capacity: Boolean(input.overrideCapacity)
        })
      }
    );
    const redemption = redeemed[0];

    if (!redemption) {
      throw new Error("Manual Training Package booking could not be saved.");
    }

    const booking = await getBookingRecordForConfirmation(redemption.booking_id, redemption.remaining_credits);
    await saveManualWaiverIfNeeded(booking, waiverStatus);

    return {
      booking: await getBookingRecordForConfirmation(redemption.booking_id, redemption.remaining_credits),
      bookingRow: await getAdminBookingById(redemption.booking_id)
    };
  }

  const confirmedStatus = adminStatusToBookingStatus(paymentStatus);

  if (confirmedStatus === "paid") {
    await ensureManualCapacity({
      session,
      overrideCapacity: input.overrideCapacity
    });
  }

  const rows = await supabaseRequest<BookingRow[]>("bookings", {
    method: "POST",
    body: JSON.stringify({
      session_id: session.id,
      parent_name: input.parentName.trim(),
      parent_email: input.parentEmail.trim().toLowerCase(),
      parent_phone: input.parentPhone.trim(),
      player_name: input.playerName.trim(),
      player_age: input.playerAge.trim(),
      training_group: session.training_group,
      status: confirmedStatus,
      amount_paid: Math.max(0, Math.round(Number(input.amountPaid) || 0)),
      player_count: 1,
      notes: null,
      medical_notes: input.medicalNotes?.trim() || null,
      emergency_name: input.emergencyName?.trim() || null,
      emergency_phone: input.emergencyPhone?.trim() || null,
      payment_type: "single_session",
      manual_source: true,
      admin_payment_status: paymentStatus,
      admin_payment_method: paymentMethod,
      waiver_status: waiverStatus,
      internal_note: input.internalNote?.trim() || null,
      admin_override_capacity: Boolean(input.overrideCapacity)
    })
  });
  const bookingRow = rows[0];

  if (!bookingRow) {
    throw new Error("Manual booking could not be saved.");
  }

  const booking = await getBookingRecordForConfirmation(bookingRow.id);
  await saveManualWaiverIfNeeded(booking, waiverStatus);

  return {
    booking: await getBookingRecordForConfirmation(bookingRow.id),
    bookingRow: await getAdminBookingById(bookingRow.id)
  };
}

export async function updateAdminBookingManualDetails(bookingId: string, input: ManualBookingUpdateInput) {
  const existing = await getAdminBookingById(bookingId);

  if (!existing) {
    throw new Error("Booking was not found.");
  }

  const paymentStatus =
    typeof input.paymentStatus === "string" ? normalizeManualPaymentStatus(input.paymentStatus) : existing.admin_payment_status || existing.status;
  const nextStatus = adminStatusToBookingStatus(paymentStatus as ManualBookingPaymentStatus);
  const session = await getSessionOrThrow(existing.session_id);

  if (nextStatus === "paid" && existing.status !== "paid") {
    await ensureManualCapacity({
      session,
      excludeBookingId: existing.id
    });
  }

  const payload: Record<string, unknown> = {};

  if (typeof input.playerName === "string") payload.player_name = input.playerName.trim();
  if (typeof input.playerAge === "string") payload.player_age = input.playerAge.trim();
  if (typeof input.parentName === "string") payload.parent_name = input.parentName.trim();
  if (typeof input.parentEmail === "string") payload.parent_email = input.parentEmail.trim().toLowerCase();
  if (typeof input.parentPhone === "string") payload.parent_phone = input.parentPhone.trim();
  if (typeof input.paymentStatus === "string") {
    payload.status = nextStatus;
    payload.admin_payment_status = paymentStatus;
  }
  if (typeof input.paymentMethod === "string") payload.admin_payment_method = normalizeManualPaymentMethod(input.paymentMethod);
  if (typeof input.amountPaid === "number") payload.amount_paid = Math.max(0, Math.round(input.amountPaid));
  if (typeof input.waiverStatus === "string") payload.waiver_status = normalizeWaiverStatus(input.waiverStatus);
  if (typeof input.notes === "string") payload.notes = input.notes.trim() || null;
  if (typeof input.medicalNotes === "string") payload.medical_notes = input.medicalNotes.trim() || null;
  if (typeof input.emergencyName === "string") payload.emergency_name = input.emergencyName.trim() || null;
  if (typeof input.emergencyPhone === "string") payload.emergency_phone = input.emergencyPhone.trim() || null;
  if (typeof input.internalNote === "string") payload.internal_note = input.internalNote.trim() || null;
  payload.manual_source = existing.manual_source ?? true;

  const rows = await supabaseRequest<BookingRow[]>(`bookings?id=eq.${encodeFilter(bookingId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
  const updated = rows[0];

  if (!updated) {
    throw new Error("Booking could not be updated.");
  }

  if (input.waiverStatus === "signed") {
    const booking = await getBookingRecordForConfirmation(updated.id);
    await saveManualWaiverIfNeeded(booking, "signed");
  }

  return getAdminBookingById(updated.id);
}

export async function cancelAdminBooking(input: {
  bookingId: string;
  returnCredit?: boolean;
}) {
  const booking = await getAdminBookingById(input.bookingId);

  if (!booking) {
    throw new Error("Booking was not found.");
  }

  let creditReturned = false;

  if (input.returnCredit) {
    const passPurchaseId = booking.pass_purchase_id || booking.creditRedemption?.pass_purchase_id;

    if (!passPurchaseId) {
      throw new Error("This booking is not connected to a Training Package credit.");
    }

    if (booking.creditAdjustment) {
      throw new Error("A Training credit has already been returned for this booking.");
    }

    const issued = await issueManualLaunchPassCredit({
      passPurchaseId,
      creditAmount: 1,
      reason: "Admin correction",
      note: `Returned after admin cancelled booking ${booking.id} for ${booking.player_name}.`,
      createdBy: "admin"
    });

    await supabaseRequest<CreditAdjustmentRow[]>(`credit_adjustments?id=eq.${encodeFilter(issued.adjustment.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        original_booking_id: booking.id,
        original_session_id: booking.session_id
      })
    });
    creditReturned = true;
  }

  const rows = await supabaseRequest<BookingRow[]>(`bookings?id=eq.${encodeFilter(input.bookingId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "cancelled"
    })
  });

  return {
    booking: rows[0] ?? null,
    creditReturned
  };
}

export async function listAdminTrainingSessions(): Promise<AdminTrainingSession[]> {
  const [sessions, bookings] = await Promise.all([listTrainingSessions(), listAdminBookings()]);

  return sessions.map((session) => {
    const paidBookings = bookings.filter((booking) => booking.session_id === session.id && isAdminBookingConfirmed(booking));
    const paidPlayers = paidBookings.reduce((total, booking) => total + (Number(booking.player_count) || 1), 0);

    return {
      ...session,
      paidPlayers,
      remainingSpots: Math.max(0, session.capacity - paidPlayers),
      paidBookings
    };
  });
}

async function getSessionOrThrow(sessionId: string) {
  const sessions = await supabaseRequest<TrainingSessionRow[]>(
    `training_sessions?select=*&id=eq.${encodeFilter(sessionId)}&limit=1`
  );
  const session = sessions[0];

  if (!session) {
    throw new Error("Selected session was not found.");
  }

  return session;
}

export async function issueLaunchPassMakeupCredit(input: {
  bookingId: string;
  createdBy?: string;
}) {
  const issued = await supabaseRequest<CreditAdjustmentRow[] | CreditAdjustmentRow>(
    "rpc/issue_launch_pass_makeup_credit",
    {
      method: "POST",
      body: JSON.stringify({
        p_booking_id: input.bookingId,
        p_created_by: input.createdBy || "admin"
      })
    }
  );
  const adjustment = Array.isArray(issued) ? issued[0] : issued;

  if (!adjustment) {
    throw new Error("Makeup credit could not be issued.");
  }

  if (!adjustment.original_booking_id || !adjustment.original_session_id) {
    throw new Error("Credited booking details could not be loaded.");
  }

  const bookingRows = await supabaseRequest<BookingRow[]>(
    `bookings?select=*&id=eq.${encodeFilter(adjustment.original_booking_id)}&limit=1`
  );
  const booking = bookingRows[0];

  if (!booking) {
    throw new Error("Credited booking could not be loaded.");
  }

  const session = await getSessionOrThrow(adjustment.original_session_id);
  const pass = await getPassPurchaseById(adjustment.pass_purchase_id);

  if (!pass) {
    throw new Error("Credited Training Package could not be loaded.");
  }

  return {
    adjustment,
    booking,
    session,
    pass
  };
}

export async function issueManualLaunchPassCredit(input: {
  passPurchaseId: string;
  creditAmount: number;
  reason: string;
  note?: string;
  createdBy?: string;
}) {
  const issued = await supabaseRequest<CreditAdjustmentRow[] | CreditAdjustmentRow>(
    "rpc/issue_manual_launch_pass_credit",
    {
      method: "POST",
      body: JSON.stringify({
        p_pass_purchase_id: input.passPurchaseId,
        p_credit_amount: Math.max(1, Math.floor(Number(input.creditAmount) || 1)),
        p_reason: input.reason,
        p_note: input.note || null,
        p_created_by: input.createdBy || "admin"
      })
    }
  );
  const adjustment = Array.isArray(issued) ? issued[0] : issued;

  if (!adjustment) {
    throw new Error("Manual credit could not be added.");
  }

  const pass = await getPassPurchaseById(adjustment.pass_purchase_id);

  if (!pass) {
    throw new Error("Credited Training Package could not be loaded.");
  }

  return {
    adjustment,
    pass
  };
}

export async function listPaidBookingsForSession(sessionId: string) {
  const bookings = await listAdminBookings();

  return bookings.filter((booking) => booking.session_id === sessionId && isAdminBookingConfirmed(booking));
}

export async function updateCreditAdjustmentEmailStatus(input: {
  adjustmentId: string;
  status: "sent" | "failed";
  errorMessage?: string;
}) {
  const rows = await supabaseRequest<CreditAdjustmentRow[]>(
    `credit_adjustments?id=eq.${encodeFilter(input.adjustmentId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        email_status: input.status,
        email_error: input.status === "failed" ? input.errorMessage || "Email could not be sent." : null,
        email_sent: input.status === "sent",
        email_sent_at: input.status === "sent" ? new Date().toISOString() : null
      })
    }
  );

  return rows[0] ?? null;
}

export async function createPendingBooking(rawBooking: BookingRecord, ipAddress = "") {
  const session = await getSessionOrThrow(rawBooking.sessionId);
  const availability = await getSupabaseAvailability();
  const publicSession = availability.sessions.find((item) => item.id === session.id);
  const playerCount = Number(rawBooking.players) || 1;

  if (session.status !== "open" || !publicSession || playerCount > publicSession.remainingSpots) {
    throw new Error("That session is no longer available or does not have enough spots.");
  }

  const inserted = await supabaseRequest<BookingRow[]>("bookings", {
    method: "POST",
    body: JSON.stringify({
      session_id: session.id,
      parent_name: rawBooking.parentName,
      parent_email: rawBooking.email,
      parent_phone: rawBooking.phone,
      player_name: rawBooking.playerName,
      player_age: rawBooking.playerAge,
      training_group: session.training_group,
      status: "pending_payment",
      amount_paid: 0,
      player_count: playerCount,
      notes: rawBooking.notes || null,
      medical_notes: rawBooking.medicalNotes || null,
      emergency_name: rawBooking.emergencyName || null,
      emergency_phone: rawBooking.emergencyPhone || null,
      payment_type: "single_session"
    })
  });
  const bookingRow = inserted[0];

  if (!bookingRow) {
    throw new Error("Booking could not be saved before payment.");
  }

  const booking = {
    ...rawBooking,
    id: bookingRow.id,
    createdAt: bookingRow.created_at,
    players: String(playerCount),
    ipAddress,
    programId: session.training_group,
    programName: publicSessionProgramName(publicSession),
    sessionId: session.id,
    sessionDateIso: publicSession.date,
    sessionDate: publicSession.dateLabel,
    sessionTime: publicSession.startTime,
    sessionDurationMinutes: 60,
    sessionCalendarEventId: undefined,
    paymentStatus: "pending_payment",
    notificationStatus: "Ready",
    calendarStatus: "Ready"
  } satisfies BookingRecord;

  await saveWaiverForBooking(booking);

  return {
    booking,
    session: publicSession
  };
}

export async function createPendingPassPurchase(input: {
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  playerName: string;
  playerAge: string;
  trainingGroup: TrainingGroupId;
  passType: LaunchPassType;
  selectedSessionIds?: string[];
  bookingDetails?: PassPurchaseBookingDetails;
}) {
  const option = getLaunchPassOption(input.passType);
  const inserted = await supabaseRequest<PassPurchaseRow[]>("pass_purchases", {
    method: "POST",
    body: JSON.stringify({
      parent_name: input.parentName.trim(),
      parent_email: input.parentEmail.trim().toLowerCase(),
      parent_phone: input.parentPhone.trim(),
      player_name: input.playerName.trim(),
      player_age: input.playerAge.trim(),
      training_group: input.trainingGroup,
      pass_type: input.passType,
      total_credits: option.credits,
      remaining_credits: option.credits,
      amount_paid: 0,
      status: "pending_payment",
      selected_session_ids: input.selectedSessionIds ?? [],
      booking_details: input.bookingDetails ?? {},
      expires_at: launchPassExpirationDate
    })
  });
  const pass = inserted[0];

  if (!pass) {
    throw new Error("Training Package purchase could not be saved before payment.");
  }

  return pass;
}

export async function attachPassStripeCheckoutSession(passPurchaseId: string, checkoutSessionId: string) {
  await supabaseRequest<PassPurchaseRow[]>(`pass_purchases?id=eq.${encodeFilter(passPurchaseId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      stripe_checkout_session_id: checkoutSessionId
    })
  });
}

export async function confirmPaidLaunchPassPurchase(input: {
  passPurchaseId: string;
  checkoutSessionId?: string;
  paymentIntentId?: string;
  amountPaid?: number;
}) {
  const confirmed = await supabaseRequest<PassPurchaseRow[] | PassPurchaseRow>("rpc/confirm_paid_launch_pass_purchase", {
    method: "POST",
    body: JSON.stringify({
      p_pass_purchase_id: input.passPurchaseId,
      p_stripe_checkout_session_id: input.checkoutSessionId || null,
      p_stripe_payment_intent_id: input.paymentIntentId || null,
      p_amount_paid: input.amountPaid ?? null
    })
  });
  const pass = Array.isArray(confirmed) ? confirmed[0] : confirmed;

  if (!pass) {
    throw new Error("Training Package payment could not be confirmed.");
  }

  return pass;
}

export async function getPassPurchaseById(passPurchaseId: string) {
  const rows = await supabaseRequest<PassPurchaseRow[]>(
    `pass_purchases?select=*&id=eq.${encodeFilter(passPurchaseId)}&limit=1`
  ).catch(() => []);

  return rows[0] ?? null;
}

export async function getBookingRecordForConfirmation(bookingId: string, remainingCreditsAfter?: number) {
  const bookings = await supabaseRequest<BookingRow[]>(
    `bookings?select=*&id=eq.${encodeFilter(bookingId)}&limit=1`
  ).catch(() => []);
  const booking = bookings[0];

  if (!booking) {
    throw new Error("Confirmed booking could not be loaded.");
  }

  const [session, waivers] = await Promise.all([
    getSessionOrThrow(booking.session_id),
    supabaseRequest<WaiverRow[]>(`waivers?select=*&booking_id=eq.${encodeFilter(booking.id)}&limit=1`).catch(() => [])
  ]);

  return toBookingRecordFromRows({
    booking,
    session,
    waiver: waivers[0] ?? null,
    remainingCreditsAfter
  });
}

export async function findActiveLaunchPasses(input: {
  parentEmail: string;
  playerName: string;
}) {
  const email = input.parentEmail.trim().toLowerCase();
  const playerName = input.playerName.trim();

  if (!email || !playerName) {
    return [];
  }

  const passes = await supabaseRequest<PassPurchaseRow[]>(
    [
      "pass_purchases?select=*",
      `parent_email=eq.${encodeFilter(email)}`,
      `player_name=ilike.${encodeFilter(playerName)}`,
      "status=eq.paid",
      "remaining_credits=gt.0",
      "order=created_at.desc"
    ].join("&")
  ).catch(() => []);

  return passes;
}

export async function listCreditRedemptionsForPass(passPurchaseId: string) {
  return supabaseRequest<CreditRedemptionRow[]>(
    `credit_redemptions?select=*&pass_purchase_id=eq.${encodeFilter(passPurchaseId)}&order=created_at.desc`
  ).catch(() => []);
}

async function saveWaiverForBooking(booking: BookingRecord) {
  await supabaseRequest<WaiverRow[]>("waivers", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify({
      booking_id: booking.id,
      parent_name: booking.parentName,
      player_name: booking.playerName,
      typed_signature: booking.guardianSignature,
      waiver_signed: booking.waiverAccepted,
      signed_at: booking.waiverAcceptedAt || new Date().toISOString(),
      media_consent: booking.mediaConsent,
      emergency_medical_notes: booking.medicalNotes || null,
      ip_address: booking.ipAddress || null
    })
  });
}

export async function redeemLaunchPassCreditAndSaveWaiver(rawBooking: BookingRecord, passPurchaseId: string, ipAddress = "") {
  const session = await getSessionOrThrow(rawBooking.sessionId);
  const redeemed = await supabaseRequest<Array<{ booking_id: string; credit_redemption_id: string; remaining_credits: number }>>(
    "rpc/redeem_launch_pass_credit",
    {
      method: "POST",
      body: JSON.stringify({
        p_pass_purchase_id: passPurchaseId,
        p_session_id: rawBooking.sessionId,
        p_parent_name: rawBooking.parentName,
        p_parent_email: rawBooking.email,
        p_parent_phone: rawBooking.phone,
        p_player_name: rawBooking.playerName,
        p_player_age: rawBooking.playerAge,
        p_training_group: session.training_group,
        p_notes: rawBooking.notes || "",
        p_medical_notes: rawBooking.medicalNotes || "",
        p_emergency_name: rawBooking.emergencyName || "",
        p_emergency_phone: rawBooking.emergencyPhone || ""
      })
    }
  );
  const redemption = redeemed[0];

  if (!redemption) {
    throw new Error("Training credit could not be redeemed.");
  }

  const rows = await supabaseRequest<BookingRow[]>(
    `bookings?select=*&id=eq.${encodeFilter(redemption.booking_id)}&limit=1`
  );
  const bookingRow = rows[0];

  if (!bookingRow) {
    throw new Error("Training Package booking could not be loaded after redemption.");
  }

  const booking: BookingRecord = {
    ...toBookingRecordFromRows({
      booking: bookingRow,
      session,
      remainingCreditsAfter: redemption.remaining_credits
    }),
    guardianSignature: rawBooking.guardianSignature,
    waiverAccepted: rawBooking.waiverAccepted,
    waiverAcceptedAt: rawBooking.waiverAcceptedAt || new Date().toISOString(),
    waiverVersion: rawBooking.waiverVersion,
    ipAddress: ipAddress || rawBooking.ipAddress,
    mediaConsent: rawBooking.mediaConsent,
    medicalNotes: rawBooking.medicalNotes,
    paymentType: "launch_pass_credit",
    passPurchaseId,
    creditRedemptionId: redemption.credit_redemption_id,
    remainingCreditsAfter: redemption.remaining_credits
  };

  await saveWaiverForBooking(booking);

  return booking;
}

export async function attachStripeCheckoutSession(bookingId: string, checkoutSessionId: string) {
  await supabaseRequest<BookingRow[]>(`bookings?id=eq.${encodeFilter(bookingId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      stripe_checkout_session_id: checkoutSessionId
    })
  });
}

export async function markBookingPaidAndSaveWaiver(
  booking: BookingRecord,
  payment: {
    checkoutSessionId?: string;
    paymentIntentId?: string;
    amountPaid?: number;
  }
) {
  try {
    await supabaseRequest<BookingRow[]>("rpc/confirm_paid_booking", {
      method: "POST",
      body: JSON.stringify({
        p_booking_id: booking.id,
        p_stripe_checkout_session_id: payment.checkoutSessionId || null,
        p_stripe_payment_intent_id: payment.paymentIntentId || null,
        p_amount_paid: payment.amountPaid ?? Number(booking.players || 1) * sessionUnitAmountCents
      })
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("confirm_paid_booking") || message.includes("schema cache")) {
      console.error("[EST Supabase] confirm_paid_booking RPC failed", {
        bookingId: booking.id,
        error: message,
        fix: "Run supabase/fix-confirm-paid-booking.sql in Supabase SQL Editor, then resend the Stripe webhook event."
      });
    }

    throw error;
  }

  await saveWaiverForBooking(booking);
}

export async function saveCalendarEventRecord(bookingId: string, googleCalendarEventId?: string) {
  if (!googleCalendarEventId) {
    return;
  }

  await supabaseRequest<CalendarEventRow[]>("calendar_events", {
    method: "POST",
    headers: {
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify({
      booking_id: bookingId,
      google_calendar_event_id: googleCalendarEventId
    })
  });
}

export async function saveBookingCalendarSyncStatus(input: {
  bookingId: string;
  status: string;
  message?: string;
  eventId?: string;
}) {
  await supabaseRequest<BookingRow[]>(`bookings?id=eq.${encodeFilter(input.bookingId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      calendar_sync_status: input.status,
      calendar_sync_message: input.message || null,
      calendar_synced_at: new Date().toISOString()
    })
  });

  if (input.eventId) {
    await saveCalendarEventRecord(input.bookingId, input.eventId);
  }
}

export async function listEmailLogsForBooking(bookingId: string) {
  return supabaseRequest<EmailLogRow[]>(
    `email_logs?select=*&booking_id=eq.${encodeFilter(bookingId)}&order=created_at.desc`
  ).catch(() => []);
}

export async function getBookingEmailDeliverySummary(bookingId: string) {
  const logs = await listEmailLogsForBooking(bookingId);

  return {
    logs,
    customerSent: logs.some((log) => log.email_type === "customer" && log.status === "sent"),
    adminSent: logs.some((log) => log.email_type === "admin" && log.status === "sent")
  };
}

export async function logEmailStatus(input: {
  bookingId: string;
  emailType: "customer" | "admin";
  recipient: string;
  status: "sent" | "failed";
  errorMessage?: string;
}) {
  await supabaseRequest<EmailLogRow[]>("email_logs", {
    method: "POST",
    body: JSON.stringify({
      booking_id: input.bookingId,
      email_type: input.emailType,
      recipient: input.recipient,
      status: input.status,
      error_message: input.errorMessage || null
    })
  });
}

export async function listAdminAlertLogsForDedupeKey(dedupeKey: string) {
  if (!dedupeKey) {
    return [];
  }

  return supabaseRequest<AdminAlertLogRow[]>(
    `admin_alert_logs?select=*&dedupe_key=eq.${encodeFilter(dedupeKey)}&order=created_at.desc`
  ).catch(() => []);
}

export async function hasSentAdminAlert(dedupeKey: string) {
  const logs = await listAdminAlertLogsForDedupeKey(dedupeKey);

  return logs.some((log) => log.status === "sent");
}

export async function listRecentAdminAlertLogs(limit = 10) {
  return supabaseRequest<AdminAlertLogRow[]>(
    `admin_alert_logs?select=*&order=created_at.desc&limit=${Math.max(1, Math.min(50, limit))}`
  ).catch(() => []);
}

export async function logAdminAlertStatus(input: {
  bookingId?: string;
  source: string;
  sourceId?: string;
  dedupeKey: string;
  recipient?: string;
  status: "sent" | "failed" | "skipped";
  title: string;
  message: string;
  errorMessage?: string;
}) {
  try {
    const rows = await supabaseRequest<AdminAlertLogRow[]>("admin_alert_logs", {
      method: "POST",
      body: JSON.stringify({
        booking_id: input.bookingId || null,
        source: input.source,
        source_id: input.sourceId || null,
        dedupe_key: input.dedupeKey,
        recipient: input.recipient || "pushover",
        status: input.status,
        title: input.title,
        message: input.message,
        error_message: input.errorMessage || null
      })
    });

    return rows[0] ?? null;
  } catch (error) {
    console.warn("[EST Pushover] Admin alert log could not be saved", {
      source: input.source,
      sourceId: input.sourceId,
      bookingId: input.bookingId,
      status: input.status,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

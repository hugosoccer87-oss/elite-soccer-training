import {
  getTrainingGroup,
  slotCapacity,
  type BookingRecord,
  type CalendarSyncStatus,
  type TrainingGroupId
} from "@/lib/booking-data";
import { sessionUnitAmountCents } from "@/lib/pricing";
import {
  getLaunchPassOption,
  launchPassExpirationDate,
  type LaunchPassType
} from "@/lib/pricing";
import { business } from "@/lib/site-data";
import type { PublicAvailableSession, PublicAvailabilityDebugResponse, PublicAvailabilityResponse } from "@/lib/public-availability";

type SupabaseConfig = {
  url: string;
  serviceRoleKey: string;
};

export type TrainingSessionRow = {
  id: string;
  training_group: TrainingGroupId;
  title: string;
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
  created_at: string;
  updated_at: string;
};

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

export type AdminPassPurchase = PassPurchaseRow & {
  redemptions: Array<CreditRedemptionRow & { booking?: BookingRow | null }>;
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

export type AdminBookingRecord = BookingRow & {
  waiver?: WaiverRow | null;
  calendarEvent?: CalendarEventRow | null;
  emailLogs: EmailLogRow[];
  passPurchase?: PassPurchaseRow | null;
  creditRedemption?: CreditRedemptionRow | null;
};

export type AdminTrainingSession = TrainingSessionRow & {
  paidPlayers: number;
  remainingSpots: number;
  paidBookings: AdminBookingRecord[];
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
    capacity: session.capacity,
    bookedCount: paidPlayers,
    remainingSpots: Math.max(0, session.capacity - paidPlayers),
    location: session.location || business.location,
    duration: "60 min"
  };
}

export async function listTrainingSessions() {
  return supabaseRequest<TrainingSessionRow[]>("training_sessions?select=*&order=start_datetime.asc");
}

async function listPaidBookings() {
  return supabaseRequest<BookingRow[]>("bookings?select=*&status=eq.paid");
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
    programName: publicSession.trainingGroup,
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
  const counts = paidPlayerCounts(paidBookings);
  const publicSessions = sessions
    .map((session) => toPublicSession(session, counts[session.id] ?? 0))
    .filter((session) => session.remainingSpots > 0);

  return {
    status: "Synced" as CalendarSyncStatus,
    sessions: publicSessions,
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
  capacity?: number;
  location?: string;
  status?: "open" | "closed" | "cancelled";
}) {
  const group = getTrainingGroup(input.trainingGroup);
  const start = zonedDateTimeToUtc(input.date, input.time, defaultTimeZone);
  const end = new Date(start.getTime() + 60 * 60_000);

  return supabaseRequest<TrainingSessionRow[]>("training_sessions", {
    method: "POST",
    body: JSON.stringify({
      training_group: input.trainingGroup,
      title: group.name,
      start_datetime: start.toISOString(),
      end_datetime: end.toISOString(),
      timezone: defaultTimeZone,
      location: input.location || business.location,
      capacity: Math.min(slotCapacity, Math.max(1, Number(input.capacity) || slotCapacity)),
      status: input.status || "open"
    })
  });
}

export async function updateTrainingSession(
  id: string,
  updates: Partial<Pick<TrainingSessionRow, "capacity" | "location" | "status" | "title">>
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
  const [bookings, waivers, calendarEvents, emailLogs, passPurchases, redemptions] = await Promise.all([
    supabaseRequest<BookingRow[]>("bookings?select=*&order=created_at.desc"),
    supabaseRequest<WaiverRow[]>("waivers?select=*"),
    supabaseRequest<CalendarEventRow[]>("calendar_events?select=*"),
    supabaseRequest<EmailLogRow[]>("email_logs?select=*&order=created_at.desc"),
    supabaseRequest<PassPurchaseRow[]>("pass_purchases?select=*&order=created_at.desc").catch(() => []),
    supabaseRequest<CreditRedemptionRow[]>("credit_redemptions?select=*&order=created_at.desc").catch(() => [])
  ]);
  const waiverMap = new Map(waivers.map((waiver) => [waiver.booking_id, waiver]));
  const calendarMap = new Map(calendarEvents.map((event) => [event.booking_id, event]));
  const passMap = new Map(passPurchases.map((pass) => [pass.id, pass]));
  const redemptionMap = new Map(redemptions.map((redemption) => [redemption.booking_id, redemption]));

  return bookings.map((booking) => ({
    ...booking,
    waiver: waiverMap.get(booking.id) ?? null,
    calendarEvent: calendarMap.get(booking.id) ?? null,
    emailLogs: emailLogs.filter((log) => log.booking_id === booking.id),
    passPurchase: booking.pass_purchase_id ? passMap.get(booking.pass_purchase_id) ?? null : null,
    creditRedemption: redemptionMap.get(booking.id) ?? null
  }));
}

export async function listAdminPassPurchases(): Promise<AdminPassPurchase[]> {
  const [passes, redemptions, bookings] = await Promise.all([
    supabaseRequest<PassPurchaseRow[]>("pass_purchases?select=*&order=created_at.desc").catch(() => []),
    supabaseRequest<CreditRedemptionRow[]>("credit_redemptions?select=*&order=created_at.desc").catch(() => []),
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
      }))
  }));
}

export async function listAdminTrainingSessions(): Promise<AdminTrainingSession[]> {
  const [sessions, bookings] = await Promise.all([listTrainingSessions(), listAdminBookings()]);

  return sessions.map((session) => {
    const paidBookings = bookings.filter((booking) => booking.session_id === session.id && booking.status === "paid");
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

  return {
    booking: {
      ...rawBooking,
      id: bookingRow.id,
      createdAt: bookingRow.created_at,
      players: String(playerCount),
      ipAddress,
      programId: session.training_group,
      programName: publicSession.trainingGroup,
      sessionId: session.id,
      sessionDateIso: publicSession.date,
      sessionDate: publicSession.dateLabel,
      sessionTime: publicSession.startTime,
      sessionDurationMinutes: 60,
      sessionCalendarEventId: undefined,
      paymentStatus: "pending_payment",
      notificationStatus: "Ready",
      calendarStatus: "Ready"
    } satisfies BookingRecord,
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
    throw new Error("Launch Pass purchase could not be saved before payment.");
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
    throw new Error("Launch Pass payment could not be confirmed.");
  }

  return pass;
}

export async function getPassPurchaseById(passPurchaseId: string) {
  const rows = await supabaseRequest<PassPurchaseRow[]>(
    `pass_purchases?select=*&id=eq.${encodeFilter(passPurchaseId)}&limit=1`
  ).catch(() => []);

  return rows[0] ?? null;
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
      `expires_at=gte.${encodeFilter(new Date().toISOString())}`,
      "order=expires_at.asc"
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
    throw new Error("Launch Pass credit could not be redeemed.");
  }

  const rows = await supabaseRequest<BookingRow[]>(
    `bookings?select=*&id=eq.${encodeFilter(redemption.booking_id)}&limit=1`
  );
  const bookingRow = rows[0];

  if (!bookingRow) {
    throw new Error("Launch Pass booking could not be loaded after redemption.");
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

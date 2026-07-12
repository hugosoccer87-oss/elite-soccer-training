import {
  getRemainingSpots,
  getTrainingGroup,
  slotCapacity,
  trainingGroups,
  type BookingRecord,
  type CalendarSyncStatus,
  type SlotStatus,
  type TrainingGroupId,
  type TrainingSlot
} from "@/lib/booking-data";
import { formatCurrencyFromCents, getSessionTotalCents, sessionPriceLabel } from "@/lib/pricing";
import { getSessionFocusLabel } from "@/lib/session-focus";
import { business } from "@/lib/site-data";
import type { PrivateSessionAvailabilityRow, PrivateSessionRequestRow, TrainingSessionRow } from "@/lib/supabase-db";
import { createSign } from "node:crypto";

const googleAuthEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";
const googleTokenEndpoint = "https://oauth2.googleapis.com/token";
const googleCalendarEndpoint = "https://www.googleapis.com/calendar/v3";
const calendarTimeZone = process.env.GOOGLE_CALENDAR_TIME_ZONE ?? "America/Los_Angeles";
const fallbackCalendarId = "primary";
const calendarId = getCalendarId();

type GoogleCalendarEvent = {
  id?: string;
  etag?: string;
  htmlLink?: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  extendedProperties?: {
    private?: Record<string, string>;
  };
};

type GoogleCalendarListResponse = {
  items?: GoogleCalendarEvent[];
};

type LastCalendarEventCreationResult = {
  checkedAt: string;
  bookingId?: string;
  status: CalendarSyncStatus;
  calendarId: string;
  eventId?: string;
  message?: string;
};

export type CalendarBookingResult = {
  status: CalendarSyncStatus;
  eventId?: string;
  eventUrl?: string;
  message?: string;
  alreadyExists?: boolean;
};

export type CalendarAvailabilityResult = {
  status: CalendarSyncStatus;
  slot?: TrainingSlot;
  slots?: TrainingSlot[];
  eventId?: string;
  message?: string;
};

export type CalendarBookingsResult = {
  status: CalendarSyncStatus;
  bookings: BookingRecord[];
  message?: string;
};

const calendarDiagnosticsStore =
  (globalThis as typeof globalThis & {
    __estCalendarDiagnostics?: {
      lastCalendarEventCreationResult: LastCalendarEventCreationResult | null;
    };
  }).__estCalendarDiagnostics ?? {
    lastCalendarEventCreationResult: null
  };

(globalThis as typeof globalThis & {
  __estCalendarDiagnostics?: {
    lastCalendarEventCreationResult: LastCalendarEventCreationResult | null;
  };
}).__estCalendarDiagnostics = calendarDiagnosticsStore;

function getCalendarId() {
  return process.env.GOOGLE_CALENDAR_ID?.trim() || fallbackCalendarId;
}

function getGoogleServiceAccountEmail() {
  return (
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
    process.env.GOOGLE_CLIENT_EMAIL ||
    process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL ||
    ""
  ).trim();
}

function getGooglePrivateKey() {
  return (
    process.env.GOOGLE_PRIVATE_KEY ||
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ||
    process.env.GOOGLE_CLIENT_PRIVATE_KEY ||
    ""
  )
    .replace(/\\n/g, "\n")
    .trim();
}

function getGoogleAuthMode() {
  const { clientId, clientSecret, refreshToken } = getGoogleClientConfig();
  const serviceAccountEmail = getGoogleServiceAccountEmail();
  const privateKey = getGooglePrivateKey();

  if (serviceAccountEmail && privateKey) {
    return "service_account";
  }

  if (clientId && clientSecret && refreshToken) {
    return "oauth_refresh_token";
  }

  return "not_configured";
}

function setLastCalendarEventCreationResult(result: Omit<LastCalendarEventCreationResult, "checkedAt">) {
  calendarDiagnosticsStore.lastCalendarEventCreationResult = {
    checkedAt: new Date().toISOString(),
    ...result
  };
}

export function recordCalendarEventCreationFailure(bookingId: string, message: string) {
  setLastCalendarEventCreationResult({
    bookingId,
    status: "Failed",
    calendarId,
    message
  });
}

export function getGoogleCalendarDiagnostics() {
  const { clientId, clientSecret, refreshToken } = getGoogleClientConfig();
  const privateKey = getGooglePrivateKey();

  return {
    googleCalendarConfigured: isGoogleCalendarConfigured(),
    googleCalendarId: getCalendarId(),
    googleServiceAccountEmail: getGoogleServiceAccountEmail(),
    googleAuthMode: getGoogleAuthMode(),
    hasGoogleClientId: Boolean(clientId),
    hasGoogleClientSecret: Boolean(clientSecret),
    hasGoogleRefreshToken: Boolean(refreshToken),
    hasGooglePrivateKey: Boolean(privateKey),
    lastCalendarEventCreationResult: calendarDiagnosticsStore.lastCalendarEventCreationResult
  };
}

function getGoogleClientConfig() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN
  };
}

function logCalendarInfo(message: string, details?: Record<string, unknown>) {
  console.info(`[EST Google Calendar] ${message}`, details ?? {});
}

function logCalendarError(message: string, details?: Record<string, unknown>) {
  console.error(`[EST Google Calendar] ${message}`, details ?? {});
}

function getCalendarEnvDiagnostics() {
  const { clientId, clientSecret, refreshToken } = getGoogleClientConfig();

  return {
    googleAuthMode: getGoogleAuthMode(),
    hasGoogleClientId: Boolean(clientId),
    hasGoogleClientSecret: Boolean(clientSecret),
    hasGoogleRefreshToken: Boolean(refreshToken),
    hasGooglePrivateKey: Boolean(getGooglePrivateKey()),
    calendarId: getCalendarId(),
    googleServiceAccountEmail: getGoogleServiceAccountEmail(),
    calendarTimeZone
  };
}

function isGoogleCalendarConfigured() {
  return getGoogleAuthMode() !== "not_configured";
}

async function googleErrorMessage(response: Response, context: string) {
  const body = await response.text().catch(() => "");

  logCalendarError(context, {
    status: response.status,
    statusText: response.statusText,
    body: body.slice(0, 1000)
  });

  return `${context}. Google returned ${response.status} ${response.statusText}. Check Vercel server logs for [EST Google Calendar].`;
}

export function getGoogleRedirectUri(request: Request) {
  if (process.env.GOOGLE_REDIRECT_URI) {
    return process.env.GOOGLE_REDIRECT_URI;
  }

  return `${new URL(request.url).origin}/api/google-calendar/callback`;
}

export function getGoogleCalendarAuthUrl(request: Request) {
  const { clientId } = getGoogleClientConfig();

  if (!clientId) {
    return null;
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getGoogleRedirectUri(request),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.freebusy"
    ].join(" ")
  });

  return `${googleAuthEndpoint}?${params.toString()}`;
}

export async function exchangeGoogleCodeForTokens(code: string, request: Request) {
  const { clientId, clientSecret } = getGoogleClientConfig();

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth client is not configured.");
  }

  const response = await fetch(googleTokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getGoogleRedirectUri(request),
      grant_type: "authorization_code"
    })
  });

  if (!response.ok) {
    const message = await googleErrorMessage(response, "Google OAuth token exchange failed");
    throw new Error(message);
  }

  return (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
  };
}

async function getGoogleAccessToken() {
  const { clientId, clientSecret, refreshToken } = getGoogleClientConfig();
  const authMode = getGoogleAuthMode();

  if (authMode === "service_account") {
    logCalendarInfo("Requesting Google service account access token", getCalendarEnvDiagnostics());
    return getServiceAccountAccessToken();
  }

  if (!clientId || !clientSecret || !refreshToken) {
    logCalendarError("Google Calendar environment variables are missing", getCalendarEnvDiagnostics());
    return {
      accessToken: null,
      error:
        "Google Calendar is not configured. Add either GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY, or GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN in Vercel."
    };
  }

  logCalendarInfo("Requesting Google access token", getCalendarEnvDiagnostics());

  const response = await fetch(googleTokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });

  if (!response.ok) {
    const message = await googleErrorMessage(response, "Google access token refresh failed");
    return {
      accessToken: null,
      error: message
    };
  }

  const token = (await response.json()) as { access_token?: string };

  if (!token.access_token) {
    logCalendarError("Google token response did not include an access token");
    return {
      accessToken: null,
      error: "Google did not return an access token. Reconnect Google Calendar."
    };
  }

  return {
    accessToken: token.access_token,
    error: null
  };
}

function calendarHeaders(accessToken: string, extraHeaders?: Record<string, string>) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...extraHeaders
  };
}

function base64UrlJson(value: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function createServiceAccountAssertion() {
  const serviceAccountEmail = getGoogleServiceAccountEmail();
  const privateKey = getGooglePrivateKey();
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({
    alg: "RS256",
    typ: "JWT"
  });
  const claim = base64UrlJson({
    iss: serviceAccountEmail,
    scope: "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy",
    aud: googleTokenEndpoint,
    iat: now,
    exp: now + 3600
  });
  const unsigned = `${header}.${claim}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(privateKey).toString("base64url");

  return `${unsigned}.${signature}`;
}

async function getServiceAccountAccessToken() {
  const serviceAccountEmail = getGoogleServiceAccountEmail();
  const privateKey = getGooglePrivateKey();

  if (!serviceAccountEmail || !privateKey) {
    return {
      accessToken: null,
      error: "Google Calendar service account is not configured. Add GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY in Vercel."
    };
  }

  let assertion = "";

  try {
    assertion = createServiceAccountAssertion();
  } catch (error) {
    logCalendarError("Google service account JWT could not be signed", {
      googleServiceAccountEmail: serviceAccountEmail,
      error: error instanceof Error ? error.message : String(error)
    });

    return {
      accessToken: null,
      error: "Google service account private key could not be used. Check GOOGLE_PRIVATE_KEY formatting."
    };
  }

  const response = await fetch(googleTokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });

  if (!response.ok) {
    const message = await googleErrorMessage(response, "Google service account token request failed");
    return {
      accessToken: null,
      error: message
    };
  }

  const token = (await response.json()) as { access_token?: string };

  if (!token.access_token) {
    logCalendarError("Google service account token response did not include an access token", {
      googleServiceAccountEmail: serviceAccountEmail
    });
    return {
      accessToken: null,
      error: "Google service account did not return an access token."
    };
  }

  return {
    accessToken: token.access_token,
    error: null
  };
}

function parseDisplayTime(time: string) {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

  if (!match) {
    return { hour: 17, minute: 0 };
  }

  const period = match[3].toUpperCase();
  let hour = Number(match[1]);
  const minute = Number(match[2]);

  if (period === "PM" && hour !== 12) {
    hour += 12;
  }

  if (period === "AM" && hour === 12) {
    hour = 0;
  }

  return { hour, minute };
}

function formatLocalDateTime(dateIso: string, totalMinutes: number) {
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${dateIso}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

function getCalendarDateRange(dateIso: string, time: string, durationMinutes = 60) {
  const { hour, minute } = parseDisplayTime(time);
  const startMinutes = hour * 60 + minute;
  const endMinutes = startMinutes + durationMinutes;

  return {
    start: formatLocalDateTime(dateIso, startMinutes),
    end: formatLocalDateTime(dateIso, endMinutes)
  };
}

function resolveBookingDateIso(booking: BookingRecord) {
  if (booking.sessionDateIso) {
    return booking.sessionDateIso;
  }

  return booking.sessionId.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
}

function formatDateParts(dateIso: string) {
  const date = new Date(`${dateIso}T00:00:00`);

  return {
    dateLabel: date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
    dayLabel: date.toLocaleDateString("en-US", { weekday: "long" })
  };
}

function formatTimeFromDateTime(dateTime: string) {
  const timePart = dateTime.split("T")[1]?.slice(0, 5) ?? "17:00";
  const [hourValue, minuteValue] = timePart.split(":").map(Number);
  const suffix = hourValue >= 12 ? "PM" : "AM";
  const hour = hourValue % 12 || 12;

  return `${hour}:${String(minuteValue).padStart(2, "0")} ${suffix}`;
}

function getDurationMinutes(startDateTime?: string, endDateTime?: string) {
  if (!startDateTime || !endDateTime) {
    return 60;
  }

  const start = new Date(startDateTime).getTime();
  const end = new Date(endDateTime).getTime();
  const duration = Math.round((end - start) / 60000);

  return Number.isFinite(duration) && duration > 0 ? duration : 60;
}

function bookingDescription(booking: BookingRecord) {
  const paidWithLaunchPass = booking.paymentType === "launch_pass_credit";
  const paymentAmount = paidWithLaunchPass
    ? "Paid using Training credit"
    : `${booking.players} x ${sessionPriceLabel} = ${formatCurrencyFromCents(getSessionTotalCents(booking.players))}`;

  return [
    `Parent/guardian name: ${booking.parentName}`,
    `Parent email: ${booking.email}`,
    `Parent phone: ${booking.phone}`,
    `Player name: ${booking.playerName}`,
    `Player age: ${booking.playerAge}`,
    `Training group: ${booking.programName}`,
    `Session date/time: ${booking.sessionDate} at ${booking.sessionTime}`,
    `Location: ${business.location}`,
    `Number of players: ${booking.players}`,
    `Payment status: ${paidWithLaunchPass ? "Paid using Training credit" : "Paid"}`,
    `Payment amount: ${paymentAmount}`,
    `Payment type: ${paidWithLaunchPass ? "Training credit" : "Single Session"}`,
    `Remaining Training credits: ${typeof booking.remainingCreditsAfter === "number" ? booking.remainingCreditsAfter : "Not applicable"}`,
    `Waiver status: ${booking.waiverAccepted ? "Signed" : "Not recorded"}`,
    `Typed waiver signature: ${booking.guardianSignature || "Not recorded"}`,
    `Waiver signed date/time: ${booking.waiverAcceptedAt || "Not recorded"}`,
    `Waiver version: ${booking.waiverVersion || "Not recorded"}`,
    `Media consent: ${booking.mediaConsent || "Not recorded"}`,
    `Notes: ${booking.notes || "None"}`,
    `Medical notes/injuries: ${booking.medicalNotes || "None"}`,
    `Emergency contact: ${booking.emergencyName} - ${booking.emergencyPhone}`,
    `IP address: ${booking.ipAddress || "Not collected"}`,
    `Reminder: Please arrive 15 minutes early and bring plenty of water.`,
    `Booking ID: ${booking.id}`
  ].join("\n");
}

function descriptionRows(description = "") {
  return description.split("\n").reduce<Record<string, string>>((current, line) => {
    const separatorIndex = line.indexOf(":");

    if (separatorIndex === -1) {
      return current;
    }

    const label = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (label) {
      current[label] = value;
    }

    return current;
  }, {});
}

function splitEmergencyContact(value = "") {
  const [name, ...phoneParts] = value.split(" - ");

  return {
    emergencyName: name?.trim() || "",
    emergencyPhone: phoneParts.join(" - ").trim()
  };
}

function splitSessionDateTime(value = "") {
  const [date, ...timeParts] = value.split(" at ");

  return {
    sessionDate: date?.trim() || "",
    sessionTime: timeParts.join(" at ").trim()
  };
}

function eventToBookingRecord(event: GoogleCalendarEvent): BookingRecord | null {
  const properties = event.extendedProperties?.private ?? {};

  if (!event.id || properties.estType !== "booking") {
    return null;
  }

  const rows = descriptionRows(event.description);
  const emergency = splitEmergencyContact(rows["Emergency contact"]);
  const session = splitSessionDateTime(rows["Session date/time"]);
  const programId = trainingGroups.some((group) => group.id === properties.programId)
    ? (properties.programId as TrainingGroupId)
    : "future-elite";

  return {
    id: properties.estBookingId || rows["Booking ID"] || event.id,
    createdAt: "",
    parentName: rows["Parent/guardian name"] || "",
    playerName: rows["Player name"] || event.summary?.replace("Elite Soccer Training CV - Paid Booking:", "").trim() || "",
    playerAge: rows["Player age"] || "",
    phone: rows["Parent phone"] || "",
    email: rows["Parent email"] || "",
    players: rows["Number of players"] || "1",
    notes: rows["Notes"] === "None" ? "" : rows["Notes"] || "",
    medicalNotes: rows["Medical notes/injuries"] === "None" ? "" : rows["Medical notes/injuries"] || "",
    emergencyName: emergency.emergencyName,
    emergencyPhone: emergency.emergencyPhone,
    guardianSignature: rows["Typed waiver signature"] === "Not recorded" ? "" : rows["Typed waiver signature"] || "",
    waiverAccepted: rows["Waiver status"] === "Signed",
    waiverAcceptedAt: rows["Waiver signed date/time"] === "Not recorded" ? "" : rows["Waiver signed date/time"] || "",
    waiverVersion: rows["Waiver version"] === "Not recorded" ? "" : rows["Waiver version"] || "",
    ipAddress: rows["IP address"] === "Not collected" ? "" : rows["IP address"] || "",
    mediaConsent: rows["Media consent"] === "Declined" ? "Declined" : "Granted",
    programId,
    programName: rows["Training group"] || getTrainingGroup(programId).name,
    sessionId: properties.estSessionId || "",
    sessionDateIso: event.start?.dateTime?.slice(0, 10) || "",
    sessionDate: session.sessionDate,
    sessionTime: session.sessionTime,
    sessionDurationMinutes: getDurationMinutes(event.start?.dateTime, event.end?.dateTime),
    sessionCalendarEventId: properties.estAvailabilityEventId || undefined,
    paymentStatus: "Paid",
    notificationStatus: "Sent",
    calendarStatus: "Created",
    calendarEventId: event.id,
    calendarEventUrl: event.htmlLink
  };
}

async function findExistingBookingEvent(bookingId: string, accessToken: string) {
  const params = new URLSearchParams({
    maxResults: "1",
    singleEvents: "true",
    privateExtendedProperty: `estBookingId=${bookingId}`
  });
  const response = await fetch(
    `${googleCalendarEndpoint}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
    {
      headers: calendarHeaders(accessToken)
    }
  );

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as GoogleCalendarListResponse;
  return data.items?.[0] ?? null;
}

async function findExistingTrainingSessionEvent(sessionId: string, accessToken: string) {
  const params = new URLSearchParams({
    maxResults: "1",
    singleEvents: "true",
    privateExtendedProperty: `estSessionId=${sessionId}`
  });
  const response = await fetch(
    `${googleCalendarEndpoint}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
    {
      headers: calendarHeaders(accessToken)
    }
  );

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as GoogleCalendarListResponse;
  return data.items?.[0] ?? null;
}

async function findExistingPrivateSessionEvent(requestId: string, accessToken: string) {
  const params = new URLSearchParams({
    maxResults: "1",
    singleEvents: "true",
    privateExtendedProperty: `estPrivateSessionRequestId=${requestId}`
  });
  const response = await fetch(
    `${googleCalendarEndpoint}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
    {
      headers: calendarHeaders(accessToken)
    }
  );

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as GoogleCalendarListResponse;
  return data.items?.[0] ?? null;
}

async function findExistingPrivateAvailabilityEvent(privateSessionId: string, accessToken: string) {
  const params = new URLSearchParams({
    maxResults: "1",
    singleEvents: "true",
    privateExtendedProperty: `estPrivateSessionAvailabilityId=${privateSessionId}`
  });
  const response = await fetch(
    `${googleCalendarEndpoint}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
    {
      headers: calendarHeaders(accessToken)
    }
  );

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as GoogleCalendarListResponse;
  return data.items?.[0] ?? null;
}

function trainingSessionDescription(session: TrainingSessionRow) {
  const group = getTrainingGroup(session.training_group);
  const focus = getSessionFocusLabel(session.training_focus);

  return [
    `Session focus: ${focus}`,
    `Training group: ${group.name} (${group.ages})`,
    `Status: ${session.status}`,
    `Capacity: ${session.capacity}`,
    `Location: ${session.location || business.location}`,
    `Session ID: ${session.id}`,
    "",
    "Admin note: Supabase is the source of truth for EST CV availability and bookings."
  ].join("\n");
}

function trainingSessionEventPayload(session: TrainingSessionRow) {
  const group = getTrainingGroup(session.training_group);
  const focus = getSessionFocusLabel(session.training_focus);
  const cancelled = session.status === "cancelled";
  const closed = session.status === "closed";

  return {
    summary: `${cancelled ? "[CANCELLED] " : closed ? "[CLOSED] " : ""}EST CV - ${focus}`,
    description: trainingSessionDescription(session),
    location: session.location || business.location,
    start: {
      dateTime: session.start_datetime,
      timeZone: session.timezone || calendarTimeZone
    },
    end: {
      dateTime: session.end_datetime,
      timeZone: session.timezone || calendarTimeZone
    },
    transparency: cancelled || closed ? "transparent" : "opaque",
    extendedProperties: {
      private: {
        estType: "training_session",
        estSessionId: session.id,
        groupId: session.training_group,
        groupName: group.name,
        trainingFocus: focus,
        capacity: String(session.capacity),
        status: session.status
      }
    }
  };
}

export async function syncTrainingSessionCalendarEvent(session: TrainingSessionRow): Promise<CalendarAvailabilityResult> {
  console.info("[EST Calendar] Starting calendar event creation", {
    sessionId: session.id,
    trainingGroup: session.training_group,
    status: session.status,
    start: session.start_datetime
  });
  console.info("[EST Calendar] Calendar ID:", calendarId);
  console.info("[EST Calendar] Service account email:", getGoogleServiceAccountEmail() || "not configured");

  if (!isGoogleCalendarConfigured()) {
    setLastCalendarEventCreationResult({
      status: "Google Calendar not configured",
      calendarId,
      message: "Session sync skipped because Google Calendar is not configured."
    });
    logCalendarError("Session sync skipped because Google Calendar is not configured", {
      ...getCalendarEnvDiagnostics(),
      sessionId: session.id
    });
    console.error("[EST Calendar] Calendar event creation failed", {
      sessionId: session.id,
      reason: "Google Calendar credentials are missing"
    });
    return {
      status: "Google Calendar not configured",
      message: "Google Calendar is not configured."
    };
  }

  const token = await getGoogleAccessToken();

  if (!token.accessToken) {
    setLastCalendarEventCreationResult({
      status: "Failed",
      calendarId,
      message: token.error ?? "Could not connect to Google Calendar."
    });
    console.error("[EST Calendar] Calendar event creation failed", {
      sessionId: session.id,
      reason: token.error ?? "Could not connect to Google Calendar."
    });
    return { status: "Failed", message: token.error ?? "Could not connect to Google Calendar." };
  }

  const existingEvent = await findExistingTrainingSessionEvent(session.id, token.accessToken);
  const payload = trainingSessionEventPayload(session);
  const response = await fetch(
    existingEvent?.id
      ? `${googleCalendarEndpoint}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existingEvent.id)}`
      : `${googleCalendarEndpoint}/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: existingEvent?.id ? "PATCH" : "POST",
      headers: calendarHeaders(token.accessToken, existingEvent?.etag ? { "If-Match": existingEvent.etag } : undefined),
      body: JSON.stringify(payload)
    }
  );

  if (!response.ok) {
    const message = await googleErrorMessage(response, "Could not sync the Google Calendar session event");
    setLastCalendarEventCreationResult({
      status: "Failed",
      calendarId,
      message
    });
    console.error("[EST Calendar] Calendar event creation failed", {
      sessionId: session.id,
      reason: message
    });
    return { status: "Failed", message };
  }

  const event = (await response.json()) as GoogleCalendarEvent;
  setLastCalendarEventCreationResult({
    status: "Synced",
    calendarId,
    eventId: event.id,
    message: "Session calendar event synced successfully."
  });
  logCalendarInfo("Google Calendar session event synced", {
    sessionId: session.id,
    eventId: event.id,
    updated: Boolean(existingEvent?.id)
  });
  console.info("[EST Calendar] Calendar event created successfully", {
    sessionId: session.id,
    eventId: event.id,
    updatedExistingEvent: Boolean(existingEvent?.id)
  });

  return { status: "Synced", eventId: event.id };
}

function privateSessionDescription(request: PrivateSessionRequestRow) {
  return [
    `Session type: Private 1-on-1`,
    `Player name: ${request.player_name}`,
    `Player age: ${request.player_age}`,
    `Parent/guardian name: ${request.parent_name}`,
    `Parent email: ${request.parent_email}`,
    `Parent phone: ${request.parent_phone}`,
    `Preferred dates/times: ${request.preferred_times}`,
    `Focus areas: ${request.focus_areas.length > 0 ? request.focus_areas.join(", ") : "Not recorded"}`,
    `Notes: ${request.notes || "None"}`,
    `Status: ${request.status}`,
    `Location: ${request.location || business.location}`,
    `Request ID: ${request.id}`,
    "",
    "Admin note: This private session request does not count toward small group capacity."
  ].join("\n");
}

export async function syncPrivateSessionCalendarEvent(request: PrivateSessionRequestRow): Promise<CalendarBookingResult> {
  console.info("[EST Calendar] Starting private session calendar event sync", {
    requestId: request.id,
    playerName: request.player_name,
    status: request.status,
    start: request.scheduled_start
  });
  console.info("[EST Calendar] Calendar ID:", calendarId);
  console.info("[EST Calendar] Service account email:", getGoogleServiceAccountEmail() || "not configured");

  if (!request.scheduled_start || !request.scheduled_end) {
    return {
      status: "Ready",
      message: "Private session has not been scheduled yet."
    };
  }

  if (!isGoogleCalendarConfigured()) {
    setLastCalendarEventCreationResult({
      bookingId: request.id,
      status: "Google Calendar not configured",
      calendarId,
      message: "Private session sync skipped because Google Calendar is not configured."
    });
    return {
      status: "Google Calendar not configured",
      message: "Google Calendar is not configured."
    };
  }

  const token = await getGoogleAccessToken();

  if (!token.accessToken) {
    setLastCalendarEventCreationResult({
      bookingId: request.id,
      status: "Failed",
      calendarId,
      message: token.error ?? "Could not connect to Google Calendar."
    });
    return { status: "Failed", message: token.error ?? "Could not connect to Google Calendar." };
  }

  const existingEvent = request.google_calendar_event_id
    ? ({ id: request.google_calendar_event_id } as GoogleCalendarEvent)
    : await findExistingPrivateSessionEvent(request.id, token.accessToken);
  const payload = {
    summary: `EST CV - Private 1-on-1: ${request.player_name}`,
    description: privateSessionDescription(request),
    location: request.location || business.location,
    start: {
      dateTime: request.scheduled_start,
      timeZone: request.timezone || calendarTimeZone
    },
    end: {
      dateTime: request.scheduled_end,
      timeZone: request.timezone || calendarTimeZone
    },
    extendedProperties: {
      private: {
        estType: "private_session",
        estPrivateSessionRequestId: request.id,
        playerName: request.player_name,
        parentEmail: request.parent_email,
        status: request.status
      }
    }
  };
  const response = await fetch(
    existingEvent?.id
      ? `${googleCalendarEndpoint}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existingEvent.id)}`
      : `${googleCalendarEndpoint}/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: existingEvent?.id ? "PATCH" : "POST",
      headers: calendarHeaders(token.accessToken, existingEvent?.etag ? { "If-Match": existingEvent.etag } : undefined),
      body: JSON.stringify(payload)
    }
  );

  if (!response.ok) {
    const message = await googleErrorMessage(response, "Could not sync private session to Google Calendar");
    setLastCalendarEventCreationResult({
      bookingId: request.id,
      status: "Failed",
      calendarId,
      message
    });
    console.error("[EST Calendar] Calendar event creation failed", {
      requestId: request.id,
      reason: message
    });
    return { status: "Failed", message };
  }

  const event = (await response.json()) as GoogleCalendarEvent;
  setLastCalendarEventCreationResult({
    bookingId: request.id,
    status: "Created",
    calendarId,
    eventId: event.id,
    message: existingEvent?.id ? "Private session calendar event updated." : "Private session calendar event created."
  });
  console.info("[EST Calendar] Calendar event created successfully", {
    requestId: request.id,
    eventId: event.id,
    eventUrl: event.htmlLink,
    updatedExistingEvent: Boolean(existingEvent?.id)
  });

  return {
    status: "Created",
    eventId: event.id,
    eventUrl: event.htmlLink,
    alreadyExists: Boolean(existingEvent?.id)
  };
}

function privateAvailabilityDescription(session: PrivateSessionAvailabilityRow) {
  return [
    "Session type: Private Session",
    `Session focus: ${session.session_focus || "Private Session"}`,
    `Player name: ${session.player_name || "Not booked"}`,
    `Player age: ${session.player_age || "Not recorded"}`,
    `Parent/guardian name: ${session.parent_name || "Not recorded"}`,
    `Parent email: ${session.parent_email || "Not recorded"}`,
    `Parent phone: ${session.parent_phone || "Not recorded"}`,
    `Payment status: ${session.status === "booked" ? "Paid" : "Not booked"}`,
    `Amount paid: ${formatCurrencyFromCents(session.amount_paid || 0)}`,
    `Status: ${session.status}`,
    `Notes: ${session.notes || "None"}`,
    `Location: ${session.location || business.location}`,
    `Private session availability ID: ${session.id}`,
    "",
    "Admin note: This private session does not count toward small group capacity."
  ].join("\n");
}

export async function syncBookedPrivateSessionCalendarEvent(
  session: PrivateSessionAvailabilityRow
): Promise<CalendarBookingResult> {
  console.info("[EST Calendar] Starting private session calendar event sync", {
    privateSessionId: session.id,
    playerName: session.player_name,
    status: session.status,
    start: session.start_datetime
  });
  console.info("[EST Calendar] Calendar ID:", calendarId);
  console.info("[EST Calendar] Service account email:", getGoogleServiceAccountEmail() || "not configured");

  if (!isGoogleCalendarConfigured()) {
    setLastCalendarEventCreationResult({
      bookingId: session.id,
      status: "Google Calendar not configured",
      calendarId,
      message: "Private session sync skipped because Google Calendar is not configured."
    });
    return {
      status: "Google Calendar not configured",
      message: "Google Calendar is not configured."
    };
  }

  const token = await getGoogleAccessToken();

  if (!token.accessToken) {
    setLastCalendarEventCreationResult({
      bookingId: session.id,
      status: "Failed",
      calendarId,
      message: token.error ?? "Could not connect to Google Calendar."
    });
    return { status: "Failed", message: token.error ?? "Could not connect to Google Calendar." };
  }

  const existingEvent = session.google_calendar_event_id
    ? ({ id: session.google_calendar_event_id } as GoogleCalendarEvent)
    : await findExistingPrivateAvailabilityEvent(session.id, token.accessToken);
  const cancelled = session.status === "cancelled";
  const closed = session.status === "closed";
  const bookedLabel = session.player_name ? `: ${session.player_name}` : " Available";
  const payload = {
    summary: `${cancelled ? "[CANCELLED] " : closed ? "[CLOSED] " : ""}EST CV - Private Session${bookedLabel}`,
    description: privateAvailabilityDescription(session),
    location: session.location || business.location,
    start: {
      dateTime: session.start_datetime,
      timeZone: session.timezone || calendarTimeZone
    },
    end: {
      dateTime: session.end_datetime,
      timeZone: session.timezone || calendarTimeZone
    },
    transparency: cancelled || closed ? "transparent" : "opaque",
    extendedProperties: {
      private: {
        estType: "private_session_availability",
        estPrivateSessionAvailabilityId: session.id,
        playerName: session.player_name || "",
        parentEmail: session.parent_email || "",
        status: session.status
      }
    }
  };
  const response = await fetch(
    existingEvent?.id
      ? `${googleCalendarEndpoint}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existingEvent.id)}`
      : `${googleCalendarEndpoint}/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: existingEvent?.id ? "PATCH" : "POST",
      headers: calendarHeaders(token.accessToken, existingEvent?.etag ? { "If-Match": existingEvent.etag } : undefined),
      body: JSON.stringify(payload)
    }
  );

  if (!response.ok) {
    const message = await googleErrorMessage(response, "Could not sync private session to Google Calendar");
    setLastCalendarEventCreationResult({
      bookingId: session.id,
      status: "Failed",
      calendarId,
      message
    });
    console.error("[EST Calendar] Calendar event creation failed", {
      privateSessionId: session.id,
      reason: message
    });
    return { status: "Failed", message };
  }

  const event = (await response.json()) as GoogleCalendarEvent;
  setLastCalendarEventCreationResult({
    bookingId: session.id,
    status: "Created",
    calendarId,
    eventId: event.id,
    message: existingEvent?.id ? "Private session calendar event updated." : "Private session calendar event created."
  });
  console.info("[EST Calendar] Calendar event created successfully", {
    privateSessionId: session.id,
    eventId: event.id,
    eventUrl: event.htmlLink,
    updatedExistingEvent: Boolean(existingEvent?.id)
  });

  return {
    status: "Created",
    eventId: event.id,
    eventUrl: event.htmlLink,
    alreadyExists: Boolean(existingEvent?.id)
  };
}

function eventToTrainingSlot(event: GoogleCalendarEvent): TrainingSlot | null {
  const properties = event.extendedProperties?.private ?? {};
  const dateTime = event.start?.dateTime;

  if (!event.id || !dateTime || properties.estType !== "availability") {
    return null;
  }

  const groupId = trainingGroups.some((group) => group.id === properties.groupId)
    ? (properties.groupId as TrainingGroupId)
    : "future-elite";
  const dateIso = dateTime.slice(0, 10);
  const labels = formatDateParts(dateIso);
  const capacity = Math.min(slotCapacity, Math.max(1, Number(properties.capacity) || slotCapacity));
  const bookedPlayers = Math.min(capacity, Math.max(0, Number(properties.bookedPlayers) || 0));
  const storedStatus = properties.status as SlotStatus | undefined;
  const status: SlotStatus = storedStatus === "blocked" ? "blocked" : bookedPlayers >= capacity ? "booked" : "open";

  return {
    id: properties.estSlotId || event.id,
    groupId,
    dateIso,
    dateLabel: labels.dateLabel,
    dayLabel: labels.dayLabel,
    time: formatTimeFromDateTime(dateTime),
    duration: `${Number(properties.durationMinutes) || getDurationMinutes(event.start?.dateTime, event.end?.dateTime)} min`,
    capacity,
    bookedPlayers,
    status,
    calendarEventId: event.id,
    calendarStatus: "Synced"
  };
}

export async function listCalendarAvailabilitySlots(): Promise<CalendarAvailabilityResult> {
  if (!isGoogleCalendarConfigured()) {
    logCalendarError("Availability sync skipped because Google Calendar is not configured", getCalendarEnvDiagnostics());
    return {
      status: "Google Calendar not configured",
      slots: [],
      message: "Google Calendar is not configured. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN in Vercel."
    };
  }

  const token = await getGoogleAccessToken();

  if (!token.accessToken) {
    return { status: "Failed", slots: [], message: token.error ?? "Could not connect to Google Calendar." };
  }

  const params = new URLSearchParams({
    timeMin: new Date().toISOString(),
    maxResults: "250",
    singleEvents: "true",
    orderBy: "startTime",
    privateExtendedProperty: "estType=availability"
  });
  const response = await fetch(
    `${googleCalendarEndpoint}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
    {
      headers: calendarHeaders(token.accessToken)
    }
  );

  if (!response.ok) {
    return { status: "Failed", slots: [], message: await googleErrorMessage(response, "Could not load Google Calendar availability") };
  }

  const data = (await response.json()) as GoogleCalendarListResponse;
  const slots = (data.items ?? []).map(eventToTrainingSlot).filter(Boolean) as TrainingSlot[];

  return { status: "Synced", slots };
}

export async function listCalendarBookingEvents(): Promise<CalendarBookingsResult> {
  if (!isGoogleCalendarConfigured()) {
    logCalendarError("Booking list sync skipped because Google Calendar is not configured", getCalendarEnvDiagnostics());
    return {
      status: "Google Calendar not configured",
      bookings: [],
      message: "Google Calendar is not configured. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN in Vercel."
    };
  }

  const token = await getGoogleAccessToken();

  if (!token.accessToken) {
    return { status: "Failed", bookings: [], message: token.error ?? "Could not connect to Google Calendar." };
  }

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const params = new URLSearchParams({
    timeMin: oneYearAgo.toISOString(),
    maxResults: "250",
    singleEvents: "true",
    orderBy: "startTime",
    privateExtendedProperty: "estType=booking"
  });
  const response = await fetch(
    `${googleCalendarEndpoint}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
    {
      headers: calendarHeaders(token.accessToken),
      cache: "no-store"
    }
  );

  if (!response.ok) {
    return { status: "Failed", bookings: [], message: await googleErrorMessage(response, "Could not load Google Calendar bookings") };
  }

  const data = (await response.json()) as GoogleCalendarListResponse;
  const bookings = (data.items ?? []).map(eventToBookingRecord).filter(Boolean) as BookingRecord[];

  return { status: "Synced", bookings };
}

export async function createCalendarAvailabilitySlot(slot: TrainingSlot): Promise<CalendarAvailabilityResult> {
  if (!isGoogleCalendarConfigured()) {
    logCalendarError("Availability creation skipped because Google Calendar is not configured", getCalendarEnvDiagnostics());
    return {
      status: "Google Calendar not configured",
      slot,
      message: "Google Calendar is not configured. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN in Vercel."
    };
  }

  const token = await getGoogleAccessToken();

  if (!token.accessToken) {
    return { status: "Failed", slot, message: token.error ?? "Could not connect to Google Calendar." };
  }

  const durationMinutes = Number.parseInt(slot.duration, 10) || 60;
  const range = getCalendarDateRange(slot.dateIso, slot.time, durationMinutes);
  const group = getTrainingGroup(slot.groupId);
  logCalendarInfo("Creating Google Calendar availability event", {
    slotId: slot.id,
    group: group.name,
    start: range.start,
    end: range.end,
    calendarId
  });
  const response = await fetch(`${googleCalendarEndpoint}/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    headers: calendarHeaders(token.accessToken),
    body: JSON.stringify({
      summary: `EST Availability: ${group.name}`,
      description: `Available Elite Soccer Training CV session for ${group.name}.`,
      start: {
        dateTime: range.start,
        timeZone: calendarTimeZone
      },
      end: {
        dateTime: range.end,
        timeZone: calendarTimeZone
      },
      transparency: "transparent",
      extendedProperties: {
        private: {
          estType: "availability",
          estSlotId: slot.id,
          groupId: slot.groupId,
          capacity: String(slot.capacity),
          bookedPlayers: String(slot.bookedPlayers),
          durationMinutes: String(durationMinutes),
          status: slot.status
        }
      }
    })
  });

  if (!response.ok) {
    return { status: "Failed", slot, message: await googleErrorMessage(response, "Could not create Google Calendar availability") };
  }

  const event = (await response.json()) as GoogleCalendarEvent;
  logCalendarInfo("Google Calendar availability event created", {
    slotId: slot.id,
    eventId: event.id,
    eventUrl: event.htmlLink
  });
  const syncedSlot = eventToTrainingSlot(event) ?? { ...slot, calendarEventId: event.id, calendarStatus: "Synced" };

  return { status: "Synced", slot: syncedSlot, eventId: event.id };
}

export async function updateCalendarAvailabilitySlot(
  eventId: string,
  updates: Partial<Pick<TrainingSlot, "status" | "bookedPlayers" | "capacity">>
): Promise<CalendarAvailabilityResult> {
  if (!isGoogleCalendarConfigured()) {
    logCalendarError("Availability update skipped because Google Calendar is not configured", getCalendarEnvDiagnostics());
    return {
      status: "Google Calendar not configured",
      message: "Google Calendar is not configured. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN in Vercel."
    };
  }

  const token = await getGoogleAccessToken();

  if (!token.accessToken) {
    return { status: "Failed", message: token.error ?? "Could not connect to Google Calendar." };
  }

  const currentResponse = await fetch(
    `${googleCalendarEndpoint}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      headers: calendarHeaders(token.accessToken)
    }
  );

  if (!currentResponse.ok) {
    return {
      status: "Failed",
      message: await googleErrorMessage(currentResponse, "Could not load the Google Calendar availability event")
    };
  }

  const currentEvent = (await currentResponse.json()) as GoogleCalendarEvent;
  const currentProperties = currentEvent.extendedProperties?.private ?? {};
  const nextProperties = {
    ...currentProperties,
    ...(updates.status ? { status: updates.status } : {}),
    ...(typeof updates.bookedPlayers === "number" ? { bookedPlayers: String(updates.bookedPlayers) } : {}),
    ...(typeof updates.capacity === "number" ? { capacity: String(updates.capacity) } : {})
  };

  const response = await fetch(
    `${googleCalendarEndpoint}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      headers: calendarHeaders(token.accessToken, currentEvent.etag ? { "If-Match": currentEvent.etag } : undefined),
      body: JSON.stringify({
        extendedProperties: {
          private: nextProperties
        }
      })
    }
  );

  if (!response.ok) {
    return { status: "Failed", message: await googleErrorMessage(response, "Could not update Google Calendar availability") };
  }

  const event = (await response.json()) as GoogleCalendarEvent;

  return { status: "Synced", slot: eventToTrainingSlot(event) ?? undefined, eventId: event.id };
}

export async function deleteCalendarAvailabilitySlot(eventId: string): Promise<CalendarAvailabilityResult> {
  if (!isGoogleCalendarConfigured()) {
    logCalendarError("Availability deletion skipped because Google Calendar is not configured", getCalendarEnvDiagnostics());
    return {
      status: "Google Calendar not configured",
      message: "Google Calendar is not configured. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN in Vercel."
    };
  }

  const token = await getGoogleAccessToken();

  if (!token.accessToken) {
    return { status: "Failed", message: token.error ?? "Could not connect to Google Calendar." };
  }

  const response = await fetch(
    `${googleCalendarEndpoint}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers: calendarHeaders(token.accessToken)
    }
  );

  if (!response.ok && response.status !== 410 && response.status !== 404) {
    return { status: "Failed", message: await googleErrorMessage(response, "Could not remove Google Calendar availability") };
  }

  return { status: "Synced", eventId };
}

async function reserveAvailabilityForBooking(booking: BookingRecord, accessToken: string): Promise<CalendarBookingResult> {
  if (!booking.sessionCalendarEventId) {
    return { status: "Ready" };
  }

  const response = await fetch(
    `${googleCalendarEndpoint}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(
      booking.sessionCalendarEventId
    )}`,
    {
      headers: calendarHeaders(accessToken)
    }
  );

  if (!response.ok) {
    return { status: "Failed", message: await googleErrorMessage(response, "Could not verify Google Calendar availability") };
  }

  const event = (await response.json()) as GoogleCalendarEvent;
  const properties = event.extendedProperties?.private ?? {};
  const capacity = Math.min(slotCapacity, Math.max(1, Number(properties.capacity) || slotCapacity));
  const bookedPlayers = Math.min(capacity, Math.max(0, Number(properties.bookedPlayers) || 0));
  const requestedPlayers = Math.max(1, Number(booking.players) || 1);
  const nextBookedPlayers = bookedPlayers + requestedPlayers;

  if (properties.status === "blocked" || nextBookedPlayers > capacity) {
    return {
      status: "Unavailable",
      message: "That session is no longer available or does not have enough remaining spots."
    };
  }

  const nextStatus = nextBookedPlayers >= capacity ? "booked" : "open";
  const patchResponse = await fetch(
    `${googleCalendarEndpoint}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(
      booking.sessionCalendarEventId
    )}`,
    {
      method: "PATCH",
      headers: calendarHeaders(accessToken, event.etag ? { "If-Match": event.etag } : undefined),
      body: JSON.stringify({
        summary: nextStatus === "booked" ? `EST Full: ${booking.programName}` : event.summary,
        extendedProperties: {
          private: {
            ...properties,
            bookedPlayers: String(nextBookedPlayers),
            status: nextStatus
          }
        }
      })
    }
  );

  if (patchResponse.status === 412) {
    return {
      status: "Unavailable",
      message: "That session was just updated. Please choose another available time."
    };
  }

  if (!patchResponse.ok) {
    return { status: "Failed", message: await googleErrorMessage(patchResponse, "Could not reserve the Google Calendar availability slot") };
  }

  return { status: "Synced" };
}

export async function createBookingCalendarEvent(booking: BookingRecord): Promise<CalendarBookingResult> {
  console.info("[EST Calendar] Starting calendar event creation", {
    bookingId: booking.id,
    playerName: booking.playerName,
    programName: booking.programName,
    paymentStatus: booking.paymentStatus
  });
  console.info("[EST Calendar] Calendar ID:", calendarId);
  console.info("[EST Calendar] Service account email:", getGoogleServiceAccountEmail() || "not configured");

  if (!isGoogleCalendarConfigured()) {
    setLastCalendarEventCreationResult({
      bookingId: booking.id,
      status: "Google Calendar not configured",
      calendarId,
      message: "Google Calendar credentials are missing."
    });
    console.error("[EST Calendar] Calendar event creation failed", {
      bookingId: booking.id,
      reason: "Google Calendar credentials are missing",
      hasGoogleClientId: Boolean(process.env.GOOGLE_CLIENT_ID),
      hasGoogleClientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
      hasGoogleRefreshToken: Boolean(process.env.GOOGLE_REFRESH_TOKEN)
    });
    logCalendarError("Booking event creation skipped because Google Calendar is not configured", {
      ...getCalendarEnvDiagnostics(),
      bookingId: booking.id
    });
    return {
      status: "Google Calendar not configured",
      message: "Google Calendar is not configured. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN in Vercel."
    };
  }

  const token = await getGoogleAccessToken();

  if (!token.accessToken) {
    setLastCalendarEventCreationResult({
      bookingId: booking.id,
      status: "Failed",
      calendarId,
      message: token.error ?? "Could not connect to Google Calendar."
    });
    console.error("[EST Calendar] Calendar event creation failed", {
      bookingId: booking.id,
      reason: token.error ?? "Could not connect to Google Calendar."
    });
    return { status: "Failed", message: token.error ?? "Could not connect to Google Calendar." };
  }

  const durationMinutes = booking.sessionDurationMinutes || 60;
  const dateIso = resolveBookingDateIso(booking);

  if (!dateIso) {
    setLastCalendarEventCreationResult({
      bookingId: booking.id,
      status: "Failed",
      calendarId,
      message: "Google Calendar event could not be created because the booking is missing a session date."
    });
    logCalendarError("Booking event creation failed because sessionDateIso is missing", {
      bookingId: booking.id,
      sessionId: booking.sessionId,
      sessionDate: booking.sessionDate,
      sessionTime: booking.sessionTime
    });
    console.error("[EST Calendar] Calendar event creation failed", {
      bookingId: booking.id,
      reason: "Missing session date"
    });

    return {
      status: "Failed",
      message: "Google Calendar event could not be created because the booking is missing a session date."
    };
  }

  const range = getCalendarDateRange(dateIso, booking.sessionTime, durationMinutes);
  const existingEvent = await findExistingBookingEvent(booking.id, token.accessToken);
  const bookingEventPayload = {
    summary: `EST CV - ${booking.programName}: ${booking.playerName}`,
    description: bookingDescription(booking),
    location: business.location,
    start: {
      dateTime: range.start,
      timeZone: calendarTimeZone
    },
    end: {
      dateTime: range.end,
      timeZone: calendarTimeZone
    },
    extendedProperties: {
      private: {
        estType: "booking",
        estBookingId: booking.id,
        estSessionId: booking.sessionId,
        estAvailabilityEventId: booking.sessionCalendarEventId ?? "",
        programId: booking.programId
      }
    }
  };

  logCalendarInfo("Creating Google Calendar booking event", {
    bookingId: booking.id,
    programName: booking.programName,
    playerName: booking.playerName,
    start: range.start,
    end: range.end,
    calendarId,
    updatingExistingEvent: Boolean(existingEvent?.id)
  });
  const response = await fetch(
    existingEvent?.id
      ? `${googleCalendarEndpoint}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existingEvent.id)}`
      : `${googleCalendarEndpoint}/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: existingEvent?.id ? "PATCH" : "POST",
      headers: calendarHeaders(token.accessToken, existingEvent?.etag ? { "If-Match": existingEvent.etag } : undefined),
      body: JSON.stringify(bookingEventPayload)
    }
  );

  if (!response.ok) {
    const message = await googleErrorMessage(response, "Could not create the Google Calendar booking event");
    setLastCalendarEventCreationResult({
      bookingId: booking.id,
      status: "Failed",
      calendarId,
      message
    });
    console.error("[EST Calendar] Calendar event creation failed", {
      bookingId: booking.id,
      reason: message
    });
    return { status: "Failed", message };
  }

  const event = (await response.json()) as GoogleCalendarEvent;
  setLastCalendarEventCreationResult({
    bookingId: booking.id,
    status: "Created",
    calendarId,
    eventId: event.id,
    message: existingEvent?.id ? "Calendar event updated successfully." : "Calendar event created successfully."
  });
  logCalendarInfo(existingEvent?.id ? "Google Calendar booking event updated" : "Google Calendar booking event created", {
    bookingId: booking.id,
    eventId: event.id,
    eventUrl: event.htmlLink
  });
  console.info("[EST Calendar] Calendar event created successfully", {
    bookingId: booking.id,
    eventId: event.id,
    eventUrl: event.htmlLink,
    updatedExistingEvent: Boolean(existingEvent?.id)
  });

  return {
    status: "Created",
    eventId: event.id,
    eventUrl: event.htmlLink,
    alreadyExists: Boolean(existingEvent?.id)
  };
}

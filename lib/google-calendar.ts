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

const googleAuthEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";
const googleTokenEndpoint = "https://oauth2.googleapis.com/token";
const googleCalendarEndpoint = "https://www.googleapis.com/calendar/v3";
const calendarTimeZone = process.env.GOOGLE_CALENDAR_TIME_ZONE ?? "America/Los_Angeles";
const calendarId = "primary";

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
    hasGoogleClientId: Boolean(clientId),
    hasGoogleClientSecret: Boolean(clientSecret),
    hasGoogleRefreshToken: Boolean(refreshToken),
    calendarId,
    calendarTimeZone
  };
}

function isGoogleCalendarConfigured() {
  const { clientId, clientSecret, refreshToken } = getGoogleClientConfig();
  return Boolean(clientId && clientSecret && refreshToken);
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

  if (!clientId || !clientSecret || !refreshToken) {
    logCalendarError("Google Calendar environment variables are missing", getCalendarEnvDiagnostics());
    return {
      accessToken: null,
      error: "Google Calendar is not configured. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN in Vercel."
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
  return [
    `Program: ${booking.programName}`,
    `Player: ${booking.playerName}`,
    `Parent/Guardian: ${booking.parentName}`,
    `Phone: ${booking.phone}`,
    `Email: ${booking.email}`,
    `Number of players: ${booking.players}`,
    `Payment amount: ${booking.players} x ${sessionPriceLabel} = ${formatCurrencyFromCents(getSessionTotalCents(booking.players))}`,
    `Notes: ${booking.notes || "None"}`,
    `Medical notes/injuries: ${booking.medicalNotes || "None"}`,
    `Emergency contact: ${booking.emergencyName} - ${booking.emergencyPhone}`,
    `Payment status: ${booking.paymentStatus}`,
    `Waiver accepted: ${booking.waiverAccepted ? "Yes" : "Not recorded"}`,
    `Waiver accepted at: ${booking.waiverAcceptedAt || "Not recorded"}`,
    `Waiver version: ${booking.waiverVersion || "Not recorded"}`,
    `Media consent: ${booking.mediaConsent || "Not recorded"}`,
    `Digital signature: ${booking.guardianSignature || "Not recorded"}`,
    `Booking ID: ${booking.id}`
  ].join("\n");
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
      description: `Available Elite Soccer Training session for ${group.name}.`,
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
  if (!isGoogleCalendarConfigured()) {
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
    return { status: "Failed", message: token.error ?? "Could not connect to Google Calendar." };
  }

  const existingEvent = await findExistingBookingEvent(booking.id, token.accessToken);

  if (existingEvent?.id) {
    logCalendarInfo("Google Calendar booking event already exists", {
      bookingId: booking.id,
      eventId: existingEvent.id,
      eventUrl: existingEvent.htmlLink
    });

    return {
      status: "Created",
      eventId: existingEvent.id,
      eventUrl: existingEvent.htmlLink,
      alreadyExists: true
    };
  }

  const reservation = await reserveAvailabilityForBooking(booking, token.accessToken);

  if (reservation.status === "Unavailable" || reservation.status === "Failed") {
    return reservation;
  }

  const durationMinutes = booking.sessionDurationMinutes || 60;
  const dateIso = resolveBookingDateIso(booking);

  if (!dateIso) {
    logCalendarError("Booking event creation failed because sessionDateIso is missing", {
      bookingId: booking.id,
      sessionId: booking.sessionId,
      sessionDate: booking.sessionDate,
      sessionTime: booking.sessionTime
    });

    return {
      status: "Failed",
      message: "Google Calendar event could not be created because the booking is missing a session date."
    };
  }

  const range = getCalendarDateRange(dateIso, booking.sessionTime, durationMinutes);
  logCalendarInfo("Creating Google Calendar booking event", {
    bookingId: booking.id,
    programName: booking.programName,
    playerName: booking.playerName,
    start: range.start,
    end: range.end,
    calendarId
  });
  const response = await fetch(`${googleCalendarEndpoint}/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    headers: calendarHeaders(token.accessToken),
    body: JSON.stringify({
      summary: `EST Booking: ${booking.programName} - ${booking.playerName}`,
      description: bookingDescription(booking),
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
    })
  });

  if (!response.ok) {
    return { status: "Failed", message: await googleErrorMessage(response, "Could not create the Google Calendar booking event") };
  }

  const event = (await response.json()) as GoogleCalendarEvent;
  logCalendarInfo("Google Calendar booking event created", {
    bookingId: booking.id,
    eventId: event.id,
    eventUrl: event.htmlLink
  });

  return {
    status: "Created",
    eventId: event.id,
    eventUrl: event.htmlLink
  };
}

import type { BookingRecord } from "@/lib/booking-data";
import { sessionUnitAmountCents, getLaunchPassOption } from "@/lib/pricing";
import {
  customPaymentLinkPlanLabel,
  type CustomPaymentLinkRow,
  type PassPurchaseRow,
  type PrivateSessionRequestRow
} from "@/lib/supabase-db";
import {
  hasSentAdminAlert,
  listRecentAdminAlertLogs,
  logAdminAlertStatus
} from "@/lib/supabase-db";

type PushoverAlertInput = {
  title: string;
  message: string;
  source: string;
  sourceId: string;
  dedupeKey: string;
  bookingId?: string;
};

type PushoverAttemptStatus = {
  configured: boolean;
  status: "sent" | "failed" | "skipped";
  source?: string;
  sourceId?: string;
  message?: string;
  checkedAt: string;
};

const pushoverEndpoint = "https://api.pushover.net/1/messages.json";

const pushoverDiagnosticsStore: {
  lastAttempt: PushoverAttemptStatus | null;
} = {
  lastAttempt: null
};

function isPushoverConfigured() {
  return Boolean(process.env.PUSHOVER_USER_KEY && process.env.PUSHOVER_APP_TOKEN);
}

function setLastPushoverAttempt(attempt: Omit<PushoverAttemptStatus, "configured" | "checkedAt">) {
  pushoverDiagnosticsStore.lastAttempt = {
    ...attempt,
    configured: isPushoverConfigured(),
    checkedAt: new Date().toISOString()
  };
}

export async function getPushoverDiagnostics() {
  const recentLogs = await listRecentAdminAlertLogs(5);

  return {
    configured: isPushoverConfigured(),
    userKeyConfigured: Boolean(process.env.PUSHOVER_USER_KEY),
    appTokenConfigured: Boolean(process.env.PUSHOVER_APP_TOKEN),
    lastAttempt: pushoverDiagnosticsStore.lastAttempt,
    recentLogs
  };
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format((Number(cents) || 0) / 100);
}

function trimAlertText(value: string, maxLength = 960) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function bookingAmountText(booking: BookingRecord) {
  if (booking.paymentType === "launch_pass_credit") {
    return "Training Package credit";
  }

  return formatMoney((Number(booking.players) || 1) * sessionUnitAmountCents);
}

function waiverStatusText(booking: BookingRecord) {
  return booking.waiverAccepted ? "Signed" : "Missing";
}

async function sendPushoverAlert(input: PushoverAlertInput) {
  const alreadySent = await hasSentAdminAlert(input.dedupeKey);

  if (alreadySent) {
    console.info("[EST Pushover] Alert already sent; skipping duplicate", {
      source: input.source,
      sourceId: input.sourceId,
      bookingId: input.bookingId
    });
    setLastPushoverAttempt({
      status: "skipped",
      source: input.source,
      sourceId: input.sourceId,
      message: "Duplicate alert skipped."
    });
    return { sent: false, skipped: true, message: "Duplicate alert skipped." };
  }

  if (!isPushoverConfigured()) {
    const message = "Pushover admin alert not sent because PUSHOVER_USER_KEY or PUSHOVER_APP_TOKEN is missing.";

    console.warn("[EST Pushover] Alert skipped; configuration missing", {
      source: input.source,
      sourceId: input.sourceId,
      bookingId: input.bookingId,
      userKeyConfigured: Boolean(process.env.PUSHOVER_USER_KEY),
      appTokenConfigured: Boolean(process.env.PUSHOVER_APP_TOKEN)
    });
    setLastPushoverAttempt({
      status: "skipped",
      source: input.source,
      sourceId: input.sourceId,
      message
    });
    await logAdminAlertStatus({
      ...input,
      recipient: "pushover",
      status: "skipped",
      errorMessage: message
    });
    return { sent: false, skipped: true, message };
  }

  console.info("[EST Pushover] Sending urgent admin alert", {
    source: input.source,
    sourceId: input.sourceId,
    bookingId: input.bookingId
  });

  const body = new URLSearchParams({
    token: process.env.PUSHOVER_APP_TOKEN as string,
    user: process.env.PUSHOVER_USER_KEY as string,
    title: trimAlertText(input.title, 250),
    message: trimAlertText(input.message),
    priority: "1",
    sound: "pushover"
  });

  try {
    const response = await fetch(pushoverEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });
    const responseText = await response.text().catch(() => "");

    if (!response.ok) {
      throw new Error(responseText || `Pushover returned ${response.status}.`);
    }

    console.info("[EST Pushover] Admin alert sent successfully", {
      source: input.source,
      sourceId: input.sourceId,
      bookingId: input.bookingId
    });
    setLastPushoverAttempt({
      status: "sent",
      source: input.source,
      sourceId: input.sourceId,
      message: "Pushover alert sent successfully."
    });
    await logAdminAlertStatus({
      ...input,
      recipient: "pushover",
      status: "sent"
    });

    return { sent: true, skipped: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pushover alert failed.";

    console.error("[EST Pushover] Admin alert failed", {
      source: input.source,
      sourceId: input.sourceId,
      bookingId: input.bookingId,
      error: message
    });
    setLastPushoverAttempt({
      status: "failed",
      source: input.source,
      sourceId: input.sourceId,
      message
    });
    await logAdminAlertStatus({
      ...input,
      recipient: "pushover",
      status: "failed",
      errorMessage: message
    });

    return { sent: false, skipped: false, message };
  }
}

export async function sendBookingAdminPushoverAlert(
  booking: BookingRecord,
  options: {
    source?: string;
    title?: string;
  } = {}
) {
  const source = options.source || (booking.paymentType === "launch_pass_credit" ? "training_credit_redemption" : "single_session_booking");
  const title = options.title || (booking.paymentType === "launch_pass_credit" ? "EST CV Training Credit Booking" : "EST CV Paid Booking");
  const message = [
    `Player: ${booking.playerName}`,
    `Session date: ${booking.sessionDate || booking.sessionDateIso || "Not recorded"}`,
    `Session time: ${booking.sessionTime || "Not recorded"}`,
    `Session focus/title: ${booking.programName || "General Training"}`,
    `Payment status: ${booking.paymentStatus}`,
    `Amount paid: ${bookingAmountText(booking)}`,
    `Parent: ${booking.parentName}`,
    `Parent phone: ${booking.phone}`,
    `Waiver status: ${waiverStatusText(booking)}`
  ].join("\n");

  return sendPushoverAlert({
    title,
    message,
    source,
    sourceId: booking.id,
    bookingId: booking.id,
    dedupeKey: `booking:${booking.id}:admin_push`
  });
}

export async function sendLaunchPassAdminPushoverAlert(pass: PassPurchaseRow) {
  const option = getLaunchPassOption(pass.pass_type);
  const message = [
    `Player: ${pass.player_name}`,
    "Session date: Not selected yet",
    "Session time: Not selected yet",
    `Session focus/title: ${option.title}`,
    `Payment status: ${pass.status === "paid" ? "Paid" : pass.status}`,
    `Amount paid: ${formatMoney(pass.amount_paid)}`,
    `Parent: ${pass.parent_name}`,
    `Parent phone: ${pass.parent_phone}`,
    `Waiver status: ${pass.booking_details?.waiverAccepted ? "Signed" : "Not recorded"}`
  ].join("\n");

  return sendPushoverAlert({
    title: `EST CV ${option.title} Purchased`,
    message,
    source: "training_package_purchase",
    sourceId: pass.id,
    dedupeKey: `pass:${pass.id}:admin_push`
  });
}

export async function sendPrivateSessionRequestAdminPushoverAlert(request: PrivateSessionRequestRow) {
  const message = [
    `Player: ${request.player_name}`,
    `Session date: ${request.preferred_times}`,
    "Session time: Requested by parent",
    `Session focus/title: ${request.focus_areas.length > 0 ? request.focus_areas.join(", ") : "Private 1-on-1 Session Request"}`,
    "Payment status: Request only / not paid",
    "Amount paid: $0.00",
    `Parent: ${request.parent_name}`,
    `Parent phone: ${request.parent_phone}`,
    "Waiver status: Not submitted yet"
  ].join("\n");

  return sendPushoverAlert({
    title: "EST CV Private 1-on-1 Request",
    message,
    source: "private_session_request",
    sourceId: request.id,
    dedupeKey: `private_request:${request.id}:admin_push`
  });
}

export async function sendScheduleApprovalAdminPushoverAlert(input: {
  token: string;
  bookingCount: number;
  firstBooking?: BookingRecord;
}) {
  const first = input.firstBooking;
  const message = [
    `Player: ${first?.playerName || "Schedule approval"}`,
    `Session date: ${first?.sessionDate || "Multiple sessions"}`,
    `Session time: ${first?.sessionTime || "Multiple times"}`,
    `Session focus/title: ${first?.programName || "Schedule approval confirmation"}`,
    "Payment status: Paid by Training Package credits",
    `Amount paid: ${first ? bookingAmountText(first) : "Training Package credits"}`,
    `Parent: ${first?.parentName || "Not recorded"}`,
    `Parent phone: ${first?.phone || "Not recorded"}`,
    `Waiver status: ${first ? waiverStatusText(first) : "Recorded if attached to booking"}`,
    `Sessions confirmed: ${input.bookingCount}`
  ].join("\n");

  return sendPushoverAlert({
    title: "EST CV Schedule Approved",
    message,
    source: "schedule_approval_confirmation",
    sourceId: input.token,
    dedupeKey: `schedule_approval:${input.token}:admin_push`
  });
}

export async function sendCustomPaymentLinkAdminPushoverAlert(link: CustomPaymentLinkRow) {
  const planLabel = customPaymentLinkPlanLabel(link.plan_type);
  const message = [
    `Player: ${link.player_name}`,
    link.selected_session_ids.length > 0 ? "Session date: Selected in private link" : "Session date: Not selected yet",
    link.selected_session_ids.length > 0 ? "Session time: Selected in private link" : "Session time: Not selected yet",
    `Session focus/title: ${planLabel}`,
    `Payment status: ${link.payment_status || (link.status === "paid" ? "Paid" : link.status)}`,
    `Amount paid: ${formatMoney(link.amount_cents)}`,
    `Parent: ${link.parent_name}`,
    `Parent phone: ${link.parent_phone}`,
    "Waiver status: Recorded if sessions were selected"
  ].join("\n");

  return sendPushoverAlert({
    title: "EST CV Custom Payment Paid",
    message,
    source: "custom_payment_link",
    sourceId: link.id,
    dedupeKey: `custom_payment_link:${link.id}:admin_push`
  });
}

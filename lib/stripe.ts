import { createHmac, timingSafeEqual } from "crypto";
import { type BookingRecord, type TrainingGroupId } from "@/lib/booking-data";
import {
  sessionCurrency,
  sessionLineItemName,
  sessionUnitAmountCents
} from "@/lib/pricing";

const stripeApiBase = "https://api.stripe.com/v1";
const defaultSiteUrl = "https://www.elitesoccertrainingcv.com";

export type StripeCheckoutSession = {
  id: string;
  url?: string;
  payment_status?: string;
  status?: string;
  metadata?: Record<string, string>;
  client_reference_id?: string;
  payment_intent?: string | null;
  amount_total?: number | null;
};

export type StripeEvent = {
  id: string;
  type: "checkout.session.completed" | "checkout.session.expired" | "payment_intent.payment_failed" | string;
  data: {
    object: StripeCheckoutSession & Record<string, unknown>;
  };
};

function getStripeSecretKey() {
  return process.env.STRIPE_SECRET_KEY;
}

export function getStripeKeyMode() {
  const key = getStripeSecretKey() || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "";

  if (key.startsWith("sk_live_") || key.startsWith("pk_live_")) {
    return "live";
  }

  if (key.startsWith("sk_test_") || key.startsWith("pk_test_")) {
    return "test";
  }

  return key ? "unknown" : "missing";
}

export function hasStripeWebhookSecret() {
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim());
}

export function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || defaultSiteUrl).replace(/\/$/, "");
}

function truncateMetadata(value: string) {
  return value.slice(0, 450);
}

function metadataValue(value: string | number | boolean | undefined) {
  return truncateMetadata(String(value ?? ""));
}

export function bookingToStripeMetadata(booking: BookingRecord) {
  return {
    bookingId: booking.id,
    createdAt: booking.createdAt,
    parentName: booking.parentName,
    playerName: booking.playerName,
    playerAge: booking.playerAge,
    phone: booking.phone,
    email: booking.email,
    players: booking.players,
    notes: booking.notes,
    medicalNotes: booking.medicalNotes,
    emergencyName: booking.emergencyName,
    emergencyPhone: booking.emergencyPhone,
    guardianSignature: booking.guardianSignature,
    waiverAccepted: booking.waiverAccepted,
    waiverAcceptedAt: booking.waiverAcceptedAt,
    waiverVersion: booking.waiverVersion,
    ipAddress: booking.ipAddress ?? "",
    mediaConsent: booking.mediaConsent,
    programId: booking.programId,
    programName: booking.programName,
    sessionId: booking.sessionId,
    sessionDateIso: booking.sessionDateIso,
    sessionDate: booking.sessionDate,
    sessionTime: booking.sessionTime,
    sessionDurationMinutes: booking.sessionDurationMinutes,
    sessionCalendarEventId: booking.sessionCalendarEventId ?? ""
  };
}

function appendMetadata(params: URLSearchParams, metadata: Record<string, string | number | boolean | undefined>) {
  Object.entries(metadata).forEach(([key, value]) => {
    params.append(`metadata[${key}]`, metadataValue(value));
  });
}

export async function createStripeCheckoutSession(booking: BookingRecord) {
  const secretKey = getStripeSecretKey();

  if (!secretKey) {
    throw new Error("Stripe is not configured. Add STRIPE_SECRET_KEY in Vercel.");
  }

  if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
    throw new Error("Stripe is not configured. Add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY in Vercel.");
  }

  const siteUrl = getSiteUrl();
  const params = new URLSearchParams({
    mode: "payment",
    success_url: `${siteUrl}/booking/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/booking/cancel`,
    allow_promotion_codes: "true",
    client_reference_id: booking.id,
    customer_email: booking.email,
    "line_items[0][price_data][currency]": sessionCurrency,
    "line_items[0][price_data][product_data][name]": sessionLineItemName,
    "line_items[0][price_data][unit_amount]": String(sessionUnitAmountCents),
    "line_items[0][quantity]": String(Math.max(1, Number(booking.players) || 1)),
    "payment_intent_data[metadata][bookingId]": booking.id
  });

  // Stripe Checkout uses Dashboard-managed dynamic payment methods when payment_method_types is omitted.
  // Apple Pay and Google Pay visibility depends on Stripe settings, domain verification, device/browser support, and live mode.

  appendMetadata(params, bookingToStripeMetadata(booking));

  const response = await fetch(`${stripeApiBase}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
  });

  const result = (await response.json()) as StripeCheckoutSession & { error?: { message?: string } };

  if (!response.ok) {
    throw new Error(result.error?.message ?? "Stripe Checkout session could not be created.");
  }

  if (!result.url) {
    throw new Error("Stripe did not return a Checkout URL.");
  }

  return result;
}

export async function retrieveStripeCheckoutSession(sessionId: string) {
  const secretKey = getStripeSecretKey();

  if (!secretKey) {
    throw new Error("Stripe is not configured. Add STRIPE_SECRET_KEY in Vercel.");
  }

  const cleanSessionId = sessionId.trim();

  if (!cleanSessionId) {
    throw new Error("Stripe Checkout session ID is missing.");
  }

  const response = await fetch(
    `${stripeApiBase}/checkout/sessions/${encodeURIComponent(cleanSessionId)}`,
    {
      headers: {
        Authorization: `Bearer ${secretKey}`
      },
      cache: "no-store"
    }
  );
  const result = (await response.json()) as StripeCheckoutSession & { error?: { message?: string } };

  if (!response.ok) {
    throw new Error(result.error?.message ?? "Stripe Checkout session could not be verified.");
  }

  return result;
}

export function isStripePaymentVerified(session: StripeCheckoutSession) {
  return session.payment_status === "paid" && session.status === "complete";
}

export function bookingFromStripeMetadata(metadata: Record<string, string> | undefined): BookingRecord | null {
  if (!metadata?.bookingId || !metadata.email) {
    return null;
  }

  return {
    id: metadata.bookingId,
    createdAt: metadata.createdAt || new Date().toISOString(),
    parentName: metadata.parentName || "",
    playerName: metadata.playerName || "",
    playerAge: metadata.playerAge || "",
    phone: metadata.phone || "",
    email: metadata.email,
    players: metadata.players || "1",
    notes: metadata.notes || "",
    medicalNotes: metadata.medicalNotes || "",
    emergencyName: metadata.emergencyName || "",
    emergencyPhone: metadata.emergencyPhone || "",
    guardianSignature: metadata.guardianSignature || "",
    waiverAccepted: metadata.waiverAccepted === "true",
    waiverAcceptedAt: metadata.waiverAcceptedAt || "",
    waiverVersion: metadata.waiverVersion || "",
    ipAddress: metadata.ipAddress || "",
    mediaConsent: metadata.mediaConsent === "Declined" ? "Declined" : "Granted",
    programId: (metadata.programId || "future-elite") as TrainingGroupId,
    programName: metadata.programName || "",
    sessionId: metadata.sessionId || "",
    sessionDateIso: metadata.sessionDateIso || "",
    sessionDate: metadata.sessionDate || "",
    sessionTime: metadata.sessionTime || "",
    sessionDurationMinutes: Number(metadata.sessionDurationMinutes) || 60,
    sessionCalendarEventId: metadata.sessionCalendarEventId || undefined,
    paymentStatus: "Paid",
    notificationStatus: "Ready",
    calendarStatus: "Ready"
  };
}

export function verifyStripeWebhookSignature(payload: string, signatureHeader: string | null) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new Error("Stripe webhook is not configured. Add STRIPE_WEBHOOK_SECRET in Vercel.");
  }

  if (!signatureHeader) {
    throw new Error("Missing Stripe-Signature header.");
  }

  const pieces = signatureHeader.split(",").reduce<Record<string, string[]>>((current, piece) => {
    const [key, value] = piece.split("=");
    if (!key || !value) {
      return current;
    }

    return {
      ...current,
      [key]: [...(current[key] ?? []), value]
    };
  }, {});
  const timestamp = pieces.t?.[0];
  const signatures = pieces.v1 ?? [];

  if (!timestamp || signatures.length === 0) {
    throw new Error("Stripe webhook signature is missing timestamp or v1 signature.");
  }

  const expected = createHmac("sha256", webhookSecret)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const isValid = signatures.some((signature) => {
    const signatureBuffer = Buffer.from(signature, "hex");

    return signatureBuffer.length === expectedBuffer.length && timingSafeEqual(signatureBuffer, expectedBuffer);
  });

  if (!isValid) {
    throw new Error("Invalid Stripe webhook signature.");
  }

  return JSON.parse(payload) as StripeEvent;
}

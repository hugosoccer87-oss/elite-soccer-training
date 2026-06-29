import { createHmac, timingSafeEqual } from "crypto";
import { type BookingRecord, type TrainingGroupId } from "@/lib/booking-data";
import {
  getDirectPaymentOption,
  getLaunchPassOption,
  type LaunchPassType,
  sessionCurrency,
  sessionLineItemName,
  sessionUnitAmountCents
} from "@/lib/pricing";
import type { DirectPaymentRow, PassPurchaseRow } from "@/lib/supabase-db";

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

export type StripeMode = "live" | "test";

function normalizeStripeMode(value: string | undefined): StripeMode | null {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "test" || normalized === "live") {
    return normalized;
  }

  return null;
}

export function getStripeMode(): StripeMode {
  return normalizeStripeMode(process.env.STRIPE_MODE) ?? normalizeStripeMode(process.env.NEXT_PUBLIC_STRIPE_MODE) ?? "live";
}

function getStripeEnvironment() {
  const mode = getStripeMode();

  if (mode === "test") {
    return {
      mode,
      secretKey: process.env.STRIPE_TEST_SECRET_KEY,
      publishableKey: process.env.NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY,
      webhookSecret: process.env.STRIPE_TEST_WEBHOOK_SECRET,
      secretKeyName: "STRIPE_TEST_SECRET_KEY",
      publishableKeyName: "NEXT_PUBLIC_STRIPE_TEST_PUBLISHABLE_KEY",
      webhookSecretName: "STRIPE_TEST_WEBHOOK_SECRET"
    };
  }

  return {
    mode,
    secretKey: process.env.STRIPE_SECRET_KEY,
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    secretKeyName: "STRIPE_SECRET_KEY",
    publishableKeyName: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    webhookSecretName: "STRIPE_WEBHOOK_SECRET"
  };
}

function getStripeSecretKey() {
  return getStripeEnvironment().secretKey;
}

function getStripePublishableKey() {
  return getStripeEnvironment().publishableKey;
}

function getStripeWebhookSecret() {
  return getStripeEnvironment().webhookSecret;
}

export function getStripeEnvironmentDiagnostics() {
  const stripe = getStripeEnvironment();

  return {
    stripeMode: stripe.mode,
    secretKeyConfigured: Boolean(stripe.secretKey),
    publishableKeyConfigured: Boolean(stripe.publishableKey),
    webhookSecretConfigured: Boolean(stripe.webhookSecret),
    secretKeyName: stripe.secretKeyName,
    publishableKeyName: stripe.publishableKeyName,
    webhookSecretName: stripe.webhookSecretName
  };
}

export function getStripeKeyMode() {
  const key = getStripeSecretKey() || getStripePublishableKey() || "";

  if (key.startsWith("sk_live_") || key.startsWith("pk_live_")) {
    return "live";
  }

  if (key.startsWith("sk_test_") || key.startsWith("pk_test_")) {
    return "test";
  }

  return key ? "unknown" : "missing";
}

export function hasStripeWebhookSecret() {
  return Boolean(getStripeWebhookSecret()?.trim());
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

export function passPurchaseToStripeMetadata(pass: PassPurchaseRow) {
  return {
    purchase_type: "launch_pass",
    passPurchaseId: pass.id,
    pass_type: pass.pass_type,
    selected_session_count: pass.selected_session_ids?.length ?? 0,
    parent_name: pass.parent_name,
    parent_email: pass.parent_email,
    parent_phone: pass.parent_phone,
    player_name: pass.player_name,
    player_age: pass.player_age,
    training_group: pass.training_group,
    total_credits: pass.total_credits
  };
}

function appendMetadata(params: URLSearchParams, metadata: Record<string, string | number | boolean | undefined>) {
  Object.entries(metadata).forEach(([key, value]) => {
    params.append(`metadata[${key}]`, metadataValue(value));
  });
}

export async function createStripeCheckoutSession(booking: BookingRecord) {
  const secretKey = getStripeSecretKey();
  const stripe = getStripeEnvironment();

  if (!secretKey) {
    throw new Error(`Stripe is not configured. Add ${stripe.secretKeyName} in Vercel.`);
  }

  if (!getStripePublishableKey()) {
    throw new Error(`Stripe is not configured. Add ${stripe.publishableKeyName} in Vercel.`);
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

export async function createStripeLaunchPassCheckoutSession(pass: PassPurchaseRow) {
  const secretKey = getStripeSecretKey();
  const stripe = getStripeEnvironment();
  const option = getLaunchPassOption(pass.pass_type);

  if (!secretKey) {
    throw new Error(`Stripe is not configured. Add ${stripe.secretKeyName} in Vercel.`);
  }

  if (!getStripePublishableKey()) {
    throw new Error(`Stripe is not configured. Add ${stripe.publishableKeyName} in Vercel.`);
  }

  const siteUrl = getSiteUrl();
  const params = new URLSearchParams({
    mode: "payment",
    success_url: `${siteUrl}/booking/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/booking/cancel`,
    allow_promotion_codes: "true",
    client_reference_id: pass.id,
    customer_email: pass.parent_email,
    "line_items[0][price_data][currency]": sessionCurrency,
    "line_items[0][price_data][product_data][name]": option.stripeLineItemName,
    "line_items[0][price_data][product_data][description]": `${option.credits} training credits for EST CV small group training.`,
    "line_items[0][price_data][unit_amount]": String(option.amountCents),
    "line_items[0][quantity]": "1",
    "payment_intent_data[metadata][purchase_type]": "launch_pass",
    "payment_intent_data[metadata][passPurchaseId]": pass.id,
    "payment_intent_data[metadata][pass_type]": pass.pass_type,
    "payment_intent_data[metadata][parent_email]": pass.parent_email,
    "payment_intent_data[metadata][player_name]": pass.player_name,
    "payment_intent_data[metadata][total_credits]": String(option.credits)
  });

  appendMetadata(params, passPurchaseToStripeMetadata(pass));

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

export function passPurchaseIdFromStripeMetadata(metadata: Record<string, string> | undefined) {
  return metadata?.purchase_type === "launch_pass" && metadata.passPurchaseId ? metadata.passPurchaseId : null;
}

export async function createStripeDirectPaymentCheckoutSession(record: DirectPaymentRow) {
  const secretKey = getStripeSecretKey();
  const stripe = getStripeEnvironment();
  const option = getDirectPaymentOption(record.payment_option);

  if (!secretKey) {
    throw new Error(`Stripe is not configured. Add ${stripe.secretKeyName} in Vercel.`);
  }

  if (!getStripePublishableKey()) {
    throw new Error(`Stripe is not configured. Add ${stripe.publishableKeyName} in Vercel.`);
  }

  const siteUrl = getSiteUrl();
  const playerCount = record.player_count === 2 ? 2 : 1;
  const sessionCount =
    record.payment_option === "single_session" ? Math.min(6, Math.max(1, Number(record.session_count) || 1)) : 1;
  const checkoutQuantity = playerCount * sessionCount;
  const primaryPlayerName = `${record.player_first_name} ${record.player_last_name}`.trim();
  const secondPlayerName =
    playerCount === 2 ? `${record.second_player_first_name ?? ""} ${record.second_player_last_name ?? ""}`.trim() : "";
  const playerName = [primaryPlayerName, secondPlayerName].filter(Boolean).join(" + ");
  const directPaymentDescription =
    record.payment_option === "single_session"
      ? `Direct Pay + Waiver for ${playerName} (${sessionCount} ${sessionCount === 1 ? "session" : "sessions"})`
      : `Direct Pay + Waiver for ${playerName}`;
  const params = new URLSearchParams({
    mode: "payment",
    success_url: `${siteUrl}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/pay/cancel`,
    allow_promotion_codes: "true",
    client_reference_id: record.id,
    customer_email: record.parent_email,
    "line_items[0][price_data][currency]": sessionCurrency,
    "line_items[0][price_data][product_data][name]": option.stripeLineItemName,
    "line_items[0][price_data][product_data][description]": directPaymentDescription,
    "line_items[0][price_data][unit_amount]": String(option.amountCents),
    "line_items[0][quantity]": String(checkoutQuantity),
    "payment_intent_data[metadata][purchase_type]": "direct_payment",
    "payment_intent_data[metadata][directPaymentId]": record.id,
    "payment_intent_data[metadata][payment_option]": record.payment_option,
    "payment_intent_data[metadata][player_count]": String(playerCount),
    "payment_intent_data[metadata][session_count]": String(sessionCount),
    "payment_intent_data[metadata][player_name]": playerName,
    "metadata[purchase_type]": "direct_payment",
    "metadata[directPaymentId]": record.id,
    "metadata[payment_option]": record.payment_option,
    "metadata[player_count]": String(playerCount),
    "metadata[session_count]": String(sessionCount),
    "metadata[player_name]": playerName
  });

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

export function directPaymentIdFromStripeMetadata(metadata: Record<string, string> | undefined) {
  return metadata?.purchase_type === "direct_payment" && metadata.directPaymentId ? metadata.directPaymentId : null;
}

export async function retrieveStripeCheckoutSession(sessionId: string) {
  const secretKey = getStripeSecretKey();
  const stripe = getStripeEnvironment();

  if (!secretKey) {
    throw new Error(`Stripe is not configured. Add ${stripe.secretKeyName} in Vercel.`);
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
  const stripe = getStripeEnvironment();
  const webhookSecret = getStripeWebhookSecret();

  if (!webhookSecret) {
    throw new Error(`Stripe webhook is not configured. Add ${stripe.webhookSecretName} in Vercel.`);
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

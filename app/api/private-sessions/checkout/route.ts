import { NextResponse } from "next/server";
import { sessionUnitAmountCents } from "@/lib/pricing";
import { createStripePublicPrivateSessionCheckoutSession, getStripeEnvironmentDiagnostics } from "@/lib/stripe";
import {
  bookPrivateSessionAvailability,
  listPublicBookingPrivateSessionAvailability,
  updatePrivateSessionAvailability
} from "@/lib/supabase-db";
import { syncBookedPrivateSessionCalendarEvent } from "@/lib/google-calendar";
import { sendPrivateSessionAvailabilityTransactionalEmails } from "@/lib/transactional-email";
import { sendPrivateSessionAvailabilityAdminPushoverAlert } from "@/lib/pushover";
import { waiverVersion } from "@/lib/waiver-content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getRequestIpAddress(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const vercelForwardedFor = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();

  return forwardedFor || realIp || vercelForwardedFor || "";
}

function validateEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    privateSessionId?: string;
    playerName?: string;
    playerAge?: string;
    parentName?: string;
    parentEmail?: string;
    parentPhone?: string;
    paymentMethod?: "card" | "zelle";
    notes?: string;
    medicalNotes?: string;
    emergencyName?: string;
    emergencyPhone?: string;
    guardianSignature?: string;
    waiverAccepted?: boolean;
    mediaConsent?: "Granted" | "Declined";
    marketingOptIn?: boolean;
  } | null;

  const parentEmail = payload?.parentEmail?.trim().toLowerCase() || "";
  const playerName = payload?.playerName?.trim() || "";
  const playerAge = payload?.playerAge?.trim() || "";
  const parentName = payload?.parentName?.trim() || "";
  const parentPhone = payload?.parentPhone?.trim() || "";
  const privateSessionId = payload?.privateSessionId?.trim() || "";
  const paymentMethod = payload?.paymentMethod === "zelle" ? "zelle" : "card";

  if (!privateSessionId) {
    return NextResponse.json({ error: "Choose an available private session time." }, { status: 400 });
  }

  if (!playerName || !playerAge || !parentName || !parentPhone || !validateEmail(parentEmail)) {
    return NextResponse.json({ error: "Complete the player and parent information before continuing." }, { status: 400 });
  }

  if (
    !payload?.emergencyName?.trim() ||
    !payload.emergencyPhone?.trim() ||
    !payload.medicalNotes?.trim() ||
    !payload.guardianSignature?.trim() ||
    !payload.waiverAccepted ||
    !payload.mediaConsent
  ) {
    return NextResponse.json({ error: "Complete the emergency details and signed waiver before payment." }, { status: 400 });
  }

  const availablePrivateSessions = await listPublicBookingPrivateSessionAvailability();
  const privateSession = availablePrivateSessions.find((session) => session.id === privateSessionId);

  if (!privateSession) {
    return NextResponse.json(
      { error: "That private session time is no longer available. Please choose another time." },
      { status: 400 }
    );
  }

  const signedAt = new Date().toISOString();
  const ipAddress = getRequestIpAddress(request);

  try {
    if (paymentMethod === "zelle") {
      const bookedPrivateSession = await bookPrivateSessionAvailability({
        privateSessionId,
        customPaymentLinkId: null,
        playerName,
        playerAge,
        parentName,
        parentEmail,
        parentPhone,
        paymentMethod: "zelle",
        paymentStatus: "zelle_pending",
        amountPaid: sessionUnitAmountCents,
        waiverSigned: true,
        typedSignature: payload.guardianSignature.trim(),
        signedAt,
        waiverVersion,
        mediaConsent: payload.mediaConsent,
        emergencyName: payload.emergencyName.trim(),
        emergencyPhone: payload.emergencyPhone.trim(),
        medicalNotes: payload.medicalNotes.trim(),
        ipAddress
      });
      const calendarResult = await syncBookedPrivateSessionCalendarEvent(bookedPrivateSession);
      const withCalendarStatus =
        (await updatePrivateSessionAvailability(bookedPrivateSession.id, {
          google_calendar_event_id: calendarResult.eventId || bookedPrivateSession.google_calendar_event_id || null,
          calendar_status: calendarResult.status,
          calendar_message: calendarResult.message || null
        })) ?? bookedPrivateSession;
      const emailResult = await sendPrivateSessionAvailabilityTransactionalEmails(withCalendarStatus);
      const withEmailStatus =
        (await updatePrivateSessionAvailability(withCalendarStatus.id, {
          email_status: emailResult.sent ? "sent" : "failed",
          email_message: emailResult.message || null
        })) ?? withCalendarStatus;
      const pushoverResult = await sendPrivateSessionAvailabilityAdminPushoverAlert(withEmailStatus);
      await updatePrivateSessionAvailability(withEmailStatus.id, {
        pushover_status: pushoverResult.sent ? "sent" : pushoverResult.skipped ? "skipped" : "failed",
        pushover_message: pushoverResult.message || null
      });

      return NextResponse.json({
        status: "zelle_pending",
        message: "Your waiver has been submitted. Zelle payment must be confirmed manually.",
        zellePhone: "3236848024",
        memo: `${playerName} - Private Session`,
        amountDue: sessionUnitAmountCents
      });
    }

    const stripeDiagnostics = getStripeEnvironmentDiagnostics();

    console.info("[EST Stripe] Creating checkout session", {
      purchaseType: "public_private_session",
      privateSessionId,
      stripeMode: stripeDiagnostics.stripeMode,
      amountCents: sessionUnitAmountCents
    });

    const checkout = await createStripePublicPrivateSessionCheckoutSession({
      privateSession,
      parentEmail,
      playerName,
      amountCents: sessionUnitAmountCents
    });

    await bookPrivateSessionAvailability({
      privateSessionId,
      customPaymentLinkId: null,
      playerName,
      playerAge,
      parentName,
      parentEmail,
      parentPhone,
      paymentMethod: "card",
      paymentStatus: "pending_card_payment",
      checkoutSessionId: checkout.id,
      amountPaid: 0,
      waiverSigned: true,
      typedSignature: payload.guardianSignature.trim(),
      signedAt,
      waiverVersion,
      mediaConsent: payload.mediaConsent,
      emergencyName: payload.emergencyName.trim(),
      emergencyPhone: payload.emergencyPhone.trim(),
      medicalNotes: payload.medicalNotes.trim(),
      ipAddress
    });

    console.info("[EST Stripe] Redirecting to Stripe Checkout", {
      purchaseType: "public_private_session",
      privateSessionId,
      sessionId: checkout.id
    });

    return NextResponse.json({
      checkoutUrl: checkout.url,
      sessionId: checkout.id,
      privateSessionId
    });
  } catch (error) {
    console.error("[EST Stripe] Public private session checkout could not be started", {
      privateSessionId,
      error: error instanceof Error ? error.message : String(error)
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Private session payment could not be started." },
      { status: 500 }
    );
  }
}

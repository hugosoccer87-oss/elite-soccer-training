import { NextResponse } from "next/server";
import { getTrainingGroup } from "@/lib/booking-data";
import type { BookingRecord, TrainingGroupId } from "@/lib/booking-data";
import { sessionUnitAmountCents } from "@/lib/pricing";
import { createStripeCustomPaymentLinkCheckoutSession, getStripeEnvironmentDiagnostics } from "@/lib/stripe";
import {
  attachPassStripeCheckoutSession,
  attachStripeCheckoutSession,
  createPendingBooking,
  createPendingPassPurchase,
  customPaymentLinkPassType,
  getCustomPaymentLinkByToken,
  getSupabaseAvailability,
  updateCustomPaymentLink
} from "@/lib/supabase-db";
import { waiverVersion } from "@/lib/waiver-content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getRequestIpAddress(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const vercelForwardedFor = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();

  return forwardedFor || realIp || vercelForwardedFor || "";
}

function selectedIds(value: unknown) {
  return Array.isArray(value)
    ? Array.from(new Set(value.filter((id): id is string => typeof id === "string" && Boolean(id.trim())).map((id) => id.trim())))
    : [];
}

function validateEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function requiresWaiver(selectedSessionCount: number) {
  return selectedSessionCount > 0;
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const payload = (await request.json().catch(() => null)) as {
    selectedSessionIds?: unknown;
    notes?: string;
    medicalNotes?: string;
    emergencyName?: string;
    emergencyPhone?: string;
    guardianSignature?: string;
    waiverAccepted?: boolean;
    mediaConsent?: "Granted" | "Declined";
  } | null;
  const details = await getCustomPaymentLinkByToken(token);

  if (!details) {
    return NextResponse.json({ error: "This private payment link was not found." }, { status: 404 });
  }

  const link = details.link;

  if (link.status === "cancelled") {
    return NextResponse.json({ error: "This private payment link has been cancelled." }, { status: 410 });
  }

  if (["paid", "partially_scheduled", "fully_scheduled"].includes(link.status)) {
    return NextResponse.json({ error: "This private payment link has already been paid." }, { status: 409 });
  }

  if (!validateEmail(link.parent_email)) {
    return NextResponse.json({ error: "The parent email on this private link is invalid." }, { status: 400 });
  }

  try {
    const requestedSessionIds = selectedIds(payload?.selectedSessionIds);
    const passType = customPaymentLinkPassType(link.plan_type);
    const maxSessionCount =
      link.plan_type === "single_session" ? 1 : passType ? Number(link.total_credits) || 0 : 0;

    if (link.link_mode === "payment_only" || link.plan_type === "private_1_on_1" || link.plan_type === "custom_amount") {
      if (requestedSessionIds.length > 0) {
        return NextResponse.json(
          { error: "This private link is payment-only and does not book public small-group sessions." },
          { status: 400 }
        );
      }
    } else {
      if (requestedSessionIds.length < 1) {
        return NextResponse.json({ error: "Choose at least one session before continuing to payment." }, { status: 400 });
      }

      if (maxSessionCount > 0 && requestedSessionIds.length > maxSessionCount) {
        return NextResponse.json(
          { error: "You have used all available training credits. Please purchase another session or package to continue booking." },
          { status: 400 }
        );
      }
    }

    if (link.link_mode === "payment_plus_confirm_proposed_schedule") {
      const proposed = new Set(link.proposed_session_ids ?? []);
      const outsideProposal = requestedSessionIds.find((sessionId) => !proposed.has(sessionId));

      if (outsideProposal) {
        return NextResponse.json({ error: "Choose only the sessions Coach Hugo included in this private link." }, { status: 400 });
      }
    }

    if (requiresWaiver(requestedSessionIds.length)) {
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
    }

    let passPurchaseId: string | undefined;
    let bookingId: string | undefined;
    let bookingIds: string[] = [];
    const availability = await getSupabaseAvailability();

    if (requestedSessionIds.length > 0) {
      const availableById = new Map(availability.sessions.map((session) => [session.id, session]));
      const invalidSession = requestedSessionIds.find((sessionId) => {
        const session = availableById.get(sessionId);

        return !session || session.trainingGroupId !== link.training_group || session.remainingSpots < 1;
      });

      if (invalidSession) {
        return NextResponse.json(
          { error: "One or more selected sessions are no longer available. Please refresh this link and choose again." },
          { status: 400 }
        );
      }
    }

    if (passType) {
      const pass = await createPendingPassPurchase({
        parentName: link.parent_name,
        parentEmail: link.parent_email,
        parentPhone: link.parent_phone,
        playerName: link.player_name,
        playerAge: link.player_age,
        trainingGroup: link.training_group,
        passType,
        selectedSessionIds: requestedSessionIds,
        bookingDetails:
          requestedSessionIds.length > 0
            ? {
                notes: payload?.notes?.trim() ?? link.notes_to_parent ?? "",
                medicalNotes: payload?.medicalNotes?.trim() ?? "",
                emergencyName: payload?.emergencyName?.trim() ?? "",
                emergencyPhone: payload?.emergencyPhone?.trim() ?? "",
                guardianSignature: payload?.guardianSignature?.trim() ?? "",
                waiverAccepted: Boolean(payload?.waiverAccepted),
                waiverAcceptedAt: new Date().toISOString(),
                waiverVersion,
                mediaConsent: payload?.mediaConsent,
                ipAddress: getRequestIpAddress(request)
              }
            : {
                notes: link.notes_to_parent ?? ""
              }
      });
      passPurchaseId = pass.id;
    } else if (link.plan_type === "single_session" && requestedSessionIds.length === 1) {
      const publicSession = availability.sessions.find((session) => session.id === requestedSessionIds[0]);
      const group = getTrainingGroup((publicSession?.trainingGroupId || link.training_group) as TrainingGroupId);

      if (!publicSession) {
        return NextResponse.json({ error: "That session is no longer available." }, { status: 400 });
      }

      const rawBooking: BookingRecord = {
        id: `CUSTOM-${link.id}`,
        createdAt: new Date().toISOString(),
        parentName: link.parent_name,
        playerName: link.player_name,
        playerAge: link.player_age,
        phone: link.parent_phone,
        email: link.parent_email,
        players: "1",
        notes: payload?.notes?.trim() ?? link.notes_to_parent ?? "",
        medicalNotes: payload?.medicalNotes?.trim() ?? "",
        emergencyName: payload?.emergencyName?.trim() ?? "",
        emergencyPhone: payload?.emergencyPhone?.trim() ?? "",
        guardianSignature: payload?.guardianSignature?.trim() ?? "",
        waiverAccepted: Boolean(payload?.waiverAccepted),
        waiverAcceptedAt: new Date().toISOString(),
        waiverVersion,
        ipAddress: getRequestIpAddress(request),
        mediaConsent: payload?.mediaConsent === "Declined" ? "Declined" : "Granted",
        programId: publicSession.trainingGroupId,
        programName: publicSession.trainingFocus ? `${publicSession.trainingFocus} - ${group.name}` : group.name,
        sessionId: publicSession.id,
        sessionDateIso: publicSession.date,
        sessionDate: publicSession.dateLabel,
        sessionTime: publicSession.startTime,
        sessionDurationMinutes: 60,
        paymentStatus: "pending_payment",
        notificationStatus: "Ready",
        calendarStatus: "Ready",
        paymentType: "single_session"
      };
      const created = await createPendingBooking(rawBooking, getRequestIpAddress(request));
      bookingId = created.booking.id;
      bookingIds = [bookingId];
    }

    const stripeDiagnostics = getStripeEnvironmentDiagnostics();

    console.info("[EST Stripe] Creating checkout session", {
      purchaseType: "custom_payment_link",
      customPaymentLinkId: link.id,
      planType: link.plan_type,
      stripeMode: stripeDiagnostics.stripeMode,
      amountCents: link.amount_cents
    });

    const checkout = await createStripeCustomPaymentLinkCheckoutSession(link, {
      passPurchaseId,
      bookingId,
      selectedSessionCount: requestedSessionIds.length
    });

    if (passPurchaseId) {
      await attachPassStripeCheckoutSession(passPurchaseId, checkout.id);
    }

    if (bookingId) {
      await attachStripeCheckoutSession(bookingId, checkout.id);
    }

    await updateCustomPaymentLink({
      id: link.id,
      selectedSessionIds: requestedSessionIds,
      passPurchaseId: passPurchaseId ?? null,
      bookingIds,
      checkoutSessionId: checkout.id,
      creditsUsed: requestedSessionIds.length,
      creditsRemaining: Math.max(0, (Number(link.total_credits) || 0) - requestedSessionIds.length)
    });

    console.info("[EST Stripe] Redirecting to Stripe Checkout", {
      purchaseType: "custom_payment_link",
      customPaymentLinkId: link.id,
      sessionId: checkout.id
    });

    return NextResponse.json({
      checkoutUrl: checkout.url,
      sessionId: checkout.id,
      customPaymentLinkId: link.id
    });
  } catch (error) {
    console.error("[EST Stripe] Custom payment link checkout could not be started", {
      customPaymentLinkId: link.id,
      error: error instanceof Error ? error.message : String(error),
      expectedAmount: sessionUnitAmountCents
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "This private payment link could not be started." },
      { status: 500 }
    );
  }
}

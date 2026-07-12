import { NextResponse } from "next/server";
import { getTrainingGroup } from "@/lib/booking-data";
import type { BookingRecord, TrainingGroupId } from "@/lib/booking-data";
import { sessionUnitAmountCents } from "@/lib/pricing";
import { createStripeCustomPaymentLinkCheckoutSession, getStripeEnvironmentDiagnostics } from "@/lib/stripe";
import {
  attachPassStripeCheckoutSession,
  attachStripeCheckoutSession,
  bookPrivateSessionAvailability,
  createPendingBooking,
  createPendingPassPurchase,
  customPaymentLinkOptionMeta,
  customPaymentLinkPassType,
  getCustomPaymentLinkByToken,
  listPublicPrivateSessionAvailability,
  getSupabaseAvailability,
  normalizeCustomPaymentLinkOptions,
  updatePrivateSessionAvailability,
  updateCustomPaymentLink
} from "@/lib/supabase-db";
import type { CustomPaymentLinkPlanType } from "@/lib/supabase-db";
import { waiverVersion } from "@/lib/waiver-content";
import { syncBookedPrivateSessionCalendarEvent } from "@/lib/google-calendar";
import { sendPrivateSessionAvailabilityTransactionalEmails } from "@/lib/transactional-email";
import { sendPrivateSessionAvailabilityAdminPushoverAlert } from "@/lib/pushover";

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

function planLabelsForMemo(planType: string) {
  if (planType === "four_session_training_package") return "4-Session Training Package";
  if (planType === "six_session_training_package") return "6-Session Training Package";
  if (planType === "private_1_on_1") return "Private Session";
  if (planType === "custom_amount") return "Custom Payment";
  return "Single Session";
}

function isAllowedSelectedPlan(value: unknown, allowed: CustomPaymentLinkPlanType[]): value is CustomPaymentLinkPlanType {
  return typeof value === "string" && allowed.includes(value as CustomPaymentLinkPlanType);
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const payload = (await request.json().catch(() => null)) as {
    selectedSessionIds?: unknown;
    selectedPrivateSessionIds?: unknown;
    selectedPlanType?: CustomPaymentLinkPlanType;
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
  } | null;
  const details = await getCustomPaymentLinkByToken(token);

  if (!details) {
    return NextResponse.json({ error: "This private payment link was not found." }, { status: 404 });
  }

  const link = details.link;
  const isPrivateSessionLink = link.link_mode === "payment_plus_choose_private_sessions";

  if (link.status === "cancelled") {
    return NextResponse.json({ error: "This private payment link has been cancelled." }, { status: 410 });
  }

  if (["paid", "partially_scheduled", "fully_scheduled"].includes(link.status)) {
    return NextResponse.json({ error: "This private payment link has already been paid." }, { status: 409 });
  }

  if (!isPrivateSessionLink && !validateEmail(link.parent_email)) {
    return NextResponse.json({ error: "The parent email on this private link is invalid." }, { status: 400 });
  }

  try {
    const requestedSessionIds = selectedIds(payload?.selectedSessionIds);
    const requestedPrivateSessionIds = selectedIds(payload?.selectedPrivateSessionIds);
    const allowedPurchaseOptions = normalizeCustomPaymentLinkOptions(link.allowed_purchase_options, link.plan_type);
    const selectedPlanType = isAllowedSelectedPlan(payload?.selectedPlanType, allowedPurchaseOptions)
      ? payload.selectedPlanType
      : allowedPurchaseOptions[0] ?? link.plan_type;
    const selectedOption = customPaymentLinkOptionMeta(
      selectedPlanType,
      link.private_session_amount_cents ?? 0,
      link.amount_cents
    );
    const passType = customPaymentLinkPassType(selectedPlanType);
    const maxSessionCount =
      selectedPlanType === "single_session" || selectedPlanType === "private_1_on_1"
        ? 1
        : passType
          ? Number(selectedOption.credits) || 0
          : 0;
    const parentPlayerInfo = {
      playerName: payload?.playerName?.trim() || link.player_name,
      playerAge: payload?.playerAge?.trim() || link.player_age,
      parentName: payload?.parentName?.trim() || link.parent_name,
      parentEmail: payload?.parentEmail?.trim().toLowerCase() || link.parent_email,
      parentPhone: payload?.parentPhone?.trim() || link.parent_phone
    };
    const selectedPaymentMethod: "card" | "zelle" = payload?.paymentMethod === "zelle" ? "zelle" : "card";
    const selectedUsesPrivateSessions = selectedPlanType === "private_1_on_1";
    const signedAt = new Date().toISOString();
    const ipAddress = getRequestIpAddress(request);

    if (link.link_mode === "payment_only" || selectedPlanType === "custom_amount") {
      if (requestedSessionIds.length > 0 || requestedPrivateSessionIds.length > 0) {
        return NextResponse.json(
          { error: "This private link is payment-only and does not book sessions." },
          { status: 400 }
        );
      }
    } else if (selectedUsesPrivateSessions) {
      if (requestedSessionIds.length > 0) {
        return NextResponse.json(
          { error: "This private link can only book private session openings created by Coach Hugo." },
          { status: 400 }
        );
      }

      if (requestedPrivateSessionIds.length < 1) {
        return NextResponse.json({ error: "Choose at least one private session time before continuing to payment." }, { status: 400 });
      }

      if (maxSessionCount > 0 && requestedPrivateSessionIds.length > maxSessionCount) {
        return NextResponse.json(
          { error: "You have used all available training credits. Please purchase another session or package to continue booking." },
          { status: 400 }
        );
      }

    } else {
      if (requestedPrivateSessionIds.length > 0) {
        return NextResponse.json(
          { error: "This private link is not set up for private session openings." },
          { status: 400 }
        );
      }

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

    if (
      !parentPlayerInfo.playerName ||
      parentPlayerInfo.playerName === "Parent will complete" ||
      !parentPlayerInfo.playerAge ||
      parentPlayerInfo.playerAge === "Parent will complete" ||
      !parentPlayerInfo.parentName ||
      parentPlayerInfo.parentName === "Parent will complete" ||
      !parentPlayerInfo.parentPhone ||
      parentPlayerInfo.parentPhone === "Parent will complete" ||
      !validateEmail(parentPlayerInfo.parentEmail) ||
      parentPlayerInfo.parentEmail === "pending@elitesoccertrainingcv.com"
    ) {
      return NextResponse.json({ error: "Complete the player and parent information before continuing." }, { status: 400 });
    }

    if (link.link_mode === "payment_plus_confirm_proposed_schedule") {
      const proposed = new Set(link.proposed_session_ids ?? []);
      const outsideProposal = requestedSessionIds.find((sessionId) => !proposed.has(sessionId));

      if (outsideProposal) {
        return NextResponse.json({ error: "Choose only the sessions Coach Hugo included in this private link." }, { status: 400 });
      }
    }

    if (requiresWaiver(1)) {
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
    const privateAvailability = selectedUsesPrivateSessions ? await listPublicPrivateSessionAvailability() : [];

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

    if (requestedPrivateSessionIds.length > 0) {
      const availablePrivateById = new Map(privateAvailability.map((session) => [session.id, session]));
      const invalidPrivateSession = requestedPrivateSessionIds.find((sessionId) => !availablePrivateById.has(sessionId));

      if (invalidPrivateSession) {
        return NextResponse.json(
          { error: "One or more private session times are no longer available. Please refresh this link and choose again." },
          { status: 400 }
        );
      }
    }

    if (selectedUsesPrivateSessions) {
      const baseLinkUpdate = {
        id: link.id,
        selectedPrivateSessionIds: requestedPrivateSessionIds,
        selectedPaymentMethod,
        selectedPlanType,
        selectedAmountCents: selectedOption.amountCents,
        selectedTotalCredits: selectedOption.credits,
        playerName: parentPlayerInfo.playerName,
        playerAge: parentPlayerInfo.playerAge,
        parentName: parentPlayerInfo.parentName,
        parentEmail: parentPlayerInfo.parentEmail,
        parentPhone: parentPlayerInfo.parentPhone,
        emergencyName: payload?.emergencyName?.trim() || "",
        emergencyPhone: payload?.emergencyPhone?.trim() || "",
        medicalNotes: payload?.medicalNotes?.trim() || "",
        waiverSigned: true,
        typedSignature: payload?.guardianSignature?.trim() || "",
        signedAt,
        waiverVersion,
        mediaConsent: payload?.mediaConsent,
        ipAddress,
        creditsUsed: requestedPrivateSessionIds.length,
        creditsRemaining: Math.max(0, (Number(selectedOption.credits) || 0) - requestedPrivateSessionIds.length)
      };

      if (selectedPaymentMethod === "zelle") {
        const amountPerPrivateSession = Math.round(
          (Number(selectedOption.amountCents) || 0) / Math.max(1, requestedPrivateSessionIds.length)
        );
        const bookedPrivateSessions = [];

        for (const privateSessionId of requestedPrivateSessionIds) {
          const bookedPrivateSession = await bookPrivateSessionAvailability({
            privateSessionId,
            customPaymentLinkId: link.id,
            playerName: parentPlayerInfo.playerName,
            playerAge: parentPlayerInfo.playerAge,
            parentName: parentPlayerInfo.parentName,
            parentEmail: parentPlayerInfo.parentEmail,
            parentPhone: parentPlayerInfo.parentPhone,
            paymentMethod: "zelle",
            paymentStatus: "zelle_pending",
            amountPaid: amountPerPrivateSession,
            waiverSigned: true,
            typedSignature: payload?.guardianSignature?.trim() || "",
            signedAt,
            waiverVersion,
            mediaConsent: payload?.mediaConsent,
            emergencyName: payload?.emergencyName?.trim() || "",
            emergencyPhone: payload?.emergencyPhone?.trim() || "",
            medicalNotes: payload?.medicalNotes?.trim() || "",
            ipAddress
          });

          const calendarResult = await syncBookedPrivateSessionCalendarEvent(bookedPrivateSession);
          const withCalendarStatus = await updatePrivateSessionAvailability(bookedPrivateSession.id, {
            google_calendar_event_id: calendarResult.eventId || bookedPrivateSession.google_calendar_event_id || null,
            calendar_status: calendarResult.status,
            calendar_message: calendarResult.message || null
          }) ?? bookedPrivateSession;
          const emailResult = await sendPrivateSessionAvailabilityTransactionalEmails(withCalendarStatus);
          const withEmailStatus = await updatePrivateSessionAvailability(withCalendarStatus.id, {
            email_status: emailResult.sent ? "sent" : "failed",
            email_message: emailResult.message || null
          }) ?? withCalendarStatus;
          const pushoverResult = await sendPrivateSessionAvailabilityAdminPushoverAlert(withEmailStatus);
          const finalPrivateSession = await updatePrivateSessionAvailability(withEmailStatus.id, {
            pushover_status: pushoverResult.sent ? "sent" : pushoverResult.skipped ? "skipped" : "failed",
            pushover_message: pushoverResult.message || null
          }) ?? withEmailStatus;

          bookedPrivateSessions.push(finalPrivateSession);
        }

        await updateCustomPaymentLink({
          ...baseLinkUpdate,
          status: requestedPrivateSessionIds.length >= (Number(selectedOption.credits) || 0) ? "fully_scheduled" : "partially_scheduled",
          paymentStatus: "zelle_pending"
        });

        return NextResponse.json({
          status: "zelle_pending",
          message: "Your waiver has been submitted. Zelle payment must be confirmed manually.",
          zellePhone: "3236848024",
          memo: `${parentPlayerInfo.playerName} - ${planLabelsForMemo(selectedPlanType)}`,
          amountDue: selectedOption.amountCents,
          privateSessionsBooked: bookedPrivateSessions.length
        });
      }

      const updatedLink = await updateCustomPaymentLink({
        ...baseLinkUpdate,
        status: link.status,
        paymentStatus: "pending_card_payment"
      });

      if (!updatedLink) {
        return NextResponse.json({ error: "This private payment link could not be updated." }, { status: 500 });
      }

      const stripeDiagnostics = getStripeEnvironmentDiagnostics();

      console.info("[EST Stripe] Creating checkout session", {
        purchaseType: "custom_payment_link",
        customPaymentLinkId: updatedLink.id,
        planType: updatedLink.plan_type,
        stripeMode: stripeDiagnostics.stripeMode,
        amountCents: selectedOption.amountCents
      });

      const checkout = await createStripeCustomPaymentLinkCheckoutSession(updatedLink, {
        selectedSessionCount: requestedPrivateSessionIds.length
      });

      await updateCustomPaymentLink({
        id: updatedLink.id,
        checkoutSessionId: checkout.id,
        paymentStatus: "pending_card_payment"
      });

      console.info("[EST Stripe] Redirecting to Stripe Checkout", {
        purchaseType: "custom_payment_link",
        customPaymentLinkId: updatedLink.id,
        sessionId: checkout.id
      });

      return NextResponse.json({
        checkoutUrl: checkout.url,
        sessionId: checkout.id,
        customPaymentLinkId: updatedLink.id
      });
    }

    if (passType) {
      const pass = await createPendingPassPurchase({
        parentName: parentPlayerInfo.parentName,
        parentEmail: parentPlayerInfo.parentEmail,
        parentPhone: parentPlayerInfo.parentPhone,
        playerName: parentPlayerInfo.playerName,
        playerAge: parentPlayerInfo.playerAge,
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
    } else if (selectedPlanType === "single_session" && requestedSessionIds.length === 1) {
      const publicSession = availability.sessions.find((session) => session.id === requestedSessionIds[0]);
      const group = getTrainingGroup((publicSession?.trainingGroupId || link.training_group) as TrainingGroupId);

      if (!publicSession) {
        return NextResponse.json({ error: "That session is no longer available." }, { status: 400 });
      }

      const rawBooking: BookingRecord = {
        id: `CUSTOM-${link.id}`,
        createdAt: new Date().toISOString(),
        parentName: parentPlayerInfo.parentName,
        playerName: parentPlayerInfo.playerName,
        playerAge: parentPlayerInfo.playerAge,
        phone: parentPlayerInfo.parentPhone,
        email: parentPlayerInfo.parentEmail,
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

    const baseLinkUpdate = {
      id: link.id,
      selectedSessionIds: requestedSessionIds,
      selectedPrivateSessionIds: requestedPrivateSessionIds,
      selectedPaymentMethod,
      selectedPlanType,
      selectedAmountCents: selectedOption.amountCents,
      selectedTotalCredits: selectedOption.credits,
      playerName: parentPlayerInfo.playerName,
      playerAge: parentPlayerInfo.playerAge,
      parentName: parentPlayerInfo.parentName,
      parentEmail: parentPlayerInfo.parentEmail,
      parentPhone: parentPlayerInfo.parentPhone,
      emergencyName: payload?.emergencyName?.trim() || "",
      emergencyPhone: payload?.emergencyPhone?.trim() || "",
      medicalNotes: payload?.medicalNotes?.trim() || "",
      waiverSigned: true,
      typedSignature: payload?.guardianSignature?.trim() || "",
      signedAt,
      waiverVersion,
      mediaConsent: payload?.mediaConsent,
      ipAddress,
      passPurchaseId: passPurchaseId ?? null,
      bookingIds,
      creditsUsed: requestedSessionIds.length,
      creditsRemaining: Math.max(0, (Number(selectedOption.credits) || 0) - requestedSessionIds.length)
    };

    if (selectedPaymentMethod === "zelle") {
      await updateCustomPaymentLink({
        ...baseLinkUpdate,
        status: requestedSessionIds.length > 0 ? "partially_scheduled" : "viewed",
        paymentStatus: "zelle_pending"
      });

      return NextResponse.json({
        status: "zelle_pending",
        message: "Your waiver has been submitted. Zelle payment must be confirmed manually.",
        zellePhone: "3236848024",
        memo: `${parentPlayerInfo.playerName} - ${planLabelsForMemo(selectedPlanType)}`,
        amountDue: selectedOption.amountCents
      });
    }

    const updatedLink = await updateCustomPaymentLink({
      ...baseLinkUpdate,
      status: link.status,
      paymentStatus: "pending_card_payment"
    });

    if (!updatedLink) {
      return NextResponse.json({ error: "This private payment link could not be updated." }, { status: 500 });
    }

    const stripeDiagnostics = getStripeEnvironmentDiagnostics();

    console.info("[EST Stripe] Creating checkout session", {
      purchaseType: "custom_payment_link",
      customPaymentLinkId: updatedLink.id,
      planType: selectedPlanType,
      stripeMode: stripeDiagnostics.stripeMode,
      amountCents: selectedOption.amountCents
    });

    const checkout = await createStripeCustomPaymentLinkCheckoutSession(updatedLink, {
      passPurchaseId,
      bookingId,
      selectedSessionCount: requestedSessionIds.length + requestedPrivateSessionIds.length
    });

    if (passPurchaseId) {
      await attachPassStripeCheckoutSession(passPurchaseId, checkout.id);
    }

    if (bookingId) {
      await attachStripeCheckoutSession(bookingId, checkout.id);
    }

    await updateCustomPaymentLink({
      id: updatedLink.id,
      checkoutSessionId: checkout.id,
      paymentStatus: "pending_card_payment"
    });

    console.info("[EST Stripe] Redirecting to Stripe Checkout", {
      purchaseType: "custom_payment_link",
      customPaymentLinkId: updatedLink.id,
      sessionId: checkout.id
    });

    return NextResponse.json({
      checkoutUrl: checkout.url,
      sessionId: checkout.id,
      customPaymentLinkId: updatedLink.id
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

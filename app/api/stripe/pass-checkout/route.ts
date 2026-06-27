import { NextResponse } from "next/server";
import { trainingGroups, type TrainingGroupId } from "@/lib/booking-data";
import { type LaunchPassType, launchPassOptions } from "@/lib/pricing";
import { createStripeLaunchPassCheckoutSession, getStripeEnvironmentDiagnostics } from "@/lib/stripe";
import {
  attachPassStripeCheckoutSession,
  createPendingPassPurchase,
  getSupabaseAvailability,
  saveEmailSubscriberOptIn
} from "@/lib/supabase-db";
import { waiverVersion } from "@/lib/waiver-content";

export const runtime = "nodejs";

function isTrainingGroupId(value: string): value is TrainingGroupId {
  return trainingGroups.some((group) => group.id === value);
}

function isLaunchPassType(value: string): value is LaunchPassType {
  return value in launchPassOptions;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function getRequestIpAddress(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const vercelForwardedFor = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();

  return forwardedFor || realIp || vercelForwardedFor || "";
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    parentName?: string;
    parentEmail?: string;
    parentPhone?: string;
    playerName?: string;
    playerAge?: string;
    trainingGroup?: string;
    passType?: string;
    selectedSessionIds?: unknown;
    bookingDetails?: {
      notes?: string;
      medicalNotes?: string;
      emergencyName?: string;
      emergencyPhone?: string;
      guardianSignature?: string;
      waiverAccepted?: boolean;
      waiverAcceptedAt?: string;
      mediaConsent?: "Granted" | "Declined";
    };
    marketingOptIn?: boolean;
  } | null;

  if (
    !payload?.parentName?.trim() ||
    !payload.parentEmail?.trim() ||
    !isValidEmail(payload.parentEmail) ||
    !payload.parentPhone?.trim() ||
    !payload.playerName?.trim() ||
    !payload.playerAge?.trim() ||
    !payload.trainingGroup ||
    !isTrainingGroupId(payload.trainingGroup) ||
    !payload.passType ||
    !isLaunchPassType(payload.passType)
  ) {
    return NextResponse.json({ error: "Complete all Launch Pass purchase fields before payment." }, { status: 400 });
  }

  try {
    const passType = payload.passType;
    const option = launchPassOptions[passType];
    const selectedSessionIds = Array.isArray(payload.selectedSessionIds)
      ? Array.from(
          new Set(
            payload.selectedSessionIds
              .filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
              .map((id) => id.trim())
          )
        )
      : [];

    if (selectedSessionIds.length > option.credits) {
      return NextResponse.json(
        { error: `Choose no more than ${option.credits} sessions for this Launch Pass.` },
        { status: 400 }
      );
    }

    if (selectedSessionIds.length > 0) {
      const availability = await getSupabaseAvailability();
      const availableById = new Map(availability.sessions.map((session) => [session.id, session]));
      const invalidSession = selectedSessionIds.find((sessionId) => {
        const session = availableById.get(sessionId);

        return !session || session.trainingGroupId !== payload.trainingGroup || session.remainingSpots < 1;
      });

      if (invalidSession) {
        return NextResponse.json(
          { error: "One or more selected sessions are no longer available for this Launch Pass." },
          { status: 400 }
        );
      }

      if (
        !payload.bookingDetails?.emergencyName?.trim() ||
        !payload.bookingDetails.emergencyPhone?.trim() ||
        !payload.bookingDetails.medicalNotes?.trim() ||
        !payload.bookingDetails.guardianSignature?.trim() ||
        !payload.bookingDetails.waiverAccepted ||
        !payload.bookingDetails.mediaConsent
      ) {
        return NextResponse.json(
          { error: "Complete the emergency details and signed waiver before choosing sessions with a Launch Pass." },
          { status: 400 }
        );
      }
    }

    const pass = await createPendingPassPurchase({
      parentName: payload.parentName,
      parentEmail: payload.parentEmail,
      parentPhone: payload.parentPhone,
      playerName: payload.playerName,
      playerAge: payload.playerAge,
      trainingGroup: payload.trainingGroup,
      passType,
      selectedSessionIds,
      bookingDetails:
        selectedSessionIds.length > 0
          ? {
              notes: payload.bookingDetails?.notes?.trim() ?? "",
              medicalNotes: payload.bookingDetails?.medicalNotes?.trim() ?? "",
              emergencyName: payload.bookingDetails?.emergencyName?.trim() ?? "",
              emergencyPhone: payload.bookingDetails?.emergencyPhone?.trim() ?? "",
              guardianSignature: payload.bookingDetails?.guardianSignature?.trim() ?? "",
              waiverAccepted: Boolean(payload.bookingDetails?.waiverAccepted),
              waiverAcceptedAt: payload.bookingDetails?.waiverAcceptedAt || new Date().toISOString(),
              waiverVersion,
              mediaConsent: payload.bookingDetails?.mediaConsent,
              ipAddress: getRequestIpAddress(request)
            }
          : {}
    });

    const stripeDiagnostics = getStripeEnvironmentDiagnostics();

    console.info("[EST Stripe] Creating checkout session", {
      purchaseType: "launch_pass",
      passPurchaseId: pass.id,
      passType: pass.pass_type,
      playerName: pass.player_name,
      stripeMode: stripeDiagnostics.stripeMode,
      hasPublishableKey: stripeDiagnostics.publishableKeyConfigured
    });

    const session = await createStripeLaunchPassCheckoutSession(pass);
    await attachPassStripeCheckoutSession(pass.id, session.id);

    if (payload.marketingOptIn) {
      await saveEmailSubscriberOptIn({
        parentName: pass.parent_name,
        email: pass.parent_email,
        phone: pass.parent_phone,
        playerName: pass.player_name,
        playerAge: pass.player_age,
        source: selectedSessionIds.length > 0 ? "launch_pass_with_sessions" : "launch_pass_purchase"
      });
    }

    console.info("[EST Stripe] Redirecting to Stripe Checkout", {
      purchaseType: "launch_pass",
      passPurchaseId: pass.id,
      sessionId: session.id
    });

    return NextResponse.json({
      checkoutUrl: session.url,
      sessionId: session.id,
      passPurchaseId: pass.id
    });
  } catch (error) {
    console.error("[EST Stripe] Failed to create Launch Pass Checkout session", {
      error: error instanceof Error ? error.message : String(error)
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Launch Pass checkout could not be started."
      },
      { status: 500 }
    );
  }
}

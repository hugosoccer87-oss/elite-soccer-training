import { NextResponse } from "next/server";
import { trainingGroups, type TrainingGroupId } from "@/lib/booking-data";
import { type LaunchPassType, launchPassOptions } from "@/lib/pricing";
import { createStripeLaunchPassCheckoutSession } from "@/lib/stripe";
import { attachPassStripeCheckoutSession, createPendingPassPurchase } from "@/lib/supabase-db";

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

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    parentName?: string;
    parentEmail?: string;
    parentPhone?: string;
    playerName?: string;
    playerAge?: string;
    trainingGroup?: string;
    passType?: string;
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
    const pass = await createPendingPassPurchase({
      parentName: payload.parentName,
      parentEmail: payload.parentEmail,
      parentPhone: payload.parentPhone,
      playerName: payload.playerName,
      playerAge: payload.playerAge,
      trainingGroup: payload.trainingGroup,
      passType: payload.passType
    });

    console.info("[EST Stripe] Creating checkout session", {
      purchaseType: "launch_pass",
      passPurchaseId: pass.id,
      passType: pass.pass_type,
      playerName: pass.player_name
    });

    const session = await createStripeLaunchPassCheckoutSession(pass);
    await attachPassStripeCheckoutSession(pass.id, session.id);

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

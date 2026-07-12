import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-api";
import { trainingGroups, type TrainingGroupId } from "@/lib/booking-data";
import {
  createCustomPaymentLink,
  listAdminCustomPaymentLinks,
  type CustomPaymentLinkMode,
  type CustomPaymentLinkPlanType
} from "@/lib/supabase-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const planTypes = new Set<CustomPaymentLinkPlanType>([
  "single_session",
  "four_session_training_package",
  "six_session_training_package",
  "private_1_on_1",
  "custom_amount"
]);

const linkModes = new Set<CustomPaymentLinkMode>([
  "payment_only",
  "payment_plus_choose_sessions",
  "payment_plus_confirm_proposed_schedule",
  "payment_plus_choose_private_sessions"
]);

function isTrainingGroupId(value: string): value is TrainingGroupId {
  return trainingGroups.some((group) => group.id === value);
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://www.elitesoccertrainingcv.com").replace(/\/$/, "");
}

export async function GET() {
  const admin = await verifyAdminSession();

  if (!admin.authenticated) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  try {
    const links = await listAdminCustomPaymentLinks();

    return NextResponse.json({ status: "Synced", links });
  } catch (error) {
    return NextResponse.json(
      { status: "Failed", error: error instanceof Error ? error.message : "Custom payment links could not be loaded." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const admin = await verifyAdminSession();

  if (!admin.authenticated) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const payload = (await request.json().catch(() => null)) as {
    playerName?: string;
    playerAge?: string;
    parentName?: string;
    parentEmail?: string;
    parentPhone?: string;
    trainingGroup?: string;
    planType?: CustomPaymentLinkPlanType;
    linkMode?: CustomPaymentLinkMode;
    amount?: number;
    notesToParent?: string;
    internalNote?: string;
    suggestedAvailability?: string;
    proposedSessionIds?: unknown;
  } | null;
  const proposedSessionIds = Array.isArray(payload?.proposedSessionIds)
    ? Array.from(new Set(payload.proposedSessionIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim()))))
    : [];
  const amountCents = Math.max(0, Math.round(Number(payload?.amount) * 100 || 0));

  if (
    !payload?.playerName?.trim() ||
    !payload.playerAge?.trim() ||
    !payload.parentName?.trim() ||
    !payload.parentEmail?.trim() ||
    !isValidEmail(payload.parentEmail) ||
    !payload.parentPhone?.trim() ||
    !payload.trainingGroup ||
    !isTrainingGroupId(payload.trainingGroup) ||
    !payload.planType ||
    !planTypes.has(payload.planType) ||
    !payload.linkMode ||
    !linkModes.has(payload.linkMode) ||
    amountCents < 50
  ) {
    return NextResponse.json({ error: "Complete all payment link fields before creating the link." }, { status: 400 });
  }

  try {
    const token = randomBytes(24).toString("hex");
    const link = await createCustomPaymentLink({
      token,
      playerName: payload.playerName,
      playerAge: payload.playerAge,
      parentName: payload.parentName,
      parentEmail: payload.parentEmail,
      parentPhone: payload.parentPhone,
      trainingGroup: payload.trainingGroup,
      planType: payload.planType,
      linkMode: payload.linkMode,
      amountCents,
      notesToParent: payload.notesToParent,
      internalNote: payload.internalNote,
      suggestedAvailability: payload.suggestedAvailability,
      proposedSessionIds
    });

    return NextResponse.json({
      status: "created",
      link,
      paymentUrl: `${siteUrl()}/custom-payment/${link.token}`
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Custom payment link could not be created." },
      { status: 500 }
    );
  }
}

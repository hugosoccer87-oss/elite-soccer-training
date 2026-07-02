import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-api";
import { trainingGroups, type TrainingGroupId } from "@/lib/booking-data";
import {
  createManualScheduleApprovalLink,
  getScheduleApprovalByToken,
  getSupabaseAvailability,
  type ScheduleApprovalPaymentMethod
} from "@/lib/supabase-db";
import { sendScheduleApprovalLinkEmail } from "@/lib/transactional-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paymentMethods = new Set<ScheduleApprovalPaymentMethod>(["cash", "zelle", "venmo", "stripe_manual", "other"]);

function isTrainingGroupId(value: string): value is TrainingGroupId {
  return trainingGroups.some((group) => group.id === value);
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://www.elitesoccertrainingcv.com").replace(/\/$/, "");
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
    amountPaid?: number;
    paymentMethod?: ScheduleApprovalPaymentMethod;
    internalNote?: string;
    proposedSessionIds?: unknown;
  } | null;
  const proposedSessionIds = Array.isArray(payload?.proposedSessionIds)
    ? Array.from(new Set(payload.proposedSessionIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim()))))
    : [];
  const amountPaid = Math.max(0, Math.round(Number(payload?.amountPaid) * 100 || 0));

  if (
    !payload?.playerName?.trim() ||
    !payload.playerAge?.trim() ||
    !payload.parentName?.trim() ||
    !payload.parentEmail?.trim() ||
    !isValidEmail(payload.parentEmail) ||
    !payload.parentPhone?.trim() ||
    !payload.trainingGroup ||
    !isTrainingGroupId(payload.trainingGroup) ||
    !payload.paymentMethod ||
    !paymentMethods.has(payload.paymentMethod) ||
    proposedSessionIds.length !== 6
  ) {
    return NextResponse.json(
      { error: "Complete the customer details and choose exactly 6 proposed sessions." },
      { status: 400 }
    );
  }

  try {
    const availability = await getSupabaseAvailability();
    const availableById = new Map(availability.sessions.map((session) => [session.id, session]));
    const unavailableSession = proposedSessionIds.find((sessionId) => {
      const session = availableById.get(sessionId);

      return !session || session.trainingGroupId !== payload.trainingGroup || session.remainingSpots < 1;
    });

    if (unavailableSession) {
      return NextResponse.json(
        { error: "One or more selected sessions is no longer available. Refresh admin and choose open sessions." },
        { status: 400 }
      );
    }

    const token = randomBytes(24).toString("hex");
    const created = await createManualScheduleApprovalLink({
      token,
      parentName: payload.parentName,
      parentEmail: payload.parentEmail,
      parentPhone: payload.parentPhone,
      playerName: payload.playerName,
      playerAge: payload.playerAge,
      trainingGroup: payload.trainingGroup,
      amountPaid,
      paymentMethod: payload.paymentMethod,
      internalNote: payload.internalNote,
      proposedSessionIds
    });
    const details = await getScheduleApprovalByToken(token);
    const confirmationUrl = `${siteUrl()}/schedule-confirmation/${token}`;
    const emailResult = details
      ? await sendScheduleApprovalLinkEmail({
          approval: details.approval,
          sessions: details.sessions,
          confirmationUrl
        })
      : { sent: false, message: "Schedule proposal could not be loaded for email." };

    return NextResponse.json({
      status: "created",
      passPurchaseId: created.pass.id,
      scheduleApprovalId: created.approval.id,
      confirmationUrl,
      emailSent: emailResult.sent,
      emailMessage: emailResult.message
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "failed",
        error: error instanceof Error ? error.message : "Schedule approval link could not be created."
      },
      { status: 500 }
    );
  }
}

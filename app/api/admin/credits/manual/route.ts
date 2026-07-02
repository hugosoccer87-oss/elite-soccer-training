import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-api";
import {
  issueManualLaunchPassCredit,
  updateCreditAdjustmentEmailStatus
} from "@/lib/supabase-db";
import { sendManualCreditEmail } from "@/lib/transactional-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedReasons = new Set([
  "Session cancelled by EST CV",
  "Weather cancellation",
  "Makeup credit",
  "Admin correction",
  "Goodwill credit",
  "Other"
]);

export async function POST(request: Request) {
  const admin = await verifyAdminSession();

  if (!admin.authenticated) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const payload = (await request.json().catch(() => null)) as {
    passPurchaseId?: string;
    creditAmount?: number;
    reason?: string;
    note?: string;
    sendEmail?: boolean;
  } | null;
  const reason = payload?.reason?.trim() || "Makeup credit";
  const creditAmount = Math.max(1, Math.floor(Number(payload?.creditAmount) || 1));

  if (!payload?.passPurchaseId) {
    return NextResponse.json({ error: "Choose a Training Package before adding credit." }, { status: 400 });
  }

  if (!allowedReasons.has(reason)) {
    return NextResponse.json({ error: "Choose a valid credit reason." }, { status: 400 });
  }

  try {
    const issued = await issueManualLaunchPassCredit({
      passPurchaseId: payload.passPurchaseId,
      creditAmount,
      reason,
      note: payload.note,
      createdBy: "admin"
    });

    let emailSent = false;
    let emailMessage: string | undefined;

    if (payload.sendEmail !== false) {
      const emailResult = await sendManualCreditEmail({
        adjustment: issued.adjustment,
        pass: issued.pass
      });
      emailSent = emailResult.sent;
      emailMessage = emailResult.message;
      await updateCreditAdjustmentEmailStatus({
        adjustmentId: issued.adjustment.id,
        status: emailResult.sent ? "sent" : "failed",
        errorMessage: emailResult.message
      });
    }

    return NextResponse.json({
      status: "credited",
      message:
        payload.sendEmail === false
          ? `${creditAmount} credit${creditAmount === 1 ? "" : "s"} added. Parent email was not sent.`
          : emailSent
            ? `${creditAmount} credit${creditAmount === 1 ? "" : "s"} added and the parent was notified.`
            : `${creditAmount} credit${creditAmount === 1 ? "" : "s"} added, but the parent email could not be sent.`,
      emailSent,
      emailMessage,
      adjustment: {
        ...issued.adjustment,
        email_status: payload.sendEmail === false ? "not_sent" : emailSent ? "sent" : "failed",
        email_sent: emailSent,
        email_error: emailSent ? null : emailMessage || null
      },
      pass: issued.pass
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "failed",
        error: error instanceof Error ? error.message : "Manual credit could not be added."
      },
      { status: 500 }
    );
  }
}

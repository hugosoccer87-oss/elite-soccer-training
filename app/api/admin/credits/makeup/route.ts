import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-api";
import {
  issueLaunchPassMakeupCredit,
  updateCreditAdjustmentEmailStatus
} from "@/lib/supabase-db";
import { sendMakeupCreditEmail } from "@/lib/transactional-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const admin = await verifyAdminSession();

  if (!admin.authenticated) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const payload = (await request.json().catch(() => null)) as { bookingId?: string } | null;

  if (!payload?.bookingId) {
    return NextResponse.json({ error: "Booking ID is required." }, { status: 400 });
  }

  try {
    const issued = await issueLaunchPassMakeupCredit({
      bookingId: payload.bookingId,
      createdBy: "admin"
    });
    const emailResult = await sendMakeupCreditEmail({
      adjustment: issued.adjustment,
      booking: issued.booking,
      session: issued.session,
      pass: issued.pass
    });
    await updateCreditAdjustmentEmailStatus({
      adjustmentId: issued.adjustment.id,
      status: emailResult.sent ? "sent" : "failed",
      errorMessage: emailResult.message
    });

    return NextResponse.json({
      status: "credited",
      message: emailResult.sent
        ? "1 credit was added back and the parent was notified."
        : "1 credit was added back, but the parent email could not be sent.",
      emailSent: emailResult.sent,
      adjustment: {
        ...issued.adjustment,
        email_status: emailResult.sent ? "sent" : "failed",
        email_error: emailResult.sent ? null : emailResult.message || "Email could not be sent."
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "failed",
        error: error instanceof Error ? error.message : "Makeup credit could not be issued."
      },
      { status: 500 }
    );
  }
}

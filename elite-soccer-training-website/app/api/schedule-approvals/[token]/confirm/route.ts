import { NextResponse } from "next/server";
import { confirmLaunchPassCreditBooking } from "@/lib/booking-confirmation";
import {
  confirmScheduleApprovalLink,
  getBookingRecordForConfirmation
} from "@/lib/supabase-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { token } = await context.params;

  if (!token) {
    return NextResponse.json({ error: "Schedule confirmation link is missing." }, { status: 400 });
  }

  try {
    const confirmedRows = await confirmScheduleApprovalLink(token);
    const confirmations = [];

    for (const row of confirmedRows) {
      const booking = await getBookingRecordForConfirmation(row.booking_id, row.remaining_credits);
      const confirmation = await confirmLaunchPassCreditBooking(booking);
      confirmations.push({
        bookingId: confirmation.booking.id,
        sessionId: row.session_id,
        calendarStatus: confirmation.calendarResult.status,
        emailSent: confirmation.emailResult?.sent ?? false,
        remainingCredits: confirmation.booking.remainingCreditsAfter
      });
    }

    return NextResponse.json({
      status: "confirmed",
      bookingCount: confirmations.length,
      confirmations
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Schedule could not be confirmed.";

    return NextResponse.json(
      {
        status: "failed",
        error: message
      },
      { status: 409 }
    );
  }
}

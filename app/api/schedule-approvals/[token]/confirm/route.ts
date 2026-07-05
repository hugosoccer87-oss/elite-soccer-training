import { NextResponse } from "next/server";
import { confirmLaunchPassCreditBooking } from "@/lib/booking-confirmation";
import type { BookingRecord } from "@/lib/booking-data";
import { sendScheduleApprovalAdminPushoverAlert } from "@/lib/pushover";
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
    let firstConfirmedBooking: BookingRecord | null = null;

    for (const row of confirmedRows) {
      const booking = await getBookingRecordForConfirmation(row.booking_id, row.remaining_credits);
      const confirmation = await confirmLaunchPassCreditBooking(booking);
      firstConfirmedBooking = firstConfirmedBooking ?? confirmation.booking;
      confirmations.push({
        bookingId: confirmation.booking.id,
        sessionId: row.session_id,
        calendarStatus: confirmation.calendarResult.status,
        emailSent: confirmation.emailResult?.sent ?? false,
        remainingCredits: confirmation.booking.remainingCreditsAfter
      });
    }

    await sendScheduleApprovalAdminPushoverAlert({
      token,
      bookingCount: confirmations.length,
      firstBooking: firstConfirmedBooking ?? undefined
    }).catch((alertError) => {
      console.error("[EST Pushover] Schedule approval admin alert failed", {
        token,
        error: alertError instanceof Error ? alertError.message : String(alertError)
      });
    });

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

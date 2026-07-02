import { NextResponse } from "next/server";
import { type BookingRecord } from "@/lib/booking-data";
import { confirmLaunchPassCreditBooking } from "@/lib/booking-confirmation";
import { redeemLaunchPassCreditAndSaveWaiver, saveEmailSubscriberOptIn } from "@/lib/supabase-db";

export const runtime = "nodejs";

function getRequestIpAddress(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const vercelForwardedFor = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();

  return forwardedFor || realIp || vercelForwardedFor || "";
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    passPurchaseId?: string;
    booking?: BookingRecord;
  } | null;
  const booking = payload?.booking;

  if (
    !payload?.passPurchaseId ||
    !booking?.sessionId ||
    !booking.email ||
    !booking.parentName ||
    !booking.playerName ||
    !booking.waiverAccepted ||
    !booking.guardianSignature
  ) {
    return NextResponse.json({ error: "Complete the session, athlete details, and signed waiver before using a training credit." }, { status: 400 });
  }

  try {
    console.info("[EST Pass] Redeeming Training credit", {
      passPurchaseId: payload.passPurchaseId,
      sessionId: booking.sessionId,
      playerName: booking.playerName
    });
    const paidBooking = await redeemLaunchPassCreditAndSaveWaiver(
      {
        ...booking,
        players: "1",
        paymentType: "launch_pass_credit",
        paymentStatus: "Paid",
        notificationStatus: "Ready",
        calendarStatus: "Ready"
      },
      payload.passPurchaseId,
      getRequestIpAddress(request) || booking.ipAddress
    );
    if (booking.marketingOptIn) {
      await saveEmailSubscriberOptIn({
        parentName: paidBooking.parentName,
        email: paidBooking.email,
        phone: paidBooking.phone,
        playerName: paidBooking.playerName,
        playerAge: paidBooking.playerAge,
        source: "launch_pass_credit_booking"
      });
    }
    const confirmation = await confirmLaunchPassCreditBooking(paidBooking);

    return NextResponse.json({
      status: "confirmed",
      bookingId: confirmation.booking.id,
      remainingCredits: confirmation.booking.remainingCreditsAfter,
      calendarStatus: confirmation.calendarResult.status,
      emailSent: confirmation.emailResult?.sent ?? false
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isMissingCredits =
      message.toLowerCase().includes("no remaining credits") ||
      message.toLowerCase().includes("not found") ||
      message.toLowerCase().includes("not paid") ||
      message.toLowerCase().includes("expired");

    console.error("[EST Pass] Training credit redemption failed", {
      passPurchaseId: payload?.passPurchaseId,
      error: message
    });

    return NextResponse.json(
      {
        error: isMissingCredits ? "No active Training credits were found for this player." : message
      },
      { status: 500 }
    );
  }
}

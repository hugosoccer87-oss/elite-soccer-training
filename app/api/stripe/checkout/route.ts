import { NextResponse } from "next/server";
import { type BookingRecord } from "@/lib/booking-data";
import { createStripeCheckoutSession } from "@/lib/stripe";

function getRequestIpAddress(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const vercelForwardedFor = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();

  return forwardedFor || realIp || vercelForwardedFor || "";
}

export async function POST(request: Request) {
  const rawBooking = (await request.json().catch(() => null)) as BookingRecord | null;

  if (!rawBooking?.id || !rawBooking?.email || !rawBooking?.players || !rawBooking?.waiverAccepted) {
    return NextResponse.json({ error: "Invalid checkout payload." }, { status: 400 });
  }

  const playerCount = Number(rawBooking.players);

  if (!Number.isInteger(playerCount) || playerCount < 1 || playerCount > 6) {
    return NextResponse.json({ error: "Player count must be between 1 and 6." }, { status: 400 });
  }

  const booking: BookingRecord = {
    ...rawBooking,
    players: String(playerCount),
    sessionDurationMinutes: 60,
    ipAddress: getRequestIpAddress(request) || rawBooking.ipAddress,
    paymentStatus: "pending_payment",
    notificationStatus: "Ready",
    calendarStatus: "Ready",
    calendarMessage: undefined,
    calendarEventId: undefined,
    calendarEventUrl: undefined
  };

  try {
    console.info("[EST Stripe] Creating checkout session", {
      bookingId: booking.id,
      playerName: booking.playerName,
      players: booking.players,
      hasPublishableKey: Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
    });

    const session = await createStripeCheckoutSession(booking);

    console.info("[EST Stripe] Checkout session created", {
      bookingId: booking.id,
      sessionId: session.id
    });

    console.info("[EST Stripe] Redirecting to Stripe Checkout", {
      bookingId: booking.id,
      sessionId: session.id
    });

    return NextResponse.json({
      checkoutUrl: session.url,
      sessionId: session.id
    });
  } catch (error) {
    console.error("[EST Stripe] Failed to create Checkout session", {
      bookingId: booking.id,
      error: error instanceof Error ? error.message : String(error)
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Stripe Checkout could not be started."
      },
      { status: 500 }
    );
  }
}

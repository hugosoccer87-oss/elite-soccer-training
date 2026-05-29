import { NextResponse } from "next/server";
import { type BookingRecord } from "@/lib/booking-data";
import { createStripeCheckoutSession } from "@/lib/stripe";

export async function POST(request: Request) {
  const booking = (await request.json()) as BookingRecord;

  if (!booking?.id || !booking?.email || !booking?.players || !booking?.waiverAccepted) {
    return NextResponse.json({ error: "Invalid checkout payload." }, { status: 400 });
  }

  try {
    console.info("[EST Stripe] Creating Checkout session", {
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

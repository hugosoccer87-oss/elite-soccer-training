import { NextResponse } from "next/server";
import { confirmPaidBooking } from "@/lib/booking-confirmation";
import { bookingFromStripeMetadata, verifyStripeWebhookSignature } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");

  try {
    const event = verifyStripeWebhookSignature(payload, signature);

    console.info("[EST Stripe] Webhook event received", {
      eventId: event.id,
      eventType: event.type
    });

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const booking = bookingFromStripeMetadata(session.metadata);

      if (!booking) {
        console.error("[EST Stripe] Checkout completed without booking metadata", {
          eventId: event.id,
          sessionId: session.id
        });
        return NextResponse.json({ received: true });
      }

      if (session.payment_status !== "paid") {
        console.warn("[EST Stripe] Checkout completed without paid status", {
          eventId: event.id,
          sessionId: session.id,
          bookingId: booking.id,
          paymentStatus: session.payment_status
        });
        return NextResponse.json({ received: true });
      }

      const result = await confirmPaidBooking(booking);

      console.info("[EST Stripe] Paid booking processed", {
        eventId: event.id,
        sessionId: session.id,
        bookingId: booking.id,
        calendarStatus: result.calendarResult.status,
        calendarEventId: result.calendarResult.eventId,
        emailSent: result.emailResult?.sent ?? false
      });
    }

    if (event.type === "checkout.session.expired") {
      console.warn("[EST Stripe] Checkout session expired", {
        eventId: event.id,
        sessionId: event.data.object.id,
        bookingId: event.data.object.metadata?.bookingId
      });
    }

    if (event.type === "payment_intent.payment_failed") {
      console.error("[EST Stripe] Payment failed", {
        eventId: event.id,
        paymentIntentId: event.data.object.id,
        bookingId: event.data.object.metadata?.bookingId
      });
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[EST Stripe] Webhook processing failed", {
      error: error instanceof Error ? error.message : String(error)
    });

    return NextResponse.json({ error: "Webhook processing failed." }, { status: 400 });
  }
}

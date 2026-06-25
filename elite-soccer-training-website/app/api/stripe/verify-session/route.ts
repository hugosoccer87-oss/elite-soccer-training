import { NextResponse } from "next/server";
import { setLastPaymentVerificationResult } from "@/lib/stripe-diagnostics";
import { isStripePaymentVerified, retrieveStripeCheckoutSession } from "@/lib/stripe";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id")?.trim();

  if (!sessionId) {
    console.warn("[EST Stripe] Payment not verified", {
      reason: "Missing Checkout Session ID"
    });
    setLastPaymentVerificationResult({
      source: "verify-session-api",
      verified: false,
      message: "Missing Checkout Session ID."
    });

    return NextResponse.json(
      {
        verified: false,
        error: "Missing Stripe Checkout session ID."
      },
      { status: 400 }
    );
  }

  try {
    const session = await retrieveStripeCheckoutSession(sessionId);
    const verified = isStripePaymentVerified(session);
    const bookingId = session.metadata?.bookingId || session.client_reference_id;

    if (verified) {
      console.info("[EST Stripe] Payment verified", {
        sessionId: session.id,
        bookingId
      });
    } else {
      console.warn("[EST Stripe] Payment not verified", {
        sessionId: session.id,
        bookingId,
        sessionStatus: session.status,
        paymentStatus: session.payment_status
      });
    }

    setLastPaymentVerificationResult({
      source: "verify-session-api",
      verified,
      sessionId: session.id,
      bookingId,
      sessionStatus: session.status,
      paymentStatus: session.payment_status,
      message: verified ? undefined : "Checkout session was not paid and complete."
    });

    return NextResponse.json({
      verified,
      sessionId: session.id,
      bookingId,
      status: session.status,
      paymentStatus: session.payment_status
    });
  } catch (error) {
    console.error("[EST Stripe] Payment not verified", {
      sessionId,
      error: error instanceof Error ? error.message : String(error)
    });
    setLastPaymentVerificationResult({
      source: "verify-session-api",
      verified: false,
      sessionId,
      message: error instanceof Error ? error.message : "Stripe payment could not be verified."
    });

    return NextResponse.json(
      {
        verified: false,
        error: error instanceof Error ? error.message : "Stripe payment could not be verified."
      },
      { status: 500 }
    );
  }
}

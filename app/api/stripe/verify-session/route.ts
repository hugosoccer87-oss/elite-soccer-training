import { NextResponse } from "next/server";
import { confirmPaidBooking } from "@/lib/booking-confirmation";
import { setLastPaymentVerificationResult } from "@/lib/stripe-diagnostics";
import {
  bookingFromStripeMetadata,
  directPaymentIdFromStripeMetadata,
  isStripePaymentVerified,
  retrieveStripeCheckoutSession
} from "@/lib/stripe";
import { getBookingRecordForConfirmation } from "@/lib/supabase-db";

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

    if (verified) {
      const directPaymentId = directPaymentIdFromStripeMetadata(session.metadata);
      const bookingFromMetadata = bookingFromStripeMetadata(session.metadata);

      if (bookingFromMetadata && !directPaymentId) {
        try {
          const recoveredBooking = await getBookingRecordForConfirmation(bookingFromMetadata.id).catch(() => bookingFromMetadata);

          await confirmPaidBooking(
            {
              ...recoveredBooking,
              paymentStatus: "Paid"
            },
            {
              checkoutSessionId: session.id,
              paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : undefined,
              amountPaid: typeof session.amount_total === "number" ? session.amount_total : undefined
            }
          );
          console.info("[EST Stripe] Verified success page recovered booking finalization", {
            sessionId: session.id,
            bookingId: bookingFromMetadata.id
          });
        } catch (recoveryError) {
          console.error("[EST Stripe] Verified success page could not recover booking finalization", {
            sessionId: session.id,
            bookingId: bookingFromMetadata.id,
            error: recoveryError instanceof Error ? recoveryError.message : String(recoveryError)
          });
        }
      }
    }

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

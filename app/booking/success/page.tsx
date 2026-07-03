import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/PageHero";
import { confirmPaidBooking } from "@/lib/booking-confirmation";
import { setLastPaymentVerificationResult } from "@/lib/stripe-diagnostics";
import { bookingFromStripeMetadata, isStripePaymentVerified, retrieveStripeCheckoutSession } from "@/lib/stripe";
import { bookingArrivalInstructions, business } from "@/lib/site-data";
import { getBookingRecordForConfirmation } from "@/lib/supabase-db";

export const metadata: Metadata = {
  title: "Booking Confirmation",
  description: "Elite Soccer Training CV booking confirmation."
};

export const dynamic = "force-dynamic";

type BookingSuccessPageProps = {
  searchParams: Promise<{
    session_id?: string | string[];
  }>;
};

async function verifyCheckoutSession(sessionId: string | undefined) {
  if (!sessionId) {
    console.warn("[EST Stripe] Payment not verified", {
      reason: "Missing Checkout Session ID on success page"
    });
    setLastPaymentVerificationResult({
      source: "success-page",
      verified: false,
      message: "Missing Checkout Session ID."
    });

    return {
      verified: false,
      title: "Payment could not be confirmed.",
      message: "We could not confirm a completed payment for this booking. Your session is not confirmed yet.",
      sessionId: "",
      bookingId: "",
      status: "",
      paymentStatus: "",
      isLaunchPass: false
    };
  }

  try {
    const session = await retrieveStripeCheckoutSession(sessionId);
    const verified = isStripePaymentVerified(session);
    const isLaunchPass = session.metadata?.purchase_type === "launch_pass";
    const bookingId = session.metadata?.bookingId || session.client_reference_id || "";

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
      source: "success-page",
      verified,
      sessionId: session.id,
      bookingId,
      sessionStatus: session.status,
      paymentStatus: session.payment_status,
      message: verified ? undefined : "Checkout session was not paid and complete."
    });

    if (verified && !isLaunchPass) {
      const bookingFromMetadata = bookingFromStripeMetadata(session.metadata);

      if (bookingFromMetadata) {
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

          console.info("[EST Stripe] Success page recovered paid booking confirmation flow", {
            sessionId: session.id,
            bookingId: bookingFromMetadata.id
          });
        } catch (recoveryError) {
          console.error("[EST Stripe] Success page could not recover paid booking confirmation flow", {
            sessionId: session.id,
            bookingId: bookingFromMetadata.id,
            error: recoveryError instanceof Error ? recoveryError.message : String(recoveryError)
          });
        }
      }
    }

    return {
      verified,
      title: verified ? (isLaunchPass ? "Training Package confirmed." : "Booking confirmed.") : "Payment not confirmed.",
      message: verified
        ? isLaunchPass
          ? "Your secure payment is complete. Your Training Package confirmation will be sent by email."
          : "Your secure payment is complete. Your session details will be sent by email."
        : "We could not confirm a completed payment for this session. Your booking is not confirmed.",
      sessionId: session.id,
      bookingId,
      status: session.status ?? "",
      paymentStatus: session.payment_status ?? "",
      isLaunchPass
    };
  } catch (error) {
    console.error("[EST Stripe] Payment not verified", {
      sessionId,
      error: error instanceof Error ? error.message : String(error)
    });
    setLastPaymentVerificationResult({
      source: "success-page",
      verified: false,
      sessionId,
      message: error instanceof Error ? error.message : "Stripe payment could not be verified."
    });

    return {
      verified: false,
      title: "Payment could not be confirmed.",
      message: "Secure payment could not be confirmed. Your booking is not confirmed.",
      sessionId,
      bookingId: "",
      status: "",
      paymentStatus: "",
      isLaunchPass: false
    };
  }
}

export default async function BookingSuccessPage({ searchParams }: BookingSuccessPageProps) {
  const params = await searchParams;
  const sessionIdParam = Array.isArray(params.session_id) ? params.session_id[0] : params.session_id;
  const verification = await verifyCheckoutSession(sessionIdParam);

  return (
    <>
      <PageHero
        eyebrow={verification.verified ? "Booking Confirmed" : "Payment Needed"}
        title={verification.title}
        description={verification.message}
      />

      <section className="bg-mist py-16 sm:py-20">
        <div className="section-shell max-w-3xl">
          <div className="panel p-6 sm:p-8">
            <p className={`text-sm font-black uppercase ${verification.verified ? "text-field" : "text-red-700"}`}>
              {verification.verified ? (verification.isLaunchPass ? "Training Package Confirmed" : "Session Confirmed") : "Booking Not Confirmed"}
            </p>
            <h2 className="mt-3 text-3xl font-black text-navy">
              {verification.verified
                ? verification.isLaunchPass
                  ? "Thank you for purchasing a Training Package."
                  : "Thank you for booking with Elite Soccer Training CV."
                : "Please return to secure payment."}
            </h2>
            <p className="mt-4 leading-7 text-slate-600">
              {verification.verified
                ? verification.isLaunchPass
                  ? "Your secure payment is complete. Watch your email for Training Package details, then book sessions using your credits."
                  : "Your secure payment is complete. Watch your email for session details and reminders."
                : "No completed payment was confirmed for this booking. Please return to the booking page when you are ready to finish."}
            </p>
            <div className="mt-6 grid gap-3 rounded-md border border-slate-200 bg-mist p-4 text-sm text-slate-700">
              {verification.bookingId ? (
                <p>
                  <span className="font-black text-navy">{verification.isLaunchPass ? "Training Package ID:" : "Booking ID:"}</span>{" "}
                  {verification.bookingId}
                </p>
              ) : (
                <p>
                  <span className="font-black text-navy">Need help?</span> Call {business.phone} and Coach Hugo can
                  help review the booking.
                </p>
              )}
            </div>
            {verification.verified && !verification.isLaunchPass ? (
              <div className="mt-6 rounded-md border border-electric/20 bg-blue-50 p-5 text-sm leading-6 text-slate-700">
                <p className="font-black uppercase text-navy">Before The Session</p>
                <div className="mt-3 grid gap-3">
                  {bookingArrivalInstructions.map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/booking"
                className="inline-flex justify-center rounded-md border border-navy px-6 py-3 text-sm font-black text-navy transition hover:border-electric hover:text-electric"
              >
                Book Another Session
              </Link>
              <a
                href={business.phoneHref}
                className="inline-flex justify-center rounded-md bg-electric px-6 py-3 text-sm font-black uppercase text-white shadow-lg shadow-electric/25 transition hover:bg-blue-500"
              >
                Call {business.phone}
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

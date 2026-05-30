import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/PageHero";
import { setLastPaymentVerificationResult } from "@/lib/stripe-diagnostics";
import { isStripePaymentVerified, retrieveStripeCheckoutSession } from "@/lib/stripe";
import { bookingArrivalInstructions, business } from "@/lib/site-data";

export const metadata: Metadata = {
  title: "Booking Payment Verification",
  description: "Elite Soccer Training payment verification."
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
      title: "Payment could not be verified.",
      message: "Stripe did not return a Checkout Session ID. Your booking is not marked confirmed on this page.",
      sessionId: "",
      bookingId: "",
      status: "",
      paymentStatus: ""
    };
  }

  try {
    const session = await retrieveStripeCheckoutSession(sessionId);
    const verified = isStripePaymentVerified(session);
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

    return {
      verified,
      title: verified ? "Payment confirmed." : "Payment not confirmed.",
      message: verified
        ? "Stripe has verified your payment. Your booking confirmation, calendar event, and email notifications are handled automatically after payment verification."
        : "Stripe has not verified a completed payment for this session. Your booking is not confirmed.",
      sessionId: session.id,
      bookingId,
      status: session.status ?? "",
      paymentStatus: session.payment_status ?? ""
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
      title: "Payment could not be verified.",
      message:
        error instanceof Error
          ? error.message
          : "Stripe payment could not be verified. Your booking is not confirmed.",
      sessionId,
      bookingId: "",
      status: "",
      paymentStatus: ""
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
        eyebrow={verification.verified ? "Payment Verified" : "Payment Review"}
        title={verification.title}
        description={verification.message}
      />

      <section className="bg-mist py-16 sm:py-20">
        <div className="section-shell max-w-3xl">
          <div className="panel p-6 sm:p-8">
            <p className={`text-sm font-black uppercase ${verification.verified ? "text-field" : "text-red-700"}`}>
              {verification.verified ? "Stripe Payment Confirmed" : "Booking Not Confirmed"}
            </p>
            <h2 className="mt-3 text-3xl font-black text-navy">
              {verification.verified ? "Thank you for booking with Elite Soccer Training." : "Please return to secure checkout."}
            </h2>
            <p className="mt-4 leading-7 text-slate-600">
              {verification.verified
                ? "Your secure Stripe payment is complete. The confirmed booking details are processed through the Stripe webhook before calendar and email confirmations are sent."
                : "The site did not receive a verified paid Stripe Checkout Session. No session has been marked paid or confirmed."}
            </p>
            <div className="mt-6 grid gap-3 rounded-md border border-slate-200 bg-mist p-4 text-sm text-slate-700">
              <p>
                <span className="font-black text-navy">Stripe session:</span>{" "}
                {verification.sessionId || "Not provided"}
              </p>
              <p>
                <span className="font-black text-navy">Session status:</span>{" "}
                {verification.status || "Not verified"}
              </p>
              <p>
                <span className="font-black text-navy">Payment status:</span>{" "}
                {verification.paymentStatus || "Not verified"}
              </p>
              {verification.bookingId ? (
                <p>
                  <span className="font-black text-navy">Booking ID:</span> {verification.bookingId}
                </p>
              ) : null}
            </div>
            {verification.verified ? (
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

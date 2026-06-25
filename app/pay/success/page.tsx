import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/PageHero";
import { business } from "@/lib/site-data";
import { directPaymentIdFromStripeMetadata, isStripePaymentVerified, retrieveStripeCheckoutSession } from "@/lib/stripe";
import { setLastPaymentVerificationResult } from "@/lib/stripe-diagnostics";
import { markDirectPaymentPaid } from "@/lib/supabase-db";
import { sendDirectPaymentTransactionalEmails } from "@/lib/transactional-email";

export const metadata: Metadata = {
  title: "Payment Confirmation",
  description: "Elite Soccer Training CV direct payment confirmation."
};

export const dynamic = "force-dynamic";

type PaySuccessPageProps = {
  searchParams: Promise<{
    session_id?: string | string[];
  }>;
};

async function verifyDirectPayment(sessionId: string | undefined) {
  if (!sessionId) {
    setLastPaymentVerificationResult({
      source: "success-page",
      verified: false,
      message: "Missing Checkout Session ID."
    });

    return {
      verified: false,
      directPaymentId: "",
      title: "Payment could not be confirmed.",
      message: "We could not confirm a completed card payment. Please contact Coach Hugo if you need help."
    };
  }

  try {
    const session = await retrieveStripeCheckoutSession(sessionId);
    const verified = isStripePaymentVerified(session);
    const directPaymentId = directPaymentIdFromStripeMetadata(session.metadata);

    setLastPaymentVerificationResult({
      source: "success-page",
      verified,
      sessionId: session.id,
      bookingId: directPaymentId ?? undefined,
      sessionStatus: session.status,
      paymentStatus: session.payment_status,
      message: verified ? "Direct Pay + Waiver payment verified." : "Direct Pay + Waiver payment was not paid and complete."
    });

    if (!directPaymentId) {
      return {
        verified: false,
        directPaymentId: "",
        title: "Payment record not found.",
        message: "Payment was returned without the direct payment record. Please contact Coach Hugo for help."
      };
    }

    if (!verified) {
      return {
        verified: false,
        directPaymentId,
        title: "Payment not confirmed.",
        message: "A completed card payment was not confirmed yet. Please contact Coach Hugo if you believe this is incorrect."
      };
    }

    const directPayment = await markDirectPaymentPaid({
      directPaymentId,
      checkoutSessionId: session.id,
      paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : undefined,
      amountPaid: typeof session.amount_total === "number" ? session.amount_total : undefined
    });

    if (!directPayment.wasAlreadyPaid) {
      const emailResult = await sendDirectPaymentTransactionalEmails({
        ...directPayment,
        training_focus: directPayment.training_focus || session.metadata?.training_focus || "general_training"
      });

      console.info("[EST Direct Pay] Card direct payment emails processed from success page", {
        directPaymentId,
        emailSent: emailResult.sent
      });
    }

    return {
      verified: true,
      directPaymentId,
      title: "Payment confirmed.",
      message: "Your payment and signed waiver have been recorded for Elite Soccer Training CV."
    };
  } catch (error) {
    console.error("[EST Direct Pay] Payment confirmation failed", {
      sessionId,
      error: error instanceof Error ? error.message : String(error)
    });
    setLastPaymentVerificationResult({
      source: "success-page",
      verified: false,
      sessionId,
      message: error instanceof Error ? error.message : "Direct payment could not be verified."
    });

    return {
      verified: false,
      directPaymentId: "",
      title: "Payment could not be confirmed.",
      message: "Secure payment could not be verified. Please contact Coach Hugo for help."
    };
  }
}

export default async function PaySuccessPage({ searchParams }: PaySuccessPageProps) {
  const params = await searchParams;
  const sessionId = Array.isArray(params.session_id) ? params.session_id[0] : params.session_id;
  const result = await verifyDirectPayment(sessionId);

  return (
    <>
      <PageHero
        eyebrow={result.verified ? "Payment Confirmed" : "Payment Needs Attention"}
        title={result.title}
        description={result.message}
      />

      <section className="bg-mist py-16 sm:py-20">
        <div className="section-shell max-w-3xl">
          <div className="panel p-6 sm:p-8">
            <p className={`text-sm font-black uppercase ${result.verified ? "text-field" : "text-red-700"}`}>
              {result.verified ? "Direct Payment Recorded" : "Direct Payment Not Confirmed"}
            </p>
            <h2 className="mt-3 text-3xl font-black text-navy">
              {result.verified ? "Thank you for completing payment." : "Please contact Coach Hugo."}
            </h2>
            <p className="mt-4 leading-7 text-slate-600">{result.message}</p>
            {result.directPaymentId ? (
              <p className="mt-5 rounded-md border border-slate-200 bg-mist p-4 text-sm text-slate-700">
                <span className="font-black text-navy">Direct Payment ID:</span> {result.directPaymentId}
              </p>
            ) : null}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/pay"
                className="inline-flex justify-center rounded-md border border-navy px-6 py-3 text-sm font-black text-navy transition hover:border-electric hover:text-electric"
              >
                Return To Pay + Waiver
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

import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/PageHero";
import { business } from "@/lib/site-data";

export const metadata: Metadata = {
  title: "Booking Payment Successful",
  description: "Elite Soccer Training payment successful."
};

export default function BookingSuccessPage() {
  return (
    <>
      <PageHero
        eyebrow="Payment Complete"
        title="Your payment was successful."
        description="Your booking is being confirmed. Coach Hugo will receive the details, and a confirmation email will be sent after payment is processed."
      />

      <section className="bg-mist py-16 sm:py-20">
        <div className="section-shell max-w-3xl">
          <div className="panel p-6 sm:p-8">
            <p className="text-sm font-black uppercase text-field">Session Confirmed</p>
            <h2 className="mt-3 text-3xl font-black text-navy">Thank you for booking with Elite Soccer Training.</h2>
            <p className="mt-4 leading-7 text-slate-600">
              Your secure Stripe payment was completed. Your Google Calendar booking and confirmation emails are handled
              automatically after payment.
            </p>
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

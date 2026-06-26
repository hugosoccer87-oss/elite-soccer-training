import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/PageHero";

export const metadata: Metadata = {
  title: "Booking Payment Canceled",
  description: "Elite Soccer Training CV payment canceled."
};

export default function BookingCancelPage() {
  return (
    <>
      <PageHero
        eyebrow="Payment Canceled"
        title="Your booking was not confirmed."
        description="No payment was completed. Return to the booking page when you are ready to finish registration."
      />

      <section className="bg-mist py-16 sm:py-20">
        <div className="section-shell max-w-3xl">
          <div className="panel p-6 sm:p-8">
            <p className="text-sm font-black uppercase text-electric">Payment Not Completed</p>
            <h2 className="mt-3 text-3xl font-black text-navy">Complete payment to reserve your training session.</h2>
            <p className="mt-4 leading-7 text-slate-600">
              The session is only confirmed after successful secure payment. You can return to booking and choose an
              available time.
            </p>
            <Link
              href="/booking"
              className="mt-6 inline-flex justify-center rounded-md bg-electric px-6 py-3 text-sm font-black uppercase text-white shadow-lg shadow-electric/25 transition hover:bg-blue-500"
            >
              Return To Booking
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

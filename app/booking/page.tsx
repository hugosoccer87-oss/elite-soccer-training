import type { Metadata } from "next";
import { BookingForm } from "@/components/BookingForm";
import { PageHero } from "@/components/PageHero";
import { business } from "@/lib/site-data";

export const metadata: Metadata = {
  title: "Book Training",
  description: "Submit a small group soccer training request for Elite Soccer Training."
};

export default function BookingPage() {
  return (
    <>
      <PageHero
        eyebrow="Booking"
        title="BOOK TRAINING"
        description="Select an available session below to complete registration."
      />

      <section className="bg-mist py-16 sm:py-20">
        <div className="section-shell grid gap-10 lg:grid-cols-[0.75fr_1.25fr]">
          <aside className="lg:pt-8">
            <p className="text-sm font-black uppercase text-electric">Small Group Soccer Training</p>
            <h2 className="mt-3 text-3xl font-black leading-tight text-navy text-balance">
              Premium 60-minute group sessions by age and development level.
            </h2>
            <p className="mt-4 leading-7 text-slate-600">
              Future Elite supports ages 9-12. Elite Performance supports ages 13-18. Each session holds up to
              six players.
            </p>
            <div className="mt-8 rounded-lg border border-slate-200 bg-white p-5">
              <p className="text-sm font-black uppercase text-electric">Stripe Ready</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Payment follows the waiver step. Card checkout, Apple Pay, and Google Pay are ready for Stripe.
              </p>
            </div>
            <a
              href={business.phoneHref}
              className="mt-4 inline-flex rounded-md border border-navy px-5 py-3 text-sm font-black text-navy transition hover:border-electric hover:text-electric"
            >
              Call {business.phone}
            </a>
          </aside>
          <BookingForm />
        </div>
      </section>
    </>
  );
}

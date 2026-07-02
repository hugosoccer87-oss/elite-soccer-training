import type { Metadata } from "next";
import { BookingForm } from "@/components/BookingForm";
import { PageHero } from "@/components/PageHero";
import { business } from "@/lib/site-data";

export const metadata: Metadata = {
  title: "Book Training",
  description: "Submit a small group soccer training request for Elite Soccer Training CV."
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
            <p className="text-sm font-black uppercase text-electric">Booking Options</p>
            <h2 className="mt-3 text-3xl font-black leading-tight text-navy text-balance">
              Choose a booking option.
            </h2>
            <div className="mt-5 grid gap-3">
              {[
                ["Single Session", "$55", "Book one available training session online."],
                ["4-Session Training Package", "$200", "4 training credits for EST CV small group training."],
                ["6-Session Training Package", "$285", "6 training credits for EST CV small group training."],
                ["Private 1-on-1 Session Request", "Request", "Submit preferred times. No payment is collected immediately."]
              ].map(([title, price, description]) => (
                <div key={title} className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="font-black text-navy">
                    {title} — {price}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
                </div>
              ))}
            </div>
            <p className="mt-5 rounded-lg border border-electric/20 bg-white p-4 text-sm font-bold leading-6 text-slate-600">
              Groups are capped at 6 players. Morning sessions are recommended for older players. Younger sessions are
              held in the early evening with water breaks.
            </p>
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

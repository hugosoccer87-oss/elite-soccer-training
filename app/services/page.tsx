import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/PageHero";
import { SectionHeader } from "@/components/SectionHeader";
import { SpecialRequestForm } from "@/components/SpecialRequestForm";
import { TrainingCard } from "@/components/TrainingCard";
import { groupSizeMessage, juneLaunchScheduleNote, services } from "@/lib/site-data";
import { pricingOptions } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Programs",
  description: "Small group soccer training programs and focused finishing sessions for youth players in the Coachella Valley."
};

export default function ServicesPage() {
  return (
    <>
      <PageHero
        eyebrow="Programs"
        title="Age-based small group soccer development."
        description={`Main small group training serves players ages 9-18. Every session is 60 minutes and $55 per player. ${groupSizeMessage}`}
      />

      <section className="bg-mist py-16 sm:py-20">
        <div className="section-shell grid max-w-5xl gap-6">
          <div className="rounded-lg border border-electric/20 bg-white p-5 shadow-sm">
            <p className="text-sm font-black uppercase text-electric">Limited Group Size</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{groupSizeMessage}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-black uppercase text-electric">June Launch Pricing</p>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {pricingOptions.map((option) => (
                <article key={option.title} className="rounded-lg border border-slate-200 bg-mist p-4">
                  <h2 className="text-lg font-black text-navy">{option.title} — {option.price}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{option.description}</p>
                </article>
              ))}
            </div>
            <p className="mt-4 text-sm font-bold leading-6 text-slate-600">
              Single Sessions and Launch Passes can be purchased through the booking page. Launch Pass credits can then be used to reserve available sessions.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-black uppercase text-electric">June Schedule Note</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{juneLaunchScheduleNote}</p>
          </div>
          {services.map((service, index) => (
            <TrainingCard key={service.title} index={index} {...service} />
          ))}
        </div>
      </section>

      <section className="bg-white py-16 sm:py-20">
        <div className="section-shell">
          <SectionHeader
            eyebrow="Session Focus"
            title="Every session has a plan, a tempo, and a clear soccer purpose."
            description="Younger players build foundation and confidence. Older players train speed of play, intensity, finishing, and game-realistic decision making. Shooting & Finishing sessions add focused attacking repetition for players who want more confidence in front of goal."
          />
          <div className="mt-10 grid gap-5 md:grid-cols-4">
            {["Warm-up + ball mastery", "Technical theme", "Pressure reps", "Finish with game actions"].map((item, index) => (
              <article key={item} className="rounded-lg border border-slate-200 bg-white p-5">
                <p className="text-sm font-black text-electric">{String(index + 1).padStart(2, "0")}</p>
                <h2 className="mt-3 text-lg font-black text-navy">{item}</h2>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="special-request" className="bg-mist py-16 sm:py-20">
        <div className="section-shell grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div>
            <p className="text-sm font-black uppercase text-electric">Special Training Request</p>
            <h2 className="mt-3 text-3xl font-black leading-tight text-navy">
              Special Training Request
            </h2>
            <p className="mt-4 leading-7 text-slate-600">
              Have a player outside the standard 9-18 age range, a sibling group, team training request, or a custom
              training need? Submit a special request and Coach Hugo will review the details.
            </p>
            <a
              href="#special-request-form"
              className="mt-6 inline-flex rounded-md bg-electric px-6 py-3 text-sm font-black uppercase text-white shadow-lg shadow-electric/25 transition hover:bg-blue-500"
            >
              Submit Special Request
            </a>
          </div>
          <SpecialRequestForm />
        </div>
      </section>

      <section className="bg-navy py-16 text-white sm:py-20">
        <div className="section-shell flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="max-w-2xl text-3xl font-black leading-tight text-balance">
            Ready for a high-energy group training environment? Start with a booking request.
          </h2>
          <Link
            href="/booking"
            className="inline-flex justify-center rounded-md bg-electric px-7 py-4 text-sm font-black uppercase text-white transition hover:bg-blue-500"
          >
            Book Training
          </Link>
        </div>
      </section>
    </>
  );
}

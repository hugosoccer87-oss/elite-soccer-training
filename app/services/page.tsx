import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/PageHero";
import { SectionHeader } from "@/components/SectionHeader";
import { SpecialRequestForm } from "@/components/SpecialRequestForm";
import { TrainingCard } from "@/components/TrainingCard";
import { services } from "@/lib/site-data";

export const metadata: Metadata = {
  title: "Training",
  description: "Small group soccer training for 1-6 youth players in the Coachella Valley."
};

export default function ServicesPage() {
  return (
    <>
      <PageHero
        eyebrow="Training"
        title="Age-based small group soccer development."
        description="Main small group training serves players ages 9-18. Every session is 60 minutes, $55 per player, with a six-player maximum."
      />

      <section className="bg-mist py-16 sm:py-20">
        <div className="section-shell grid max-w-5xl gap-6">
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
            description="Younger players build foundation and confidence. Older players train speed of play, intensity, finishing, and game-realistic decision making."
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

      <section className="bg-mist py-16 sm:py-20">
        <div className="section-shell grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div>
            <p className="text-sm font-black uppercase text-electric">Special Training Request</p>
            <h2 className="mt-3 text-3xl font-black leading-tight text-navy">
              Custom training for players outside the standard booking flow.
            </h2>
            <p className="mt-4 leading-7 text-slate-600">
              Use this for players under age 9, adult players, sibling groups, team sessions, or custom training
              requests. No payment is collected until Coach Hugo confirms the best arrangement.
            </p>
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

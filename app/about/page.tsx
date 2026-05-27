import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PageHero } from "@/components/PageHero";
import { SectionHeader } from "@/components/SectionHeader";
import { business } from "@/lib/site-data";

export const metadata: Metadata = {
  title: "About Coach Hugo",
  description: "Learn about Coach Hugo Chaparro and the player-development philosophy behind Elite Soccer Training."
};

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="About Coach Hugo"
        title="A focused training environment for players who want to keep improving."
        description="Coach Hugo Chaparro started Elite Soccer Training to give youth players detailed technical work, honest feedback, and a high-energy small group environment built for confidence."
      />

      <section className="bg-white py-16 sm:py-20">
        <div className="section-shell grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div className="relative overflow-hidden rounded-lg">
            <Image
              src="/images/training-hero.png"
              alt="Coach-led youth soccer training session"
              width={920}
              height={680}
              className="aspect-[4/3] w-full object-cover"
            />
          </div>
          <div>
            <SectionHeader
              eyebrow="Coach Profile"
              title={business.coach}
              description="Elite Soccer Training is built on technical detail, positive standards, and practical player development. The goal is to help every player leave with better habits, sharper confidence, and a clearer path for continued growth."
            />
            <div className="mt-8 grid gap-5">
              {[
                {
                  title: "Background / Coaching Experience",
                  copy: "Youth-focused small group training for players who need cleaner technique, faster movement, competitive reps, and more confidence in game situations."
                },
                {
                  title: "Coaching Philosophy",
                  copy: "Train the detail, raise the standard, and make every repetition connect to real soccer decisions."
                },
                {
                  title: "Why EST Started",
                  copy: "To create a premium local option for families in the Coachella Valley who want serious, soccer-specific development."
                }
              ].map((item) => (
                <div key={item.title} className="border-l-4 border-electric bg-mist p-5">
                  <h2 className="text-lg font-black text-navy">{item.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.copy}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-mist py-16 sm:py-20">
        <div className="section-shell grid gap-8 md:grid-cols-3">
          {["Player Development", "Confidence", "Work Ethic"].map((item) => (
            <article key={item} className="panel p-6">
              <h2 className="text-xl font-black text-navy">{item}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Sessions are designed to create repeatable habits that help youth players compete with more clarity and
                belief.
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-white py-16 sm:py-20">
        <div className="section-shell flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black uppercase text-electric">Next Step</p>
            <h2 className="mt-2 text-3xl font-black text-navy">Book a session with Coach Hugo.</h2>
          </div>
          <Link
            href="/booking"
            className="inline-flex justify-center rounded-md bg-electric px-7 py-4 text-sm font-black uppercase text-white shadow-lg shadow-electric/25 transition hover:bg-blue-500"
          >
            Book Training
          </Link>
        </div>
      </section>
    </>
  );
}

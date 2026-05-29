import Image from "next/image";
import Link from "next/link";
import { BallIcon, BoltIcon, ShieldIcon, StarIcon, TargetIcon } from "@/components/Icons";
import { SectionHeader } from "@/components/SectionHeader";
import { TrainingCard } from "@/components/TrainingCard";
import { benefits, business, services } from "@/lib/site-data";

const benefitIcons = [TargetIcon, ShieldIcon, BoltIcon, BallIcon, ShieldIcon];
const coachCards = [
  {
    title: "Coach Hugo's Background",
    copy:
      "Originally from South Gate, Los Angeles, Coach Hugo Chaparro brings 15 years of coaching experience across boys, girls, coed middle school, and high school soccer. He currently coaches with Desert Empire Surf and Desert Christian Academy."
  },
  {
    title: "Coaching Philosophy",
    copy:
      "Every session is built around accountability, detail, intensity, and game-like repetition. The goal is to help players improve their technique, confidence, speed of play, decision-making, and competitive habits."
  },
  {
    title: "Why EST Started",
    copy:
      "After moving to the Coachella Valley in 2019, Coach Hugo created Elite Soccer Training to give local players a focused, professional small group environment to grow, compete, and reach higher levels."
  }
];
const testimonials = [
  {
    name: "Parent of 2012 Player",
    review:
      "The sessions are organized, intense, and focused. My son has already improved his confidence and speed of play."
  },
  {
    name: "Parent of 2014 Player",
    review: "Great small group environment. The training is detailed, competitive, and keeps players engaged."
  },
  {
    name: "Parent of High School Player",
    review: "Coach Hugo creates a professional training environment that pushes players while building confidence."
  }
];

export default function HomePage() {
  return (
    <>
      <section className="relative isolate flex min-h-[calc(100svh-6rem)] items-center overflow-hidden bg-navy text-white">
        <Image
          src="/images/home-hero-athletes.png"
          alt="Coach and youth soccer player training on a field"
          fill
          className="object-cover object-[74%_center] sm:object-[72%_center]"
          priority
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-navy via-navy/80 to-navy/15" />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-navy to-transparent" />

        <div className="section-shell relative z-10 py-16">
          <div className="max-w-3xl">
            <Image
              src="/images/est-logo.png"
              alt="Elite Soccer Training logo"
              width={138}
              height={127}
              className="mb-7 h-24 w-28 object-contain"
            />
            <p className="text-sm font-black uppercase text-electric">Coachella Valley</p>
            <h1 className="mt-4 text-5xl font-black leading-none text-balance sm:text-6xl lg:text-7xl">
              {business.tagline}
            </h1>
            <p className="mt-6 max-w-[20rem] text-lg leading-8 text-slate-100 sm:max-w-2xl sm:text-xl">
              {business.subheadline}
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/booking"
                className="inline-flex justify-center rounded-md bg-electric px-7 py-4 text-sm font-black uppercase text-white shadow-xl shadow-electric/25 transition hover:bg-blue-500"
              >
                Book Training
              </Link>
              <Link
                href="/services"
                className="inline-flex justify-center rounded-md border border-white/30 bg-white/10 px-7 py-4 text-sm font-black uppercase text-white transition hover:bg-white/20"
              >
                View Programs
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-navy py-14 text-white sm:py-16">
        <div className="section-shell">
          <div className="max-w-3xl">
            <p className="text-sm font-black uppercase text-electric">Trusted Training</p>
            <h2 className="mt-3 text-3xl font-black leading-tight text-white sm:text-4xl">
              Organized, professional, high-energy sessions built for player development.
            </h2>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              ["Professional Standards", "Clear session structure, simple communication, and a serious training environment."],
              ["Competitive Energy", "Players train with tempo, pressure, and accountability in every small group."],
              ["Development Focus", "Every activity is selected to improve confidence, technique, and game performance."]
            ].map(([title, copy]) => (
              <article key={title} className="rounded-lg border border-white/15 bg-white/10 p-5">
                <p className="text-sm font-black uppercase text-electric">{title}</p>
                <p className="mt-3 text-sm leading-6 text-slate-300">{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-16 sm:py-20">
        <div className="section-shell grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div className="relative overflow-hidden rounded-lg">
            <Image
              src="/images/coach-hugo.jpg"
              alt="Coach Hugo Chaparro, Elite Soccer Training"
              width={900}
              height={610}
              className="aspect-[4/3] w-full object-cover object-[50%_24%]"
            />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-navy/90 to-transparent p-6 text-white">
              <p className="text-sm font-black uppercase text-electric">Coach Hugo Chaparro</p>
              <p className="mt-2 max-w-sm text-sm leading-6 text-slate-100">
                Player-first coaching with a premium, structured training environment.
              </p>
            </div>
          </div>
          <div>
            <SectionHeader
              eyebrow="The Elite Soccer Training Difference"
              title="REAL DEVELOPMENT. REAL CONFIDENCE."
              description="Elite Soccer Training uses technical repetition, game-realistic training, confidence building, speed of play, competitive standards, and small group attention to help youth players develop with purpose."
            />
            <div className="mt-8 grid gap-4">
              {coachCards.map((card) => (
                <div key={card.title} className="border-l-4 border-electric bg-mist p-5">
                  <h3 className="text-lg font-black text-navy">{card.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{card.copy}</p>
                </div>
              ))}
            </div>
            <Link
              href="/about"
              className="mt-8 inline-flex rounded-md border border-navy px-6 py-3 text-sm font-black text-navy transition hover:border-electric hover:text-electric"
            >
              Meet Coach Hugo
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-mist py-16 sm:py-20">
        <div className="section-shell">
          <SectionHeader
            eyebrow="Programs"
            title="Age-based soccer development groups."
            description="Future Elite builds foundation for ages 9-12. Elite Performance pushes ages 13-18 with speed, intensity, finishing, and game-realistic repetition."
          />
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            {services.map((service, index) => (
              <TrainingCard key={service.title} index={index} {...service} />
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white py-16 sm:py-20">
        <div className="section-shell grid gap-10 lg:grid-cols-[1fr_0.8fr] lg:items-center">
          <SectionHeader
            eyebrow="Why Train With Us"
            title="A premium group training environment parents can trust."
            description="Sessions are structured, purposeful, and built around measurable player growth, competitive energy, and game-realistic repetition."
          />
          <div className="grid gap-4">
            {benefits.map((benefit, index) => {
              const Icon = benefitIcons[index];

              return (
                <article key={benefit.title} className="rounded-lg border border-slate-200 bg-white p-5">
                  <Icon className="h-8 w-8 text-electric" />
                  <h3 className="mt-4 text-lg font-black text-navy">{benefit.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{benefit.description}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-mist py-16 sm:py-20">
        <div className="section-shell">
          <SectionHeader
            eyebrow="Testimonials"
            title="PARENT REVIEWS"
            description="Hear from families who trust Elite Soccer Training."
          />
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {testimonials.map((testimonial) => (
              <article key={testimonial.name} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex gap-1 text-electric">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <StarIcon key={`${testimonial.name}-${index}`} className="h-4 w-4" />
                  ))}
                </div>
                <p className="mt-5 text-base font-semibold leading-7 text-slate-700">"{testimonial.review}"</p>
                <p className="mt-6 border-t border-slate-200 pt-4 text-sm font-black uppercase text-navy">
                  {testimonial.name}
                </p>
              </article>
            ))}
          </div>
          <Link
            href="/booking"
            className="mt-8 inline-flex w-full justify-center rounded-md bg-electric px-7 py-4 text-sm font-black uppercase text-white shadow-xl shadow-electric/25 transition hover:bg-blue-500 sm:w-fit"
          >
            Book Training
          </Link>
        </div>
      </section>

      <section className="bg-navy py-16 text-white sm:py-20">
        <div className="section-shell grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-sm font-black uppercase text-electric">Ready To Train</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-black leading-tight text-balance sm:text-5xl">
              Reserve a small group training session online.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300">
              Choose the right age group, select an available 60-minute session, sign the waiver, and complete payment
              in one clean flow.
            </p>
          </div>
          <Link
            href="/booking"
            className="inline-flex justify-center rounded-md bg-electric px-8 py-4 text-sm font-black uppercase text-white shadow-xl shadow-electric/25 transition hover:bg-blue-500"
          >
            Book A Session
          </Link>
        </div>
      </section>
    </>
  );
}

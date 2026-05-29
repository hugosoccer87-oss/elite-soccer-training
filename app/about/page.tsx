import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PageHero } from "@/components/PageHero";
import { SectionHeader } from "@/components/SectionHeader";

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
        description="Coach Hugo Chaparro brings 15 years of coaching experience, a deep connection to the game, and a personal commitment to helping Coachella Valley youth players reach higher levels."
      />

      <section className="bg-white py-16 sm:py-20">
        <div className="section-shell grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div className="relative overflow-hidden rounded-lg">
            <Image
              src="/images/coach-hugo.jpg"
              alt="Coach Hugo Chaparro, Elite Soccer Training"
              width={920}
              height={680}
              className="aspect-[4/3] w-full object-cover object-[50%_24%]"
            />
          </div>
          <div>
            <SectionHeader
              eyebrow="Coach Profile"
              title="About Coach Hugo"
            />
            <div className="mt-7 grid max-w-3xl gap-4 text-sm leading-7 text-slate-600 sm:text-base">
              <p>
                Coach Hugo Chaparro is originally from Los Angeles, specifically South Gate, where soccer became a
                major part of his life at a young age. He grew up playing pickup soccer at the park, recreational
                soccer, and with Pachuca USA before playing high school soccer at South Gate High School, where he was
                part of a CIF championship-winning team in 2005.
              </p>
              <p>
                In 2019, Coach Hugo moved to the Coachella Valley with his family. The valley has been great to him and
                his family, and through soccer he has had the opportunity to meet many friends, families, and athletes
                across the local community. Elite Soccer Training was created as a way to give back to the game and help
                Coachella Valley youth players develop, compete, and reach higher levels.
              </p>
              <p>
                Coach Hugo brings 15 years of coaching experience and currently coaches with Desert Empire Surf and
                Desert Christian Academy, working with coed middle school players, high school girls, and competitive
                youth players across multiple age groups. His coaching background includes boys 2006, boys 2011, and
                girls 2010 teams, along with players at different stages of development.
              </p>
              <p>
                Coach Hugo holds a D License and is currently working toward his C License. He has also completed
                numerous coaching education courses, most recently attending a course with Club América.
              </p>
              <p>
                His training approach is built around accountability, detail, intensity, and game-like repetition. He
                believes small group training gives players more touches, more individual attention, more competitive
                reps, and more opportunities to solve real soccer situations.
              </p>
              <p>
                Parents appreciate the accountability Coach Hugo expects from each athlete and the way he pushes players
                to train with purpose. Players enjoy the intensity, competitiveness, and energy of the sessions while
                still being challenged in a fun and positive environment.
              </p>
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

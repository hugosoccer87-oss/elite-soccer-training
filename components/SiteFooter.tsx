import Image from "next/image";
import Link from "next/link";
import { business, navItems, socialLinks } from "@/lib/site-data";
import { MailIcon, PhoneIcon, PinIcon, SocialIcon } from "./Icons";

export function SiteFooter() {
  return (
    <footer className="bg-ink text-white">
      <div className="section-shell grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-3">
            <Image src="/images/est-cv-logo.png" alt="" width={80} height={80} className="h-16 w-16 object-contain" />
            <div>
              <p className="text-lg font-black">{business.name}</p>
              <p className="text-sm text-slate-300">Small group soccer training for 1-6 players</p>
            </div>
          </div>
          <p className="mt-5 max-w-md text-sm leading-6 text-slate-300">
            Premium small group soccer development with high-energy technical reps, confidence-building competition,
            and game-realistic training across the Coachella Valley.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {socialLinks.map((item) => (
              <a
                key={item.label}
                href={item.href}
                aria-label={item.label}
                title={item.handle ?? item.label}
                className="flex h-10 w-10 items-center justify-center rounded-md border border-white/20 text-slate-200 transition hover:border-electric hover:text-electric"
              >
                <SocialIcon label={item.label} className="h-7 w-7" />
              </a>
            ))}
          </div>
          <a
            href={business.instagramUrl}
            className="mt-4 inline-flex text-sm font-bold text-slate-300 transition hover:text-electric"
          >
            Instagram {business.instagramHandle}
          </a>
        </div>

        <div>
          <p className="text-sm font-black uppercase text-electric">Quick Links</p>
          <div className="mt-4 grid gap-2">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className="text-sm text-slate-300 hover:text-white">
                {item.label}
              </Link>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-black uppercase text-electric">Contact</p>
          <div className="mt-4 grid gap-3 text-sm text-slate-300">
            <a href={`mailto:${business.email}`} className="flex gap-3 hover:text-white">
              <MailIcon className="mt-0.5 h-5 w-5 shrink-0 text-electric" />
              <span>{business.email}</span>
            </a>
            <a href={business.phoneHref} className="flex gap-3 hover:text-white">
              <PhoneIcon className="mt-0.5 h-5 w-5 shrink-0 text-electric" />
              <span>{business.phone}</span>
            </a>
            <p className="flex gap-3">
              <PinIcon className="mt-0.5 h-5 w-5 shrink-0 text-electric" />
              <span>{business.location}</span>
            </p>
          </div>
        </div>
      </div>
      <div className="border-t border-white/10 py-5">
        <div className="section-shell flex flex-col gap-2 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <p>Copyright 2026 {business.name}. All rights reserved.</p>
          <p>Built for youth player development in the Coachella Valley.</p>
        </div>
      </div>
    </footer>
  );
}

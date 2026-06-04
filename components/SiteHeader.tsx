import Image from "next/image";
import Link from "next/link";
import { business, navItems } from "@/lib/site-data";
import { MenuIcon, PhoneIcon } from "./Icons";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-navy/90 text-white backdrop-blur-xl">
      <div className="section-shell flex min-h-20 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3" aria-label={`${business.name} home`}>
          <Image
            src="/images/est-cv-logo.png"
            alt="Elite Soccer Training CV logo"
            width={72}
            height={72}
            className="h-14 w-14 object-contain"
            priority
          />
          <div className="hidden leading-tight sm:block">
            <p className="text-sm font-black uppercase text-white">{business.name}</p>
            <p className="text-xs font-semibold text-slate-300">Coachella Valley Soccer Training</p>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary navigation">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm font-bold text-slate-200 transition hover:bg-white/10 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <Link
          href="/booking"
          className="hidden rounded-md bg-electric px-5 py-3 text-sm font-black text-white shadow-lg shadow-electric/25 transition hover:bg-blue-500 lg:inline-flex"
        >
          Book Training
        </Link>

        <div className="ml-auto flex items-center gap-2 lg:hidden">
          <a
            href={business.phoneHref}
            aria-label={`Call ${business.phone}`}
            className="flex h-11 w-11 items-center justify-center rounded-md border border-white/20 bg-white/10 text-white transition hover:bg-white/20"
          >
            <PhoneIcon className="h-5 w-5" />
          </a>
        </div>

        <details className="group relative lg:hidden">
          <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-md border border-white/20 bg-white/10 text-white transition hover:bg-white/20">
            <MenuIcon className="h-6 w-6" />
            <span className="sr-only">Open menu</span>
          </summary>
          <div className="absolute right-0 mt-3 w-64 rounded-lg border border-white/10 bg-navy p-3 shadow-2xl">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-md px-4 py-3 text-sm font-bold text-slate-100 hover:bg-white/10"
              >
                {item.label}
              </Link>
            ))}
            <a
              href={business.phoneHref}
              className="mt-2 block rounded-md bg-electric px-4 py-3 text-sm font-black text-white"
            >
              Call {business.phone}
            </a>
            <a
              href={business.instagramUrl}
              className="block rounded-md px-4 py-3 text-sm font-bold text-slate-100 hover:bg-white/10"
            >
              Instagram {business.instagramHandle}
            </a>
          </div>
        </details>
      </div>
    </header>
  );
}

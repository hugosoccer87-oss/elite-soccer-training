"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function MobileStickyBookButton() {
  const pathname = usePathname();
  const shouldHide = pathname === "/pay" || pathname.startsWith("/booking") || pathname.startsWith("/admin");

  if (shouldHide) {
    return null;
  }

  return (
    <div className="fixed inset-x-4 bottom-3 z-40 md:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <Link
        href="/booking"
        className="mx-auto flex max-w-sm items-center justify-center rounded-md bg-electric px-5 py-3 text-sm font-black uppercase text-white shadow-xl shadow-navy/25 transition hover:bg-blue-500"
      >
        Book Training
      </Link>
    </div>
  );
}

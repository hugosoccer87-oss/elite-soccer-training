import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { MobileStickyBookButton } from "@/components/MobileStickyBookButton";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { business } from "@/lib/site-data";

export const metadata: Metadata = {
  title: {
    default: `${business.name} | Small Group Soccer Training in Coachella Valley`,
    template: `%s | ${business.name}`
  },
  description:
    "Small group soccer training for 1-6 players in the Coachella Valley, led by Coach Hugo Chaparro.",
  keywords: [
    "Coachella Valley soccer training",
    "Coachella Valley soccer coach",
    "small group soccer training",
    "elite soccer development",
    "youth soccer training",
    "Elite Soccer Training CV"
  ],
  openGraph: {
    title: `${business.name} | Small Group Soccer Training`,
    description: business.subheadline,
    images: ["/images/home-hero-athletes.png"]
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <SiteHeader />
        <main className="pb-20 md:pb-0">{children}</main>
        <SiteFooter />
        <MobileStickyBookButton />
      </body>
    </html>
  );
}

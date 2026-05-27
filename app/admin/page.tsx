import type { Metadata } from "next";
import { AdminAvailability } from "@/components/AdminAvailability";
import { AdminGate } from "@/components/AdminGate";
import { PageHero } from "@/components/PageHero";

export const metadata: Metadata = {
  title: "Admin Availability",
  description: "Manage Elite Soccer Training availability and booked slots.",
  robots: {
    index: false,
    follow: false
  }
};

export default function AdminPage() {
  return (
    <AdminGate>
      <>
        <PageHero
          eyebrow="Admin"
          title="Set availability and manage booked training slots."
          description="Add separate program times, block unavailable days, and manage six-player session capacity."
        />
        <section className="bg-mist py-16 sm:py-20">
          <div className="section-shell">
            <AdminAvailability />
          </div>
        </section>
      </>
    </AdminGate>
  );
}

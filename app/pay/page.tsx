import type { Metadata } from "next";
import { DirectPayForm } from "@/components/DirectPayForm";
import { PageHero } from "@/components/PageHero";

export const metadata: Metadata = {
  title: "Pay + Waiver",
  description: "Complete direct payment and parent waiver for Elite Soccer Training CV."
};

export default function PayPage() {
  return (
    <>
      <PageHero
        eyebrow="Direct Payment"
        title="PAY + WAIVER"
        description="For families who already attended a session or were asked by Coach Hugo to complete payment directly."
      />

      <section className="bg-mist py-16 sm:py-20">
        <div className="section-shell">
          <DirectPayForm />
        </div>
      </section>
    </>
  );
}

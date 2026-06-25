import type { Metadata } from "next";
import { DirectPayForm } from "@/components/DirectPayForm";

export const metadata: Metadata = {
  title: "Complete Your EST CV Payment",
  description: "Submit payment and required parent/player information for Elite Soccer Training CV."
};

export default function PayPage() {
  return (
    <>
      <section className="bg-navy text-white">
        <div className="section-shell py-8 sm:py-10">
          <h1 className="max-w-4xl text-3xl font-black leading-tight text-balance sm:text-4xl">
            Complete Your EST CV Payment
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-slate-300">
            Use this secure page to submit payment and complete the required parent/player information.
          </p>
        </div>
      </section>

      <section className="bg-mist py-10 sm:py-14">
        <div className="section-shell">
          <DirectPayForm />
        </div>
      </section>
    </>
  );
}

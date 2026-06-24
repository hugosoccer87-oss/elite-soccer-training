import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/PageHero";

export const metadata: Metadata = {
  title: "Direct Payment Canceled",
  description: "Elite Soccer Training CV direct card payment canceled."
};

export default function PayCancelPage() {
  return (
    <>
      <PageHero
        eyebrow="Payment Canceled"
        title="Direct payment was not completed."
        description="No card payment was completed. Return to Pay + Waiver when you are ready to finish."
      />

      <section className="bg-mist py-16 sm:py-20">
        <div className="section-shell max-w-3xl">
          <div className="panel p-6 sm:p-8">
            <p className="text-sm font-black uppercase text-electric">Payment Not Completed</p>
            <h2 className="mt-3 text-3xl font-black text-navy">Your direct payment is still pending.</h2>
            <p className="mt-4 leading-7 text-slate-600">
              If you were asked to complete payment directly, please return to the Pay + Waiver page and choose card or
              Zelle.
            </p>
            <Link
              href="/pay"
              className="mt-6 inline-flex justify-center rounded-md bg-electric px-6 py-3 text-sm font-black uppercase text-white shadow-lg shadow-electric/25 transition hover:bg-blue-500"
            >
              Return To Pay + Waiver
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

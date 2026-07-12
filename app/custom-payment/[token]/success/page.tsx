import Link from "next/link";
import { business } from "@/lib/site-data";
import { getCustomPaymentLinkByToken } from "@/lib/supabase-db";

export const dynamic = "force-dynamic";

export default async function CustomPaymentSuccessPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const details = await getCustomPaymentLinkByToken(token);

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-2xl px-5 py-20 text-center">
        <img src="/images/est-cv-logo.png" alt="Elite Soccer Training CV" className="mx-auto h-24 w-24 object-contain" />
        <p className="mt-6 text-xs font-black uppercase text-electric">Payment Received</p>
        <h1 className="mt-3 text-4xl font-black text-slate-950">Thank You</h1>
        <p className="mt-4 text-lg leading-8 text-slate-600">
          Your EST CV payment has been submitted. If sessions were selected, confirmation details will be sent after payment is verified.
        </p>
        {details ? (
          <div className="mt-8 rounded-[10px] border border-slate-200 bg-white p-5 text-left shadow-sm">
            <p className="text-sm font-black uppercase text-slate-500">Private link details</p>
            <p className="mt-3 font-black text-slate-950">Player: {details.link.player_name}</p>
            <p className="mt-1 text-sm text-slate-600">Status: {details.link.status.replaceAll("_", " ")}</p>
          </div>
        ) : null}
        <Link className="mt-8 inline-flex rounded-[8px] bg-electric px-5 py-3 font-black uppercase text-white" href="/">
          Back to EST CV
        </Link>
        <p className="mt-6 text-sm text-slate-500">
          Questions? Email {business.email} or call {business.phone}.
        </p>
      </div>
    </main>
  );
}

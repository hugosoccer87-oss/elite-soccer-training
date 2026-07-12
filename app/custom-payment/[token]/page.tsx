import Link from "next/link";
import { CustomPaymentLinkForm } from "@/components/CustomPaymentLinkForm";
import { business } from "@/lib/site-data";
import {
  getCustomPaymentLinkByToken,
  getSupabaseAvailability,
  markCustomPaymentLinkViewed
} from "@/lib/supabase-db";

export const dynamic = "force-dynamic";

export default async function CustomPaymentLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const details = await getCustomPaymentLinkByToken(token);

  if (!details) {
    return (
      <main className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-2xl px-5 py-20 text-center">
          <p className="text-xs font-black uppercase text-electric">Private Link</p>
          <h1 className="mt-3 text-4xl font-black text-slate-950">Link Not Found</h1>
          <p className="mt-4 text-slate-600">This private EST CV payment link could not be found.</p>
          <Link className="mt-8 inline-flex rounded-[8px] bg-electric px-5 py-3 font-black uppercase text-white" href="/contact">
            Contact EST CV
          </Link>
        </div>
      </main>
    );
  }

  await markCustomPaymentLinkViewed(token);

  const availability = await getSupabaseAvailability();

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-white/10 bg-slate-950">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-4">
          <img src="/images/est-cv-logo.png" alt="Elite Soccer Training CV" className="h-16 w-16 object-contain" />
          <div>
            <p className="text-lg font-black uppercase text-white">{business.name}</p>
            <p className="text-sm font-bold text-slate-300">Private payment link</p>
          </div>
        </div>
      </header>
      <CustomPaymentLinkForm
        link={{
          token: details.link.token,
          playerName: details.link.player_name,
          playerAge: details.link.player_age,
          parentName: details.link.parent_name,
          parentEmail: details.link.parent_email,
          parentPhone: details.link.parent_phone,
          trainingGroup: details.link.training_group,
          planType: details.link.plan_type,
          linkMode: details.link.link_mode,
          amountCents: details.link.amount_cents,
          notesToParent: details.link.notes_to_parent,
          suggestedAvailability: details.link.suggested_availability,
          proposedSessionIds: details.link.proposed_session_ids,
          status: details.link.status,
          totalCredits: details.link.total_credits
        }}
        sessions={availability.sessions}
      />
    </main>
  );
}

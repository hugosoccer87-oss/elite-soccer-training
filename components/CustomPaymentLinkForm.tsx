"use client";

import { useMemo, useState } from "react";
import type { PublicAvailableSession } from "@/lib/public-availability";
import { formatCurrencyFromCents } from "@/lib/pricing";
import type { CustomPaymentLinkMode, CustomPaymentLinkPlanType } from "@/lib/supabase-db";

type CustomPaymentLinkClient = {
  token: string;
  playerName: string;
  playerAge: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  trainingGroup: string;
  planType: CustomPaymentLinkPlanType;
  linkMode: CustomPaymentLinkMode;
  amountCents: number;
  notesToParent?: string | null;
  suggestedAvailability?: string | null;
  proposedSessionIds: string[];
  status: string;
  totalCredits: number;
};

type Props = {
  link: CustomPaymentLinkClient;
  sessions: PublicAvailableSession[];
};

const planLabels: Record<CustomPaymentLinkPlanType, string> = {
  single_session: "Single Session",
  four_session_training_package: "4-Session Training Package",
  six_session_training_package: "6-Session Training Package",
  private_1_on_1: "Private 1-on-1 Session",
  custom_amount: "Custom Amount"
};

function maxSelectable(link: CustomPaymentLinkClient) {
  if (link.planType === "single_session") return 1;
  if (link.planType === "four_session_training_package") return 4;
  if (link.planType === "six_session_training_package") return 6;
  return 0;
}

function isPaymentOnly(link: CustomPaymentLinkClient) {
  return link.linkMode === "payment_only" || link.planType === "private_1_on_1" || link.planType === "custom_amount";
}

export function CustomPaymentLinkForm({ link, sessions }: Props) {
  const selectableLimit = maxSelectable(link);
  const paymentOnly = isPaymentOnly(link);
  const proposedSet = useMemo(() => new Set(link.proposedSessionIds), [link.proposedSessionIds]);
  const availableSessions = useMemo(() => {
    const groupSessions = sessions.filter((session) => session.trainingGroupId === link.trainingGroup);

    if (link.linkMode === "payment_plus_confirm_proposed_schedule") {
      return groupSessions.filter((session) => proposedSet.has(session.id));
    }

    if (paymentOnly) {
      return [];
    }

    return groupSessions;
  }, [link.linkMode, link.trainingGroup, paymentOnly, proposedSet, sessions]);
  const initialSelected =
    link.linkMode === "payment_plus_confirm_proposed_schedule"
      ? availableSessions.slice(0, selectableLimit || availableSessions.length).map((session) => session.id)
      : [];
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>(initialSelected);
  const [notes, setNotes] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [medicalNotes, setMedicalNotes] = useState("");
  const [mediaConsent, setMediaConsent] = useState<"Granted" | "Declined" | "">("");
  const [guardianSignature, setGuardianSignature] = useState("");
  const [waiverAccepted, setWaiverAccepted] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const needsWaiver = selectedSessionIds.length > 0;
  const planLabel = planLabels[link.planType];
  const isClosed = ["paid", "partially_scheduled", "fully_scheduled", "cancelled"].includes(link.status);

  function toggleSession(sessionId: string) {
    setError("");
    setSelectedSessionIds((current) => {
      if (current.includes(sessionId)) {
        return current.filter((id) => id !== sessionId);
      }

      if (selectableLimit > 0 && current.length >= selectableLimit) {
        setError("You have used all available training credits. Please purchase another session or package to continue booking.");
        return current;
      }

      return [...current, sessionId];
    });
  }

  async function submit() {
    setError("");

    if (isClosed) {
      setError("This private payment link is no longer active.");
      return;
    }

    if (!paymentOnly && selectedSessionIds.length < 1) {
      setError("Choose at least one session before continuing to payment.");
      return;
    }

    if (needsWaiver) {
      if (!emergencyName.trim() || !emergencyPhone.trim() || !medicalNotes.trim() || !mediaConsent || !guardianSignature.trim() || !waiverAccepted) {
        setError("Complete the emergency details and signed waiver before continuing.");
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/custom-payment-links/${link.token}/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          selectedSessionIds,
          notes,
          emergencyName,
          emergencyPhone,
          medicalNotes,
          mediaConsent,
          guardianSignature,
          waiverAccepted
        })
      });
      const result = (await response.json().catch(() => ({}))) as { checkoutUrl?: string; error?: string };

      if (!response.ok || !result.checkoutUrl) {
        throw new Error(result.error || "Payment could not be started.");
      }

      window.location.href = result.checkoutUrl;
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Payment could not be started.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-12 sm:py-16">
      <div className="rounded-[10px] border border-white/10 bg-slate-950 p-6 text-white shadow-2xl shadow-slate-950/20 sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-electric">Private EST CV Link</p>
        <h1 className="mt-3 text-3xl font-black uppercase tracking-tight sm:text-5xl">Complete Your Payment</h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-300">
          Review the details below, choose the allowed sessions if needed, and continue to secure card payment.
        </p>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <aside className="rounded-[10px] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase text-electric">Payment Details</p>
          <h2 className="mt-2 text-2xl font-black text-slate-950">{planLabel}</h2>
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
              <dt className="font-bold text-slate-500">Player</dt>
              <dd className="text-right font-black text-slate-950">{link.playerName}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
              <dt className="font-bold text-slate-500">Player age</dt>
              <dd className="text-right font-black text-slate-950">{link.playerAge}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
              <dt className="font-bold text-slate-500">Parent</dt>
              <dd className="text-right font-black text-slate-950">{link.parentName}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
              <dt className="font-bold text-slate-500">Amount due</dt>
              <dd className="text-right text-xl font-black text-slate-950">{formatCurrencyFromCents(link.amountCents)}</dd>
            </div>
            {link.totalCredits > 0 ? (
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
                <dt className="font-bold text-slate-500">Training credits</dt>
                <dd className="text-right font-black text-slate-950">{link.totalCredits}</dd>
              </div>
            ) : null}
          </dl>
          {link.notesToParent ? (
            <div className="mt-5 rounded-[8px] bg-slate-50 p-4 text-sm leading-6 text-slate-700">
              <p className="font-black text-slate-950">Notes from Coach Hugo</p>
              <p className="mt-2">{link.notesToParent}</p>
            </div>
          ) : null}
          {link.suggestedAvailability ? (
            <div className="mt-4 rounded-[8px] bg-blue-50 p-4 text-sm leading-6 text-slate-700">
              <p className="font-black text-slate-950">Suggested Availability</p>
              <p className="mt-2 whitespace-pre-line">{link.suggestedAvailability}</p>
            </div>
          ) : null}
        </aside>

        <main className="rounded-[10px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          {isClosed ? (
            <div className="rounded-[8px] border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">
              This private payment link is no longer active. Please contact Coach Hugo if you need a new link.
            </div>
          ) : null}

          {!paymentOnly ? (
            <section>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase text-electric">Choose Sessions</p>
                  <h2 className="mt-1 text-2xl font-black text-slate-950">
                    {link.linkMode === "payment_plus_confirm_proposed_schedule" ? "Confirm Proposed Schedule" : "Select Training Sessions"}
                  </h2>
                </div>
                <p className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase text-slate-700">
                  {selectedSessionIds.length}/{selectableLimit} selected
                </p>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Parents can only book the number of sessions included with this private link.
              </p>

              <div className="mt-5 grid gap-3">
                {availableSessions.length > 0 ? (
                  availableSessions.map((session) => {
                    const selected = selectedSessionIds.includes(session.id);

                    return (
                      <button
                        key={session.id}
                        type="button"
                        onClick={() => toggleSession(session.id)}
                        className={`rounded-[8px] border p-4 text-left transition ${
                          selected ? "border-electric bg-blue-50 ring-2 ring-electric/20" : "border-slate-200 bg-white hover:border-electric"
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-lg font-black text-slate-950">
                              {session.dayLabel}, {session.dateLabel}
                            </p>
                            <p className="mt-1 font-black text-electric">
                              {session.startTime} - {session.endTime}
                            </p>
                            <p className="mt-2 text-sm font-bold text-slate-700">
                              {session.trainingFocus || "General Training"} - {session.trainingGroup} {session.trainingGroupAges}
                            </p>
                            <p className="mt-1 text-sm text-slate-600">{session.location}</p>
                          </div>
                          <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black uppercase text-white">
                            {session.remainingSpots} spots
                          </span>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-[8px] border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-700">
                    No open sessions are available for this private link. Please contact Coach Hugo.
                  </div>
                )}
              </div>
            </section>
          ) : (
            <div className="rounded-[8px] border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
              <p className="font-black text-slate-950">No session selection required</p>
              <p className="mt-1">This private link is for payment only. Coach Hugo will follow up if scheduling is needed.</p>
            </div>
          )}

          {needsWaiver ? (
            <section className="mt-8 border-t border-slate-200 pt-6">
              <p className="text-xs font-black uppercase text-electric">Waiver & Contact</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">Parent Waiver</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                By signing below, I confirm this waiver applies to the player listed on this private payment link.
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-black text-slate-950">
                  Emergency contact name *
                  <input className="mt-2 w-full rounded-[8px] border border-slate-300 px-3 py-3 font-bold text-slate-950" value={emergencyName} onChange={(event) => setEmergencyName(event.target.value)} />
                </label>
                <label className="text-sm font-black text-slate-950">
                  Emergency contact phone *
                  <input className="mt-2 w-full rounded-[8px] border border-slate-300 px-3 py-3 font-bold text-slate-950" value={emergencyPhone} onChange={(event) => setEmergencyPhone(event.target.value)} />
                </label>
                <label className="text-sm font-black text-slate-950 sm:col-span-2">
                  Medical Conditions / Allergies / Notes *
                  <span className="mt-1 block text-xs font-bold text-slate-500">Type "None" if not applicable.</span>
                  <textarea className="mt-2 min-h-24 w-full rounded-[8px] border border-slate-300 px-3 py-3 font-bold text-slate-950" value={medicalNotes} onChange={(event) => setMedicalNotes(event.target.value)} />
                </label>
                <label className="text-sm font-black text-slate-950 sm:col-span-2">
                  Optional notes
                  <textarea className="mt-2 min-h-20 w-full rounded-[8px] border border-slate-300 px-3 py-3 font-bold text-slate-950" value={notes} onChange={(event) => setNotes(event.target.value)} />
                </label>
                <label className="text-sm font-black text-slate-950">
                  Media consent *
                  <select className="mt-2 w-full rounded-[8px] border border-slate-300 px-3 py-3 font-bold text-slate-950" value={mediaConsent} onChange={(event) => setMediaConsent(event.target.value as "Granted" | "Declined" | "")}>
                    <option value="">Select one</option>
                    <option value="Granted">Yes, media consent granted</option>
                    <option value="Declined">No, media consent declined</option>
                  </select>
                </label>
                <label className="text-sm font-black text-slate-950">
                  Parent/guardian signature *
                  <input className="mt-2 w-full rounded-[8px] border border-slate-300 px-3 py-3 font-bold text-slate-950" value={guardianSignature} onChange={(event) => setGuardianSignature(event.target.value)} />
                </label>
              </div>
              <label className="mt-5 flex gap-3 rounded-[8px] border border-slate-200 bg-slate-50 p-4 text-sm font-bold leading-6 text-slate-700">
                <input type="checkbox" className="mt-1 h-5 w-5" checked={waiverAccepted} onChange={(event) => setWaiverAccepted(event.target.checked)} />
                <span>I have read and agree to the Elite Soccer Training CV participation waiver and release of liability.</span>
              </label>
            </section>
          ) : null}

          {error ? (
            <div className="mt-6 rounded-[8px] border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
              {error}
            </div>
          ) : null}

          <button
            type="button"
            disabled={isSubmitting || isClosed}
            onClick={submit}
            className="mt-6 w-full rounded-[8px] bg-electric px-5 py-4 text-base font-black uppercase text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isSubmitting ? "Opening secure payment..." : "Continue to Secure Payment"}
          </button>
        </main>
      </div>
    </div>
  );
}

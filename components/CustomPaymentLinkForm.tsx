"use client";

import { useMemo, useState } from "react";
import type { PublicAvailableSession } from "@/lib/public-availability";
import { formatCurrencyFromCents } from "@/lib/pricing";
import {
  customPaymentLinkOptionMeta,
  normalizeCustomPaymentLinkOptions,
  type CustomPaymentLinkMode,
  type CustomPaymentLinkPlanType,
  type PrivateSessionAvailabilityRow
} from "@/lib/supabase-db";
import { waiverSections } from "@/lib/waiver-content";

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
  privateSessionAmountCents: number;
  allowedPurchaseOptions: CustomPaymentLinkPlanType[];
  selectedPlanType?: CustomPaymentLinkPlanType | null;
  selectedAmountCents?: number | null;
  selectedTotalCredits?: number | null;
  notesToParent?: string | null;
  suggestedAvailability?: string | null;
  proposedSessionIds: string[];
  allowedPrivateSessionIds: string[];
  status: string;
  totalCredits: number;
};

type Props = {
  link: CustomPaymentLinkClient;
  sessions: PublicAvailableSession[];
  privateSessions: PrivateSessionAvailabilityRow[];
};

const planLabels: Record<CustomPaymentLinkPlanType, string> = {
  single_session: "Single Session",
  four_session_training_package: "4-Session Training Package",
  six_session_training_package: "6-Session Training Package",
  private_1_on_1: "Private 1-on-1 Session",
  custom_amount: "Custom Amount"
};

const parentSelectablePlanTypes: CustomPaymentLinkPlanType[] = [
  "single_session",
  "four_session_training_package",
  "six_session_training_package"
];

function maxSelectable(planType: CustomPaymentLinkPlanType) {
  if (planType === "single_session") return 1;
  if (planType === "private_1_on_1") return 1;
  if (planType === "four_session_training_package") return 4;
  if (planType === "six_session_training_package") return 6;
  return 0;
}

function isPaymentOnly(link: CustomPaymentLinkClient) {
  return link.linkMode === "payment_only" || link.planType === "custom_amount";
}

function formatPrivateDay(value: string, timeZone = "America/Los_Angeles") {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(new Date(value));
}

function formatPrivateTime(value: string, timeZone = "America/Los_Angeles") {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function initialParentValue(value: string) {
  if (!value || value === "Parent will complete" || value === "pending@elitesoccertrainingcv.com") {
    return "";
  }

  return value;
}

export function CustomPaymentLinkForm({ link, sessions, privateSessions }: Props) {
  const allowedPurchaseOptions = useMemo<CustomPaymentLinkPlanType[]>(
    () => {
      const normalized = normalizeCustomPaymentLinkOptions(link.allowedPurchaseOptions, link.planType).filter(
        (option) => parentSelectablePlanTypes.includes(option) || option === "custom_amount"
      );

      if (normalized.length > 0) {
        return normalized;
      }

      if (link.planType === "custom_amount") {
        return ["custom_amount" as CustomPaymentLinkPlanType];
      }

      return parentSelectablePlanTypes.includes(link.planType) ? [link.planType] : ["single_session" as CustomPaymentLinkPlanType];
    },
    [link.allowedPurchaseOptions, link.planType]
  );
  const initialPlanType =
    link.selectedPlanType && allowedPurchaseOptions.includes(link.selectedPlanType)
      ? link.selectedPlanType
      : allowedPurchaseOptions[0] ?? link.planType;
  const [selectedPlanType, setSelectedPlanType] = useState<CustomPaymentLinkPlanType>(initialPlanType);
  const selectedOption = customPaymentLinkOptionMeta(
    selectedPlanType,
    link.privateSessionAmountCents,
    link.selectedAmountCents ?? link.amountCents
  );
  const selectableLimit = selectedOption.credits;
  const paymentOnly = isPaymentOnly(link);
  const privateSelectionMode = link.linkMode === "payment_plus_choose_private_sessions";
  const selectedPlanLabel = selectedOption.label;
  const selectedAmountCents = selectedOption.amountCents;
  const proposedSet = useMemo(() => new Set(link.proposedSessionIds), [link.proposedSessionIds]);
  const allowedPrivateSet = useMemo(() => new Set(link.allowedPrivateSessionIds), [link.allowedPrivateSessionIds]);
  const availableSessions = useMemo(() => {
    const groupSessions = sessions.filter((session) => session.trainingGroupId === link.trainingGroup);

    if (link.linkMode === "payment_plus_confirm_proposed_schedule") {
      return groupSessions.filter((session) => proposedSet.has(session.id));
    }

    if (paymentOnly || privateSelectionMode) {
      return [];
    }

    return groupSessions;
  }, [link.linkMode, link.trainingGroup, paymentOnly, privateSelectionMode, proposedSet, sessions]);
  const availablePrivateSessions = useMemo(() => {
    if (!privateSelectionMode) {
      return [];
    }

    if (allowedPrivateSet.size < 1) {
      return [];
    }

    return privateSessions.filter((session) => session.status === "available" && allowedPrivateSet.has(session.id));
  }, [allowedPrivateSet, privateSelectionMode, privateSessions]);
  const availablePrivateSessionsByDay = useMemo(() => {
    const groups = new Map<string, PrivateSessionAvailabilityRow[]>();

    for (const session of availablePrivateSessions) {
      const label = formatPrivateDay(session.start_datetime, session.timezone);
      groups.set(label, [...(groups.get(label) ?? []), session]);
    }

    return Array.from(groups.entries()).map(([label, daySessions]) => ({
      label,
      sessions: daySessions
    }));
  }, [availablePrivateSessions]);
  const initialSelected =
    link.linkMode === "payment_plus_confirm_proposed_schedule"
      ? availableSessions.slice(0, selectableLimit || availableSessions.length).map((session) => session.id)
      : [];
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>(initialSelected);
  const [selectedPrivateSessionIds, setSelectedPrivateSessionIds] = useState<string[]>([]);
  const [playerName, setPlayerName] = useState(initialParentValue(link.playerName));
  const [playerAge, setPlayerAge] = useState(initialParentValue(link.playerAge));
  const [parentName, setParentName] = useState(initialParentValue(link.parentName));
  const [parentEmail, setParentEmail] = useState(initialParentValue(link.parentEmail));
  const [parentPhone, setParentPhone] = useState(initialParentValue(link.parentPhone));
  const [paymentMethod, setPaymentMethod] = useState<"card" | "zelle">("card");
  const [zelleResult, setZelleResult] = useState<{
    amountDue?: number;
    zellePhone?: string;
    memo?: string;
    privateSessionsBooked?: number;
  } | null>(null);
  const [notes, setNotes] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [medicalNotes, setMedicalNotes] = useState("");
  const [mediaConsent, setMediaConsent] = useState<"Granted" | "Declined" | "">("");
  const [guardianSignature, setGuardianSignature] = useState("");
  const [waiverAccepted, setWaiverAccepted] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const selectedCount = selectedSessionIds.length + selectedPrivateSessionIds.length;
  const selectedSessionSummaries = useMemo(
    () =>
      selectedSessionIds
        .map((sessionId) => availableSessions.find((session) => session.id === sessionId))
        .filter((session): session is PublicAvailableSession => Boolean(session))
        .map((session) => `${session.dayLabel}, ${session.dateLabel} · ${session.startTime}`),
    [availableSessions, selectedSessionIds]
  );
  const selectedPrivateSessionSummaries = useMemo(
    () =>
      selectedPrivateSessionIds
        .map((sessionId) => availablePrivateSessions.find((session) => session.id === sessionId))
        .filter((session): session is PrivateSessionAvailabilityRow => Boolean(session))
        .map(
          (session) =>
            `${formatPrivateDay(session.start_datetime, session.timezone)} · ${formatPrivateTime(session.start_datetime, session.timezone)}`
        ),
    [availablePrivateSessions, selectedPrivateSessionIds]
  );
  const needsWaiver = true;
  const planLabel = selectedPlanLabel;
  const isClosed = ["paid", "partially_scheduled", "fully_scheduled", "cancelled"].includes(link.status);

  function choosePlan(planType: CustomPaymentLinkPlanType) {
    setSelectedPlanType(planType);
    setSelectedSessionIds([]);
    setSelectedPrivateSessionIds([]);
    setError("");
    setZelleResult(null);
  }

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

  function togglePrivateSession(sessionId: string) {
    setError("");
    setSelectedPrivateSessionIds((current) => {
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

    if (!paymentOnly && selectedCount < 1) {
      setError(privateSelectionMode ? "Choose at least one private session time before continuing to payment." : "Choose at least one session before continuing to payment.");
      return;
    }

    if (!playerName.trim() || !playerAge.trim() || !parentName.trim() || !parentEmail.trim() || !parentPhone.trim()) {
      setError("Complete the player and parent information before continuing.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail.trim())) {
      setError("Enter a valid parent email before continuing.");
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
          selectedPrivateSessionIds,
          selectedPlanType,
          playerName,
          playerAge,
          parentName,
          parentEmail,
          parentPhone,
          paymentMethod,
          notes,
          emergencyName,
          emergencyPhone,
          medicalNotes,
          mediaConsent,
          guardianSignature,
          waiverAccepted
        })
      });
      const result = (await response.json().catch(() => ({}))) as {
        checkoutUrl?: string;
        error?: string;
        status?: string;
        amountDue?: number;
        zellePhone?: string;
        memo?: string;
        privateSessionsBooked?: number;
      };

      if (response.ok && result.status === "zelle_pending") {
        setZelleResult({
          amountDue: result.amountDue,
          zellePhone: result.zellePhone,
          memo: result.memo,
          privateSessionsBooked: result.privateSessionsBooked
        });
        setIsSubmitting(false);
        return;
      }

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
          Complete the player details, choose the allowed session time if needed, sign the waiver, and choose card or Zelle.
        </p>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <aside className="rounded-[10px] border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase text-electric">Payment Details</p>
          <h2 className="mt-2 text-2xl font-black text-slate-950">{planLabel}</h2>
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
              <dt className="font-bold text-slate-500">Amount due</dt>
              <dd className="text-right text-xl font-black text-slate-950">{formatCurrencyFromCents(selectedAmountCents)}</dd>
            </div>
            {selectedOption.credits > 0 ? (
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
                <dt className="font-bold text-slate-500">Training credits</dt>
                <dd className="text-right font-black text-slate-950">{selectedOption.credits}</dd>
              </div>
            ) : null}
            {selectedCount > 0 ? (
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
                <dt className="font-bold text-slate-500">Selected sessions</dt>
                <dd className="text-right font-black text-slate-950">{selectedCount}</dd>
              </div>
            ) : null}
            {selectedSessionSummaries.length > 0 || selectedPrivateSessionSummaries.length > 0 ? (
              <div className="border-b border-slate-100 pb-3">
                <dt className="font-bold text-slate-500">Selected time(s)</dt>
                <dd className="mt-2 grid gap-1 text-sm font-bold text-slate-950">
                  {[...selectedSessionSummaries, ...selectedPrivateSessionSummaries].map((summary) => (
                    <span key={summary}>{summary}</span>
                  ))}
                </dd>
              </div>
            ) : null}
            {playerName.trim() ? (
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
                <dt className="font-bold text-slate-500">Player</dt>
                <dd className="text-right font-black text-slate-950">{playerName.trim()}</dd>
              </div>
            ) : null}
            {parentName.trim() ? (
              <div className="flex justify-between gap-4 border-b border-slate-100 pb-3">
                <dt className="font-bold text-slate-500">Parent</dt>
                <dd className="text-right font-black text-slate-950">{parentName.trim()}</dd>
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

          {zelleResult ? (
            <div className="rounded-[8px] border border-emerald-200 bg-emerald-50 p-5 text-sm leading-6 text-emerald-950">
              <p className="text-lg font-black text-emerald-950">Waiver submitted. Zelle payment pending.</p>
              <p className="mt-2">
                Your private session time has been saved. Zelle payment must be confirmed manually by EST CV.
              </p>
              <div className="mt-4 rounded-[8px] border border-emerald-200 bg-white p-4">
                <p className="font-black">Send Zelle payment to: {zelleResult.zellePhone || "3236848024"}</p>
                <p className="mt-1">Memo: {zelleResult.memo || `${playerName} - ${planLabel}`}</p>
                <p className="mt-1">Amount due: {formatCurrencyFromCents(zelleResult.amountDue ?? selectedAmountCents)}</p>
              </div>
            </div>
          ) : null}

          {!zelleResult ? (
            <section className={allowedPurchaseOptions.length > 1 ? "" : ""}>
              <p className="text-xs font-black uppercase text-electric">Choose Your Training Option</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">Select Your Plan</h2>
              <div className="mt-5 grid gap-3">
                {allowedPurchaseOptions.map((optionType) => {
                  const option = customPaymentLinkOptionMeta(optionType, link.privateSessionAmountCents, link.amountCents);
                  const selected = selectedPlanType === optionType;
                  const creditText = option.credits === 1 ? "1 training credit" : `${option.credits} training credits`;

                  return (
                    <button
                      key={optionType}
                      type="button"
                      onClick={() => choosePlan(optionType)}
                      className={`rounded-[8px] border p-4 text-left transition ${
                        selected ? "border-electric bg-blue-50 ring-2 ring-electric/20" : "border-slate-200 bg-white hover:border-electric"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-black text-slate-950">{option.label}</p>
                          <p className="mt-1 text-sm font-semibold text-slate-600">
                            {optionType === "custom_amount" ? "Custom private payment amount." : creditText}
                          </p>
                        </div>
                        <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black uppercase text-white">
                          {formatCurrencyFromCents(option.amountCents)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {!zelleResult ? (
            <section className="mt-8 border-t border-slate-200 pt-6">
              <p className="text-xs font-black uppercase text-electric">Player & Parent Information</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">Complete Your Details</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Enter the player and parent information for this private payment link.
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-black text-slate-950">
                  Player name *
                  <input className="mt-2 w-full rounded-[8px] border border-slate-300 px-3 py-3 font-bold text-slate-950" value={playerName} onChange={(event) => setPlayerName(event.target.value)} />
                </label>
                <label className="text-sm font-black text-slate-950">
                  Player age *
                  <input className="mt-2 w-full rounded-[8px] border border-slate-300 px-3 py-3 font-bold text-slate-950" value={playerAge} onChange={(event) => setPlayerAge(event.target.value)} />
                </label>
                <label className="text-sm font-black text-slate-950">
                  Parent/guardian name *
                  <input className="mt-2 w-full rounded-[8px] border border-slate-300 px-3 py-3 font-bold text-slate-950" value={parentName} onChange={(event) => setParentName(event.target.value)} />
                </label>
                <label className="text-sm font-black text-slate-950">
                  Parent phone *
                  <input className="mt-2 w-full rounded-[8px] border border-slate-300 px-3 py-3 font-bold text-slate-950" value={parentPhone} onChange={(event) => setParentPhone(event.target.value)} />
                </label>
                <label className="text-sm font-black text-slate-950 sm:col-span-2">
                  Parent email *
                  <input className="mt-2 w-full rounded-[8px] border border-slate-300 px-3 py-3 font-bold text-slate-950" type="email" value={parentEmail} onChange={(event) => setParentEmail(event.target.value)} />
                </label>
              </div>
            </section>
          ) : null}

          {!zelleResult ? (!paymentOnly ? (
            <section className={privateSelectionMode ? "mt-8 border-t border-slate-200 pt-6" : ""}>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase text-electric">Choose Sessions</p>
                  <h2 className="mt-1 text-2xl font-black text-slate-950">
                    {link.linkMode === "payment_plus_confirm_proposed_schedule"
                      ? "Confirm Proposed Schedule"
                      : privateSelectionMode
                        ? "Select Private Session Times"
                        : "Select Training Sessions"}
                  </h2>
                </div>
                <p className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase text-slate-700">
                  {selectedCount}/{selectableLimit} selected
                </p>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {privateSelectionMode
                  ? "Choose from the private session openings Coach Hugo made available for this link."
                  : "Parents can only book the number of sessions included with this private link."}
              </p>

              <div className="mt-5 grid gap-3">
                {privateSelectionMode ? (
                  availablePrivateSessionsByDay.length > 0 ? (
                    availablePrivateSessionsByDay.map((group) => (
                      <div key={group.label} className="rounded-[8px] border border-slate-200 bg-slate-50 p-3">
                        <p className="px-1 text-xs font-black uppercase tracking-wide text-slate-500">{group.label}</p>
                        <div className="mt-3 grid gap-3">
                          {group.sessions.map((session) => {
                            const selected = selectedPrivateSessionIds.includes(session.id);

                            return (
                              <button
                                key={session.id}
                                type="button"
                                onClick={() => togglePrivateSession(session.id)}
                                className={`rounded-[8px] border p-4 text-left transition ${
                                  selected ? "border-electric bg-blue-50 ring-2 ring-electric/20" : "border-slate-200 bg-white hover:border-electric"
                                }`}
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <p className="font-black text-electric">
                                      {formatPrivateTime(session.start_datetime, session.timezone)} - {formatPrivateTime(session.end_datetime, session.timezone)}
                                    </p>
                                    <p className="mt-2 text-sm font-bold text-slate-700">
                                      {session.session_focus || "Private Session"}
                                    </p>
                                    <p className="mt-1 text-sm text-slate-600">{session.location}</p>
                                    {session.notes ? <p className="mt-2 text-sm text-slate-500">{session.notes}</p> : null}
                                  </div>
                                  <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black uppercase text-white">
                                    {selected ? "Selected" : "Private"}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[8px] border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-700">
                      No private session times are currently available for this link. Please contact Coach Hugo.
                    </div>
                  )
                ) : availableSessions.length > 0 ? (
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
          )) : null}

          {!zelleResult && needsWaiver ? (
            <section className="mt-8 border-t border-slate-200 pt-6">
              <p className="text-xs font-black uppercase text-electric">Waiver & Contact</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">Parent Waiver</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                By signing below, I confirm this waiver applies to all EST CV sessions, training activities, and dates connected to this registration/payment.
              </p>
              <div className="mt-5 rounded-[8px] border border-slate-200 bg-slate-50 p-4">
                <div className="grid gap-4 text-sm leading-6 text-slate-700">
                  {waiverSections.map((section) => (
                    <div key={section.title} className="border-b border-slate-200 pb-4 last:border-0 last:pb-0">
                      <h3 className="font-black text-slate-950">{section.title}</h3>
                      <p className="mt-1">{section.copy}</p>
                    </div>
                  ))}
                </div>
              </div>
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

          {!zelleResult ? (
            <section className="mt-8 border-t border-slate-200 pt-6">
              <p className="text-xs font-black uppercase text-electric">Payment Method</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">Choose Payment Method</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  { value: "card", title: "Pay by Card", text: "Continue to secure card payment." },
                  { value: "zelle", title: "Pay by Zelle", text: "Submit waiver and view Zelle instructions." }
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPaymentMethod(option.value as "card" | "zelle")}
                    className={`rounded-[8px] border p-4 text-left transition ${
                      paymentMethod === option.value
                        ? "border-electric bg-blue-50 ring-2 ring-electric/20"
                        : "border-slate-200 bg-white hover:border-electric"
                    }`}
                  >
                    <p className="font-black text-slate-950">{option.title}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-600">{option.text}</p>
                  </button>
                ))}
              </div>
              {paymentMethod === "zelle" ? (
                <div className="mt-4 rounded-[8px] border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-slate-700">
                  <p className="font-black text-slate-950">Zelle instructions</p>
                  <p className="mt-1">Send payment through Zelle to: 3236848024</p>
                  <p>Memo: {playerName || "Player Name"} - {planLabel}</p>
                  <p className="font-black text-slate-950">Amount due: {formatCurrencyFromCents(selectedAmountCents)}</p>
                  <p className="mt-1 text-xs font-bold uppercase text-slate-500">Zelle payments must be confirmed manually.</p>
                </div>
              ) : null}
            </section>
          ) : null}

          {error ? (
            <div className="mt-6 rounded-[8px] border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
              {error}
            </div>
          ) : null}

          {!zelleResult ? (
            <button
              type="button"
              disabled={isSubmitting || isClosed}
              onClick={submit}
              className="mt-6 w-full rounded-[8px] bg-electric px-5 py-4 text-base font-black uppercase text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isSubmitting
                ? paymentMethod === "zelle"
                  ? "Saving waiver..."
                  : "Opening secure payment..."
                : paymentMethod === "zelle"
                  ? "Submit Waiver + View Zelle Instructions"
                  : "Continue to Secure Card Payment"}
            </button>
          ) : null}
        </main>
      </div>
    </div>
  );
}

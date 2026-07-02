"use client";

import { useState } from "react";
import { directPaymentOptions, type DirectPaymentOption } from "@/lib/pricing";
import { business } from "@/lib/site-data";
import { waiverSections, waiverVersion } from "@/lib/waiver-content";

const inputClass =
  "field-focus w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400";

type PaymentMethod = "card" | "zelle";

type DirectPayFields = {
  playerCount: 1 | 2;
  sessionCount: 1 | 2 | 3 | 4 | 5 | 6;
  playerFirstName: string;
  playerLastName: string;
  playerAge: string;
  secondPlayerFirstName: string;
  secondPlayerLastName: string;
  secondPlayerAge: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  paymentOption: DirectPaymentOption;
  paymentMethod: PaymentMethod;
  emergencyName: string;
  emergencyPhone: string;
  medicalNotes: string;
  mediaConsent: "" | "yes" | "no";
  waiverAgreement: boolean;
  guardianSignature: string;
  marketingOptIn: boolean;
};

type DirectPayErrorKey =
  | "playerFirstName"
  | "playerLastName"
  | "playerAge"
  | "secondPlayerFirstName"
  | "secondPlayerLastName"
  | "secondPlayerAge"
  | "parentName"
  | "parentEmail"
  | "parentPhone"
  | "emergencyName"
  | "emergencyPhone"
  | "medicalNotes"
  | "mediaConsent"
  | "waiverAgreement"
  | "guardianSignature";

type DirectPayFieldErrors = Partial<Record<DirectPayErrorKey, string>>;

const initialFields: DirectPayFields = {
  playerCount: 1,
  sessionCount: 1,
  playerFirstName: "",
  playerLastName: "",
  playerAge: "",
  secondPlayerFirstName: "",
  secondPlayerLastName: "",
  secondPlayerAge: "",
  parentName: "",
  parentEmail: "",
  parentPhone: "",
  paymentOption: "single_session",
  paymentMethod: "card",
  emergencyName: "",
  emergencyPhone: "",
  medicalNotes: "",
  mediaConsent: "",
  waiverAgreement: false,
  guardianSignature: "",
  marketingOptIn: false
};

const paymentCards: Array<{
  option: DirectPaymentOption;
  title: string;
  price: string;
  description: string;
}> = [
  {
    option: "single_session",
    title: "Single Session",
    price: "$55/player",
    description: "Pay for one or more single sessions."
  },
  {
    option: "four_session_launch_pass",
    title: "4-Session Training Package",
    price: "$200/player",
    description: "Includes 4 total training credits. Good for players training consistently."
  },
  {
    option: "six_session_launch_pass",
    title: "6-Session Training Package",
    price: "$285/player",
    description: "Includes 6 total training credits. Best value for players training multiple times per week."
  }
];

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function formatCurrency(amountCents: number) {
  return `$${(amountCents / 100).toFixed(0)}`;
}

function scrollToFirstError(errors: DirectPayFieldErrors) {
  const firstErrorKey = Object.keys(errors)[0];

  if (!firstErrorKey) {
    return;
  }

  window.requestAnimationFrame(() => {
    const target = document.querySelector(`[data-error-key="${firstErrorKey}"]`);

    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: "smooth", block: "center" });
    const focusable = target.querySelector("input, textarea, button") as HTMLElement | null;
    focusable?.focus({ preventScroll: true });
  });
}

export function DirectPayForm() {
  const [fields, setFields] = useState<DirectPayFields>(initialFields);
  const [fieldErrors, setFieldErrors] = useState<DirectPayFieldErrors>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [zelleMemo, setZelleMemo] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const selectedOption = directPaymentOptions[fields.paymentOption];
  const isSingleSession = fields.paymentOption === "single_session";
  const totalAmountCents = selectedOption.amountCents * fields.playerCount * (isSingleSession ? fields.sessionCount : 1);
  const primaryPlayerName = fields.playerFirstName.trim() || "Maddie";
  const secondPlayerName = fields.secondPlayerFirstName.trim() || "Logan";
  const playerMemoNames = fields.playerCount === 2 ? `${primaryPlayerName} + ${secondPlayerName}` : primaryPlayerName;
  const zelleMemoPreview = isSingleSession
    ? `${playerMemoNames} - Single Session - ${fields.sessionCount} ${fields.sessionCount === 1 ? "Session" : "Sessions"}`
    : `${playerMemoNames} - ${selectedOption.title}`;

  function setField<Key extends keyof DirectPayFields>(field: Key, value: DirectPayFields[Key]) {
    setFields((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[field as DirectPayErrorKey];

      if (field === "playerCount") {
        delete next.secondPlayerFirstName;
        delete next.secondPlayerLastName;
        delete next.secondPlayerAge;
      }

      return next;
    });
    setError("");
    setNotice("");
  }

  function fieldClass(field: DirectPayErrorKey) {
    return `${inputClass} ${fieldErrors[field] ? "border-red-500 bg-red-50" : ""}`;
  }

  function fieldError(field: DirectPayErrorKey) {
    return fieldErrors[field] ? <p className="text-xs font-bold text-red-600">{fieldErrors[field]}</p> : null;
  }

  function hasFieldError(field: DirectPayErrorKey) {
    return Boolean(fieldErrors[field]);
  }

  function validate() {
    const nextErrors: DirectPayFieldErrors = {};

    if (!fields.playerFirstName.trim()) {
      nextErrors.playerFirstName = fields.playerCount === 2 ? "Player 1 first name is required." : "Player first name is required.";
    }

    if (!fields.playerLastName.trim()) {
      nextErrors.playerLastName = fields.playerCount === 2 ? "Player 1 last name is required." : "Player last name is required.";
    }

    if (!fields.playerAge.trim()) {
      nextErrors.playerAge = fields.playerCount === 2 ? "Player 1 age is required." : "Player age is required.";
    }

    if (fields.playerCount === 2) {
      if (!fields.secondPlayerFirstName.trim()) {
        nextErrors.secondPlayerFirstName = "Player 2 first name is required.";
      }

      if (!fields.secondPlayerLastName.trim()) {
        nextErrors.secondPlayerLastName = "Player 2 last name is required.";
      }

      if (!fields.secondPlayerAge.trim()) {
        nextErrors.secondPlayerAge = "Player 2 age is required.";
      }
    }

    if (!fields.parentName.trim()) {
      nextErrors.parentName = "Parent/guardian name is required.";
    }

    if (!fields.parentEmail.trim()) {
      nextErrors.parentEmail = "Parent email is required.";
    } else if (!isValidEmail(fields.parentEmail)) {
      nextErrors.parentEmail = "Enter a valid parent email.";
    }

    if (!fields.parentPhone.trim()) {
      nextErrors.parentPhone = "Parent phone is required.";
    }

    if (!fields.emergencyName.trim()) {
      nextErrors.emergencyName = "Emergency contact name is required.";
    }

    if (!fields.emergencyPhone.trim()) {
      nextErrors.emergencyPhone = "Emergency contact phone is required.";
    }

    if (!fields.medicalNotes.trim()) {
      nextErrors.medicalNotes = "Please enter any medical conditions/allergies or type None.";
    }

    if (!fields.mediaConsent) {
      nextErrors.mediaConsent = "Please select media consent.";
    }

    if (!fields.waiverAgreement) {
      nextErrors.waiverAgreement = "Please agree to the waiver.";
    }

    if (!fields.guardianSignature.trim()) {
      nextErrors.guardianSignature = "Parent/guardian signature is required.";
    }

    setFieldErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      setError("Please complete the highlighted required fields before continuing.");
      scrollToFirstError(nextErrors);
      return false;
    }

    return true;
  }

  async function submitDirectPayment() {
    if (!validate()) {
      return;
    }

    setIsSubmitting(true);
    setError("");
    setNotice("");
    setZelleMemo("");

    try {
      const response = await fetch("/api/direct-payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(fields)
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        checkoutUrl?: string;
        zellePhone?: string;
        memo?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(result.error || "Payment could not be started.");
      }

      if (fields.paymentMethod === "card") {
        if (!result.checkoutUrl) {
          throw new Error("Secure card checkout could not be opened.");
        }

        window.location.href = result.checkoutUrl;
        return;
      }

      setNotice("Your waiver was saved. Zelle payment is pending manual confirmation.");
      setZelleMemo(result.memo || zelleMemoPreview);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Payment could not be started.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="panel border-l-4 border-l-electric p-5 sm:p-6">
        <h2 className="text-xl font-black text-navy">How This Works</h2>
        <ol className="mt-4 grid gap-2 text-sm font-semibold leading-6 text-slate-700 sm:grid-cols-2">
          <li>1. Choose your payment option.</li>
          <li>2. Complete the player and parent information.</li>
          <li>3. Review and sign the waiver.</li>
          <li>4. Click the button at the bottom to continue with card payment or view Zelle instructions.</li>
        </ol>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr]">
      <aside className="panel h-fit p-5 sm:p-6">
        <h2 className="text-xl font-black text-navy">Choose Payment Option</h2>
        <div className="mt-5">
          <p className="text-sm font-black uppercase text-navy">Number of Players</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {[
              [1, "1 Player"],
              [2, "2 Players"]
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setField("playerCount", value as 1 | 2)}
                className={`rounded-lg border p-4 text-center text-sm font-black transition ${
                  fields.playerCount === value
                    ? "border-electric bg-blue-50 text-navy shadow-lg shadow-electric/10"
                    : "border-slate-200 bg-white text-navy hover:border-electric/60"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-5 grid gap-3">
          {paymentCards.map((card) => {
            const isSelected = fields.paymentOption === card.option;

            return (
              <button
                key={card.option}
                type="button"
                onClick={() => setField("paymentOption", card.option)}
                className={`rounded-lg border p-4 text-left transition ${
                  isSelected
                    ? "border-electric bg-blue-50 shadow-lg shadow-electric/10"
                    : "border-slate-200 bg-white hover:border-electric/60"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-black text-navy">{card.title} — {card.price}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{card.description}</p>
                  </div>
                  <span
                    className={`mt-1 h-4 w-4 shrink-0 rounded-full border ${
                      isSelected ? "border-electric bg-electric ring-4 ring-electric/15" : "border-slate-300 bg-white"
                    }`}
                    aria-hidden="true"
                  />
                </div>
              </button>
            );
          })}
        </div>

        {isSingleSession ? (
          <label className="mt-5 grid gap-2 text-sm font-bold text-navy">
            Number of Sessions
            <span className="text-sm font-semibold leading-6 text-slate-600">
              Choose how many single sessions you are paying for.
            </span>
            <select
              className={inputClass}
              value={fields.sessionCount}
              onChange={(event) => setField("sessionCount", Number(event.target.value) as 1 | 2 | 3 | 4 | 5 | 6)}
            >
              {[1, 2, 3, 4, 5, 6].map((value) => (
                <option key={value} value={value}>
                  {value} {value === 1 ? "Session" : "Sessions"}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="mt-5 rounded-md border border-slate-200 bg-mist px-4 py-3 text-sm font-semibold leading-6 text-slate-600">
            Training Packages already include multiple training credits.
          </p>
        )}

        <div className="mt-6">
          <p className="text-sm font-black uppercase text-navy">Payment Method</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {[
              ["card", "Pay by Card"],
              ["zelle", "Pay by Zelle"]
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setField("paymentMethod", value as PaymentMethod)}
                className={`rounded-lg border p-4 text-left text-sm font-black transition ${
                  fields.paymentMethod === value
                    ? "border-navy bg-navy text-white shadow-lg shadow-navy/15"
                    : "border-slate-200 bg-white text-navy hover:border-electric"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
            Card payments are processed securely through Stripe. Zelle payments must be confirmed manually.
          </p>
        </div>

        {fields.paymentMethod === "zelle" ? (
          <div className="mt-5 rounded-lg border border-electric/20 bg-blue-50 p-4 text-sm leading-6 text-slate-700">
            <p className="font-black text-navy">Zelle Instructions</p>
            <p className="mt-2">
              Send payment through Zelle to: <span className="font-black text-navy">3236848024</span>
            </p>
            <p className="font-bold text-navy">Total amount owed: {formatCurrency(totalAmountCents)}</p>
            {isSingleSession ? (
              <>
                <p>Memo: Player Name(s) + Single Session + Number of Sessions</p>
                <p>
                  Example: {fields.playerCount === 2 ? "Maddie + Logan" : "Maddie"} - Single Session -{" "}
                  {fields.sessionCount} {fields.sessionCount === 1 ? "Session" : "Sessions"}
                </p>
              </>
            ) : (
              <>
                <p>Memo: Player Name(s) + Payment Option</p>
                <p>Example: {fields.playerCount === 2 ? "Maddie + Logan" : "Maddie"} - {selectedOption.title}</p>
              </>
            )}
            {zelleMemo ? <p className="mt-2 font-black text-navy">Saved memo: {zelleMemo}</p> : null}
          </div>
        ) : null}
      </aside>

      <div className="panel overflow-hidden">
        {error ? <div className="border-b border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-700">{error}</div> : null}
        {notice ? <div className="border-b border-field/20 bg-field/10 px-5 py-4 text-sm font-bold text-field">{notice}</div> : null}

        <div className="grid gap-5 p-5 sm:p-6">
          <p className="rounded-md border border-slate-200 bg-mist p-3 text-sm font-bold text-slate-600">
            Fields marked with * are required.
          </p>

          <section className="grid gap-4 border-b border-slate-200 pb-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <h3 className="text-xl font-black text-navy">Player & Parent Information</h3>
            </div>
            {fields.playerCount === 2 ? (
              <p className="text-xs font-black uppercase text-electric sm:col-span-2">Player 1</p>
            ) : null}
            <label className="grid gap-2 text-sm font-bold text-navy" data-error-key="playerFirstName">
              {fields.playerCount === 2 ? "First Name *" : "Player First Name *"}
              <input className={fieldClass("playerFirstName")} value={fields.playerFirstName} onChange={(event) => setField("playerFirstName", event.target.value)} />
              {fieldError("playerFirstName")}
            </label>
            <label className="grid gap-2 text-sm font-bold text-navy" data-error-key="playerLastName">
              {fields.playerCount === 2 ? "Last Name *" : "Player Last Name *"}
              <input className={fieldClass("playerLastName")} value={fields.playerLastName} onChange={(event) => setField("playerLastName", event.target.value)} />
              {fieldError("playerLastName")}
            </label>
            <label className="grid gap-2 text-sm font-bold text-navy" data-error-key="playerAge">
              {fields.playerCount === 2 ? "Age *" : "Player Age *"}
              <input className={fieldClass("playerAge")} inputMode="numeric" value={fields.playerAge} onChange={(event) => setField("playerAge", event.target.value)} />
              {fieldError("playerAge")}
            </label>
            {fields.playerCount === 2 ? (
              <>
                <p className="text-xs font-black uppercase text-electric sm:col-span-2">Player 2</p>
                <label className="grid gap-2 text-sm font-bold text-navy" data-error-key="secondPlayerFirstName">
                  First Name *
                  <input
                    className={fieldClass("secondPlayerFirstName")}
                    value={fields.secondPlayerFirstName}
                    onChange={(event) => setField("secondPlayerFirstName", event.target.value)}
                  />
                  {fieldError("secondPlayerFirstName")}
                </label>
                <label className="grid gap-2 text-sm font-bold text-navy" data-error-key="secondPlayerLastName">
                  Last Name *
                  <input
                    className={fieldClass("secondPlayerLastName")}
                    value={fields.secondPlayerLastName}
                    onChange={(event) => setField("secondPlayerLastName", event.target.value)}
                  />
                  {fieldError("secondPlayerLastName")}
                </label>
                <label className="grid gap-2 text-sm font-bold text-navy" data-error-key="secondPlayerAge">
                  Age *
                  <input
                    className={fieldClass("secondPlayerAge")}
                    inputMode="numeric"
                    value={fields.secondPlayerAge}
                    onChange={(event) => setField("secondPlayerAge", event.target.value)}
                  />
                  {fieldError("secondPlayerAge")}
                </label>
              </>
            ) : null}
            <p className="text-xs font-black uppercase text-electric sm:col-span-2">Parent/Guardian</p>
            <label className="grid gap-2 text-sm font-bold text-navy" data-error-key="parentName">
              Parent/Guardian Name *
              <input className={fieldClass("parentName")} value={fields.parentName} onChange={(event) => setField("parentName", event.target.value)} />
              {fieldError("parentName")}
            </label>
            <label className="grid gap-2 text-sm font-bold text-navy" data-error-key="parentEmail">
              Parent Email *
              <input className={fieldClass("parentEmail")} type="email" value={fields.parentEmail} onChange={(event) => setField("parentEmail", event.target.value)} />
              {fieldError("parentEmail")}
            </label>
            <label className="grid gap-2 text-sm font-bold text-navy" data-error-key="parentPhone">
              Parent Phone *
              <input className={fieldClass("parentPhone")} type="tel" value={fields.parentPhone} onChange={(event) => setField("parentPhone", event.target.value)} />
              {fieldError("parentPhone")}
            </label>
            <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-mist p-4 text-sm font-semibold leading-6 text-slate-700 sm:col-span-2">
              <input
                className="mt-1 h-4 w-4 rounded border-slate-300 text-electric"
                type="checkbox"
                checked={fields.marketingOptIn}
                onChange={(event) => setField("marketingOptIn", event.target.checked)}
              />
              <span>Yes, I&apos;d like to receive EST CV training schedules, updates, and special offers by email.</span>
            </label>
          </section>

          <section className="border-b border-slate-200 pb-5">
            <h3 className="text-xl font-black text-navy">Payment Details</h3>
            <div className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-mist p-4 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
              <p>
                <span className="block text-xs font-black uppercase text-slate-500">Selected Option</span>
                <span className="font-black text-navy">{selectedOption.title}</span>
              </p>
              <p>
                <span className="block text-xs font-black uppercase text-slate-500">Number of Players</span>
                <span className="font-black text-navy">{fields.playerCount}</span>
              </p>
              {isSingleSession ? (
                <p>
                  <span className="block text-xs font-black uppercase text-slate-500">Number of Sessions</span>
                  <span className="font-black text-navy">{fields.sessionCount}</span>
                </p>
              ) : null}
              <p>
                <span className="block text-xs font-black uppercase text-slate-500">Total Amount</span>
                <span className="font-black text-navy">{formatCurrency(totalAmountCents)}</span>
              </p>
              <p>
                <span className="block text-xs font-black uppercase text-slate-500">Payment Method</span>
                <span className="font-black text-navy">{fields.paymentMethod === "card" ? "Card" : "Zelle"}</span>
              </p>
            </div>
          </section>

          <section className="grid gap-4 border-b border-slate-200 pb-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <h3 className="text-xl font-black text-navy">Waiver Agreement</h3>
            </div>
            <label className="grid gap-2 text-sm font-bold text-navy" data-error-key="emergencyName">
              Emergency Contact Name *
              <input className={fieldClass("emergencyName")} value={fields.emergencyName} onChange={(event) => setField("emergencyName", event.target.value)} />
              {fieldError("emergencyName")}
            </label>
            <label className="grid gap-2 text-sm font-bold text-navy" data-error-key="emergencyPhone">
              Emergency Contact Phone *
              <input className={fieldClass("emergencyPhone")} type="tel" value={fields.emergencyPhone} onChange={(event) => setField("emergencyPhone", event.target.value)} />
              {fieldError("emergencyPhone")}
            </label>
            <label className="grid gap-2 text-sm font-bold text-navy sm:col-span-2" data-error-key="medicalNotes">
              Medical Conditions / Allergies / Notes *
              <span className="text-xs font-semibold normal-case text-slate-500">Type "None" if not applicable.</span>
              <textarea
                className={`${fieldClass("medicalNotes")} min-h-24 resize-y`}
                value={fields.medicalNotes}
                onChange={(event) => setField("medicalNotes", event.target.value)}
                placeholder="List medical conditions, allergies, injuries, or type None"
              />
              {fieldError("medicalNotes")}
            </label>

            <div className="border border-slate-300 bg-[#fffdf8] p-4 text-sm leading-6 text-slate-700 sm:col-span-2">
              <h4 className="font-black text-navy">Elite Soccer Training CV Participation Waiver & Release of Liability</h4>
              <div className="mt-4 max-h-80 overflow-y-auto border-y border-slate-200 py-3">
                {waiverSections.map((section) => (
                  <section key={section.title} className="py-3">
                    <h5 className="font-black uppercase tracking-wide text-navy">{section.title}</h5>
                    <p className="mt-1">{section.copy}</p>
                  </section>
                ))}
              </div>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <h3 className="text-xl font-black text-navy">Parent/Guardian Waiver & Signature</h3>
            </div>
            <p className="text-sm font-bold leading-6 text-slate-700 sm:col-span-2">
              By signing below, I confirm this waiver applies to all players listed on this form.
            </p>
            <div className="grid gap-3 sm:col-span-2" data-error-key="mediaConsent">
              <p className="text-sm font-bold text-navy">Media Consent *</p>
              <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["yes", "Yes, media use is approved"],
                ["no", "No, media consent is declined"]
              ].map(([value, label]) => (
                <label
                  key={value}
                  className={`flex items-center gap-3 rounded-md border bg-white p-3 text-sm font-semibold text-navy ${
                    hasFieldError("mediaConsent") ? "border-red-500 bg-red-50" : "border-slate-200"
                  }`}
                >
                  <input
                    className="h-4 w-4 border-slate-400 text-electric"
                    type="radio"
                    name="directPayMediaConsent"
                    checked={fields.mediaConsent === value}
                    onChange={() => setField("mediaConsent", value as "yes" | "no")}
                  />
                  {label}
                </label>
              ))}
              </div>
              {fieldError("mediaConsent")}
            </div>

            <label
              className={`flex items-start gap-3 rounded-md border bg-mist p-4 text-sm font-semibold leading-6 text-slate-700 sm:col-span-2 ${
                hasFieldError("waiverAgreement") ? "border-red-500 bg-red-50" : "border-slate-200"
              }`}
              data-error-key="waiverAgreement"
            >
              <input
                className="mt-1 h-4 w-4 rounded border-slate-300 text-electric"
                checked={fields.waiverAgreement}
                type="checkbox"
                onChange={(event) => setField("waiverAgreement", event.target.checked)}
              />
              <span>
                I have read and agree to the Elite Soccer Training CV waiver and electronic signature consent. *
                {fieldErrors.waiverAgreement ? (
                  <span className="mt-1 block text-xs font-bold text-red-600">{fieldErrors.waiverAgreement}</span>
                ) : null}
              </span>
            </label>

            <label className="grid gap-2 text-xs font-bold uppercase tracking-wide text-navy sm:col-span-2" data-error-key="guardianSignature">
              Parent/Guardian Digital Signature *
              <input
                className={`field-focus w-full border-0 border-b bg-transparent px-0 py-3 text-base font-semibold text-slate-900 placeholder:text-slate-400 ${
                  hasFieldError("guardianSignature") ? "border-red-500" : "border-slate-400"
                }`}
                value={fields.guardianSignature}
                onChange={(event) => setField("guardianSignature", event.target.value)}
                placeholder="Type parent/guardian full legal name"
              />
              {fieldError("guardianSignature")}
            </label>
            <p className="text-[11px] font-bold uppercase text-slate-500 sm:col-span-2">
              Waiver version {waiverVersion}. Timestamp is saved automatically.
            </p>
          </section>

          <div className="grid gap-3">
            <p className="text-sm font-bold leading-6 text-slate-600">
              Please complete all required information and sign the waiver before continuing to payment.
            </p>
            <button
              type="button"
              onClick={() => void submitDirectPayment()}
              disabled={isSubmitting}
              className="w-full rounded-md bg-electric px-6 py-5 text-center text-base font-black uppercase tracking-wide text-white shadow-lg shadow-electric/25 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting
                ? "Saving..."
                : fields.paymentMethod === "card"
                  ? "Continue to Secure Card Payment"
                  : "Submit Waiver + View Zelle Instructions"}
            </button>
          </div>

          <p className="text-sm leading-6 text-slate-600">
            Questions? Email <a className="font-black text-navy underline" href={`mailto:${business.email}`}>{business.email}</a> or call{" "}
            <a className="font-black text-navy underline" href={business.phoneHref}>{business.phone}</a>.
          </p>
        </div>
      </div>
      </div>
    </div>
  );
}

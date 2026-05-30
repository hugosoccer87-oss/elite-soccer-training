"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { MailIcon } from "./Icons";

const inputClass =
  "field-focus w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400";

const requestTypes = [
  "Player under age 9",
  "Adult player",
  "Sibling group",
  "Team session",
  "Custom training request",
  "Other"
];

export function SpecialRequestForm() {
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus("");

    const formData = new FormData(event.currentTarget);
    const payload = {
      parentName: String(formData.get("parentName") ?? ""),
      playerName: String(formData.get("playerName") ?? ""),
      playerAge: String(formData.get("playerAge") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      email: String(formData.get("email") ?? ""),
      requestType: String(formData.get("requestType") ?? ""),
      notes: String(formData.get("notes") ?? "")
    };

    try {
      const response = await fetch("/api/special-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        setStatus(result.error ?? "Special request could not be sent. Please try again.");
        return;
      }

      event.currentTarget.reset();
      setStatus("Special request sent. Coach Hugo will follow up with next steps.");
    } catch {
      setStatus("Special request could not be sent. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form id="special-request-form" className="panel grid gap-5 p-5 sm:p-8" onSubmit={submitRequest}>
      <div>
        <p className="text-sm font-black uppercase text-electric">Special Training Request</p>
        <h3 className="mt-2 text-2xl font-black text-navy">Need a different arrangement?</h3>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Use this for players under age 9, adult players, sibling groups, team sessions, or custom training requests.
          No payment is collected for special requests.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-bold text-navy">
          Parent/Guardian Name
          <input className={inputClass} name="parentName" autoComplete="name" required />
        </label>
        <label className="grid gap-2 text-sm font-bold text-navy">
          Player Name
          <input className={inputClass} name="playerName" required />
        </label>
        <label className="grid gap-2 text-sm font-bold text-navy">
          Player Age
          <input className={inputClass} name="playerAge" inputMode="numeric" required />
        </label>
        <label className="grid gap-2 text-sm font-bold text-navy">
          Phone Number
          <input className={inputClass} name="phone" type="tel" autoComplete="tel" required />
        </label>
        <label className="grid gap-2 text-sm font-bold text-navy">
          Email
          <input className={inputClass} name="email" type="email" autoComplete="email" required />
        </label>
        <label className="grid gap-2 text-sm font-bold text-navy">
          Type of Request
          <select className={inputClass} name="requestType" required>
            {requestTypes.map((requestType) => (
              <option key={requestType} value={requestType}>
                {requestType}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="grid gap-2 text-sm font-bold text-navy">
        Notes/Details
        <textarea
          className={`${inputClass} min-h-28 resize-y`}
          name="notes"
          placeholder="Share goals, preferred schedule, group size, or anything Coach Hugo should know"
        />
      </label>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-electric px-6 py-3 text-sm font-black uppercase text-white shadow-lg shadow-electric/25 transition hover:bg-blue-500 disabled:cursor-wait disabled:opacity-70"
        >
          <MailIcon className="h-5 w-5" />
          {isSubmitting ? "Sending..." : "Submit Special Request"}
        </button>
        {status ? <p className="text-sm font-semibold text-field">{status}</p> : null}
      </div>
    </form>
  );
}

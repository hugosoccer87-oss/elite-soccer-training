"use client";

import { useState, type FormEvent } from "react";
import { MailIcon } from "./Icons";

const inputClass =
  "field-focus w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400";

const focusOptions = [
  "Shooting / Finishing",
  "Confidence",
  "First Touch & Passing",
  "Speed of Play",
  "Wingers / Wing Backs",
  "Defending",
  "Speed & Agility",
  "General Technical Work"
];

type PrivateSessionRequestFormProps = {
  embedded?: boolean;
};

export function PrivateSessionRequestForm({ embedded = false }: PrivateSessionRequestFormProps) {
  const [selectedFocus, setSelectedFocus] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function toggleFocus(focus: string) {
    setSelectedFocus((current) =>
      current.includes(focus) ? current.filter((item) => item !== focus) : [...current, focus]
    );
  }

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus("");

    const formData = new FormData(event.currentTarget);
    const payload = {
      playerName: String(formData.get("playerName") ?? ""),
      playerAge: String(formData.get("playerAge") ?? ""),
      parentName: String(formData.get("parentName") ?? ""),
      parentEmail: String(formData.get("parentEmail") ?? ""),
      parentPhone: String(formData.get("parentPhone") ?? ""),
      preferredTimes: String(formData.get("preferredTimes") ?? ""),
      focusAreas: selectedFocus,
      notes: String(formData.get("notes") ?? "")
    };

    try {
      const response = await fetch("/api/private-session-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string; message?: string };

      if (!response.ok) {
        setStatus(result.error ?? "Private session request could not be sent. Please try again.");
        return;
      }

      event.currentTarget.reset();
      setSelectedFocus([]);
      setStatus(result.message ?? "Thank you. We received your private session request and will contact you to confirm availability.");
    } catch {
      setStatus("Private session request could not be sent. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      id="private-session-request"
      className={`${embedded ? "grid gap-5" : "panel grid gap-5 p-5 sm:p-8"}`}
      onSubmit={submitRequest}
    >
      <div>
        <p className="text-sm font-black uppercase text-electric">Private 1-on-1 Session Request</p>
        <h3 className="mt-2 text-2xl font-black text-navy">Request private training</h3>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Submit the player details, preferred times, and training goals. Coach Hugo will review availability and
          follow up before anything is scheduled.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-bold text-navy">
          Player Name
          <input className={inputClass} name="playerName" required />
        </label>
        <label className="grid gap-2 text-sm font-bold text-navy">
          Player Age
          <input className={inputClass} name="playerAge" inputMode="numeric" required />
        </label>
        <label className="grid gap-2 text-sm font-bold text-navy">
          Parent/Guardian Name
          <input className={inputClass} name="parentName" autoComplete="name" required />
        </label>
        <label className="grid gap-2 text-sm font-bold text-navy">
          Parent Email
          <input className={inputClass} name="parentEmail" type="email" autoComplete="email" required />
        </label>
        <label className="grid gap-2 text-sm font-bold text-navy">
          Parent Phone
          <input className={inputClass} name="parentPhone" type="tel" autoComplete="tel" required />
        </label>
        <label className="grid gap-2 text-sm font-bold text-navy">
          Preferred Dates/Times
          <input className={inputClass} name="preferredTimes" placeholder="Example: weekday mornings, Tue/Thu evenings" required />
        </label>
      </div>

      <fieldset className="grid gap-3">
        <legend className="text-sm font-bold text-navy">What should the player work on?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {focusOptions.map((focus) => (
            <label
              key={focus}
              className={`flex items-center gap-3 rounded-md border px-4 py-3 text-sm font-bold transition ${
                selectedFocus.includes(focus)
                  ? "border-electric bg-blue-50 text-navy"
                  : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              <input
                type="checkbox"
                checked={selectedFocus.includes(focus)}
                onChange={() => toggleFocus(focus)}
              />
              {focus}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="grid gap-2 text-sm font-bold text-navy">
        Notes
        <textarea
          className={`${inputClass} min-h-28 resize-y`}
          name="notes"
          placeholder="Add position, goals, schedule notes, or anything Coach Hugo should know"
        />
      </label>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-electric px-6 py-3 text-sm font-black uppercase text-white shadow-lg shadow-electric/25 transition hover:bg-blue-500 disabled:cursor-wait disabled:opacity-70"
        >
          <MailIcon className="h-5 w-5" />
          {isSubmitting ? "Sending..." : "Submit Private Request"}
        </button>
        {status ? <p className="text-sm font-semibold text-field">{status}</p> : null}
      </div>
    </form>
  );
}

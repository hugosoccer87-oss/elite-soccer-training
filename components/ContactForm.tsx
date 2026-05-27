"use client";

import { useState } from "react";
import { MailIcon } from "./Icons";

const inputClass =
  "field-focus w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400";

export function ContactForm() {
  const [message, setMessage] = useState("");

  return (
    <form
      className="panel grid gap-5 p-5 sm:p-8"
      data-integration-ready="formspree-google-forms-email"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage("Message captured locally. Add an email or form endpoint when the site is ready to go live.");
      }}
    >
      <label className="grid gap-2 text-sm font-bold text-navy">
        Name
        <input className={inputClass} name="name" autoComplete="name" required />
      </label>
      <label className="grid gap-2 text-sm font-bold text-navy">
        Email
        <input className={inputClass} name="email" type="email" autoComplete="email" required />
      </label>
      <label className="grid gap-2 text-sm font-bold text-navy">
        Message
        <textarea className={`${inputClass} min-h-36 resize-y`} name="message" required />
      </label>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-electric px-6 py-3 text-sm font-black text-white shadow-lg shadow-electric/25 transition hover:bg-blue-500"
        >
          <MailIcon className="h-5 w-5" />
          Send Message
        </button>
        {message ? <p className="text-sm font-semibold text-field">{message}</p> : null}
      </div>
    </form>
  );
}

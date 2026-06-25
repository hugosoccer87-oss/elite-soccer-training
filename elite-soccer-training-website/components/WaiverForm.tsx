"use client";

import { useState } from "react";
import { SignaturePad } from "./SignaturePad";

const inputClass =
  "field-focus w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400";

export function WaiverForm() {
  const [message, setMessage] = useState("");

  return (
    <form
      className="panel grid gap-5 p-5 sm:p-8"
      data-integration-ready="future-waiver-storage"
      onSubmit={(event) => {
        event.preventDefault();
        setMessage("Waiver captured locally. Connect secure storage before collecting real submissions online.");
      }}
    >
      <label className="grid gap-2 text-sm font-bold text-navy">
        Parent / Guardian Name
        <input className={inputClass} name="guardianName" autoComplete="name" required />
      </label>
      <label className="grid gap-2 text-sm font-bold text-navy">
        Date
        <input className={inputClass} name="date" type="date" required />
      </label>
      <label className="grid gap-2 text-sm font-bold text-navy">
        Type Signature
        <input className={inputClass} name="typedSignature" placeholder="Parent / guardian legal name" required />
      </label>
      <div className="grid gap-2 text-sm font-bold text-navy">
        Draw Signature
        <SignaturePad />
      </div>
      <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-mist p-4 text-sm leading-6 text-slate-700">
        <input className="mt-1 h-4 w-4 rounded border-slate-300 text-electric" name="agree" type="checkbox" required />
        <span>I agree to the terms and conditions above.</span>
      </label>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="submit"
          className="rounded-md bg-electric px-6 py-3 text-sm font-black text-white shadow-lg shadow-electric/25 transition hover:bg-blue-500"
        >
          Submit Waiver
        </button>
        {message ? <p className="text-sm font-semibold text-field">{message}</p> : null}
      </div>
    </form>
  );
}

"use client";

import { useEffect, useState, type ReactNode } from "react";

const adminAccessKey = "est-admin-access";
const adminPasscode = "EST-ADMIN";

export function AdminGate({ children }: { children: ReactNode }) {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setIsUnlocked(window.localStorage.getItem(adminAccessKey) === "unlocked");
  }, []);

  function unlock() {
    if (passcode.trim().toUpperCase() !== adminPasscode) {
      setError("Enter the owner passcode to manage availability.");
      return;
    }

    window.localStorage.setItem(adminAccessKey, "unlocked");
    setIsUnlocked(true);
    setError("");
  }

  if (isUnlocked) {
    return <>{children}</>;
  }

  return (
    <section className="bg-mist py-16 sm:py-20">
      <div className="section-shell">
        <div className="mx-auto max-w-xl rounded-lg border border-slate-200 bg-white p-6 shadow-xl shadow-navy/10 sm:p-8">
          <p className="text-sm font-black uppercase text-electric">Owner Access</p>
          <h1 className="mt-3 text-3xl font-black text-navy">Admin schedule tools</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            This page is hidden from public navigation. Enter the owner passcode to continue.
          </p>
          <label className="mt-6 grid gap-2 text-sm font-bold text-navy">
            Passcode
            <input
              className="field-focus w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
              type="password"
              value={passcode}
              onChange={(event) => {
                setPasscode(event.target.value);
                setError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  unlock();
                }
              }}
            />
          </label>
          {error ? <p className="mt-3 text-sm font-bold text-red-700">{error}</p> : null}
          <button
            type="button"
            onClick={unlock}
            className="mt-5 rounded-md bg-electric px-6 py-3 text-sm font-black uppercase text-white shadow-lg shadow-electric/25"
          >
            Unlock Admin
          </button>
        </div>
      </div>
    </section>
  );
}

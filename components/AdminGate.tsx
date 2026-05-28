"use client";

import { useEffect, useState, type ReactNode } from "react";

export function AdminGate({ children }: { children: ReactNode }) {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    fetch("/api/admin/session", {
      cache: "no-store"
    })
      .then(async (response) => {
        const result = (await response.json()) as { authenticated?: boolean; error?: string };

        if (!active) {
          return;
        }

        setIsUnlocked(Boolean(result.authenticated));

        if (!response.ok && result.error) {
          setError(result.error);
        }
      })
      .catch(() => {
        if (active) {
          setError("Admin access could not be verified.");
        }
      })
      .finally(() => {
        if (active) {
          setIsChecking(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  async function unlock() {
    if (!passcode.trim()) {
      setError("Enter the owner passcode to manage availability.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ passcode })
      });
      const result = (await response.json()) as { authenticated?: boolean; error?: string };

      if (!response.ok || !result.authenticated) {
        setError(result.error ?? "Enter the correct owner passcode.");
        return;
      }

      setIsUnlocked(true);
    } catch {
      setError("Admin access could not be verified.");
    } finally {
      setIsSubmitting(false);
    }
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
          {isChecking ? <p className="mt-4 text-sm font-bold text-slate-600">Checking owner access...</p> : null}
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
                  void unlock();
                }
              }}
            />
          </label>
          {error ? <p className="mt-3 text-sm font-bold text-red-700">{error}</p> : null}
          <button
            type="button"
            onClick={() => void unlock()}
            disabled={isChecking || isSubmitting}
            className="mt-5 rounded-md bg-electric px-6 py-3 text-sm font-black uppercase text-white shadow-lg shadow-electric/25 disabled:cursor-wait disabled:opacity-70"
          >
            {isSubmitting ? "Checking..." : "Unlock Admin"}
          </button>
        </div>
      </div>
    </section>
  );
}

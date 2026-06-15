"use client";

import { useEffect, useMemo, useState } from "react";
import { bookingNotificationEmail, slotCapacity, trainingGroups, type TrainingGroupId } from "@/lib/booking-data";
import { business } from "@/lib/site-data";
import type { AdminBookingRecord, AdminPassPurchase, AdminTrainingSession } from "@/lib/supabase-db";
import { waiverRecordFooter, waiverSections } from "@/lib/waiver-content";

const inputClass =
  "field-focus w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400";

type AdminDiagnostics = {
  stripeKeyMode: "test" | "live" | "unknown" | "missing";
  webhookSecretExists: boolean;
  smtpConfigured: boolean;
  emailFromConfigured: boolean;
  adminNotificationRecipient: string;
  supabase?: {
    configured: boolean;
    urlConfigured: boolean;
    serviceRoleKeyConfigured: boolean;
  };
  googleCalendar?: {
    googleCalendarConfigured: boolean;
    googleCalendarId: string;
    googleServiceAccountEmail: string;
    hasGoogleClientId: boolean;
    hasGoogleClientSecret: boolean;
    hasGoogleRefreshToken: boolean;
    lastCalendarEventCreationResult: {
      checkedAt: string;
      bookingId?: string;
      status: string;
      calendarId: string;
      eventId?: string;
      message?: string;
    } | null;
  };
  lastEmailAttempt: {
    checkedAt: string;
    bookingId?: string;
    smtpConfigured: boolean;
    emailFromConfigured: boolean;
    adminNotificationRecipient: string;
    customerRecipient?: string;
    customerStatus: "not_attempted" | "sent" | "failed";
    adminStatus: "not_attempted" | "sent" | "failed";
    message?: string;
  } | null;
  lastPaymentVerificationResult: {
    checkedAt: string;
    source: string;
    verified: boolean;
    sessionId?: string;
    bookingId?: string;
    sessionStatus?: string;
    paymentStatus?: string;
    message?: string;
  } | null;
};

type SessionsResponse = {
  status?: string;
  sessions?: AdminTrainingSession[];
  error?: string;
};

type PassesResponse = {
  status?: string;
  passes?: AdminPassPurchase[];
  error?: string;
};

type ActiveWaiverRecord = {
  booking: AdminBookingRecord;
  session: AdminTrainingSession;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDateTime(value: string, timeZone = "America/Los_Angeles") {
  const date = new Date(value);

  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatDateOnly(value: string, timeZone = "America/Los_Angeles") {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((current, part) => {
      if (part.type !== "literal") {
        current[part.type] = part.value;
      }

      return current;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatWaiverTimestamp(value?: string | null) {
  if (!value) {
    return "Not recorded";
  }

  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Los_Angeles"
  });
}

function bookingProgramLabel(booking: AdminBookingRecord) {
  return trainingGroups.find((group) => group.id === booking.training_group)?.name ?? booking.training_group;
}

function passTypeLabel(passType: string) {
  if (passType === "four_session_launch_pass") {
    return "4-Session Launch Pass";
  }

  if (passType === "six_session_launch_pass") {
    return "6-Session Launch Pass";
  }

  return passType;
}

function bookingWaiverRecordText(booking: AdminBookingRecord, session?: AdminTrainingSession) {
  const waiver = booking.waiver;

  return [
    "Elite Soccer Training CV - Signed Waiver Record",
    "",
    "Business Name: Elite Soccer Training CV",
    `Booking ID: ${booking.id}`,
    `Training Group: ${bookingProgramLabel(booking)}`,
    `Session: ${session ? formatDateTime(session.start_datetime, session.timezone) : "Not recorded"}`,
    "",
    "Participant Information",
    `Parent/Guardian Name: ${booking.parent_name}`,
    `Player Name: ${booking.player_name}`,
    `Player Age: ${booking.player_age}`,
    `Parent Phone: ${booking.parent_phone}`,
    `Parent Email: ${booking.parent_email}`,
    `Emergency Contact: ${booking.emergency_name || "Not recorded"} - ${booking.emergency_phone || "Not recorded"}`,
    `Medical Conditions/Allergies/Notes: ${booking.medical_notes || waiver?.emergency_medical_notes || "None"}`,
    "",
    "Signed Waiver",
    `Waiver Signed: ${waiver?.waiver_signed ? "Yes" : "Not recorded"}`,
    `Typed Signature: ${waiver?.typed_signature || "Not recorded"}`,
    `Signed Timestamp: ${formatWaiverTimestamp(waiver?.signed_at)}`,
    `Media Consent: ${waiver?.media_consent || "Not recorded"}`,
    `IP Address: ${waiver?.ip_address || "Not collected"}`,
    "",
    "Booking Notes",
    `Notes: ${booking.notes || "None"}`,
    `Payment Status: ${booking.status}`,
    `Stripe Checkout Session: ${booking.stripe_checkout_session_id || "Not recorded"}`,
    `Stripe Payment Intent: ${booking.stripe_payment_intent_id || "Not recorded"}`,
    `Google Calendar Event ID: ${booking.calendarEvent?.google_calendar_event_id || "Not recorded"}`,
    "",
    "Full Waiver Legal Text Agreed To By Parent/Guardian",
    "",
    ...waiverSections.flatMap((section) => [section.title, section.copy, ""]),
    waiverRecordFooter
  ].join("\n");
}

function printableWaiverHtml(booking: AdminBookingRecord, session?: AdminTrainingSession) {
  return `
    <!doctype html>
    <html>
      <head>
        <title>Elite Soccer Training CV - Signed Waiver Record</title>
        <style>
          body { background:#f4f6f8; color:#06152b; font-family: Arial, sans-serif; margin:0; padding:32px; }
          main { background:#fffdf8; border:1px solid #cbd5e1; margin:0 auto; max-width:820px; padding:42px; }
          h1 { font-size:24px; margin:0 0 8px; }
          pre { color:#334155; font-family: Arial, sans-serif; font-size:13px; line-height:1.65; white-space:pre-wrap; }
          @media print {
            body { background:#fff; padding:0; }
            main { border:0; max-width:none; padding:24px; }
          }
        </style>
      </head>
      <body>
        <main>
          <h1>Elite Soccer Training CV - Signed Waiver Record</h1>
          <pre>${escapeHtml(bookingWaiverRecordText(booking, session))}</pre>
        </main>
      </body>
    </html>
  `;
}

function printWaiverRecord(booking: AdminBookingRecord, session?: AdminTrainingSession) {
  const popup = window.open("", "_blank", "noopener,noreferrer,width=900,height=900");

  if (!popup) {
    return;
  }

  popup.document.write(printableWaiverHtml(booking, session));
  popup.document.close();
  popup.focus();
  popup.print();
}

function downloadWaiverRecord(booking: AdminBookingRecord, session?: AdminTrainingSession) {
  const blob = new Blob([bookingWaiverRecordText(booking, session)], { type: "text/plain;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeBookingId = booking.id.replace(/[^a-z0-9-]/gi, "-").toLowerCase();

  link.href = url;
  link.download = `waiver-record-${safeBookingId}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

async function readAdminDiagnostics() {
  try {
    const response = await fetch("/api/admin/diagnostics", {
      cache: "no-store"
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as AdminDiagnostics;
  } catch {
    return null;
  }
}

async function readAdminSessions() {
  const response = await fetch(`/api/admin/sessions?fresh=${Date.now()}`, {
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache"
    }
  });
  const result = (await response.json().catch(() => ({}))) as SessionsResponse;

  if (!response.ok) {
    throw new Error(result.error || "Training sessions could not be loaded.");
  }

  return result.sessions ?? [];
}

async function readAdminPasses() {
  const response = await fetch(`/api/admin/passes?fresh=${Date.now()}`, {
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache"
    }
  });
  const result = (await response.json().catch(() => ({}))) as PassesResponse;

  if (!response.ok) {
    throw new Error(result.error || "Launch Passes could not be loaded.");
  }

  return result.passes ?? [];
}

export function AdminAvailability() {
  const [sessions, setSessions] = useState<AdminTrainingSession[]>([]);
  const [passes, setPasses] = useState<AdminPassPurchase[]>([]);
  const [newGroupId, setNewGroupId] = useState<TrainingGroupId>(trainingGroups[0].id);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("17:00");
  const [newCapacity, setNewCapacity] = useState(String(slotCapacity));
  const [newLocation, setNewLocation] = useState(business.location);
  const [blockDate, setBlockDate] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [diagnostics, setDiagnostics] = useState<AdminDiagnostics | null>(null);
  const [activeWaiverRecord, setActiveWaiverRecord] = useState<ActiveWaiverRecord | null>(null);

  async function refreshAdminData(message?: string) {
    try {
      setError("");
      const [nextSessions, nextPasses, nextDiagnostics] = await Promise.all([
        readAdminSessions(),
        readAdminPasses(),
        readAdminDiagnostics()
      ]);
      setSessions(nextSessions);
      setPasses(nextPasses);
      setDiagnostics(nextDiagnostics);
      if (message) {
        setNotice(message);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Admin data could not be loaded.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void refreshAdminData();
  }, []);

  const counts = useMemo(
    () => ({
      open: sessions.filter((session) => session.status === "open" && session.remainingSpots > 0).length,
      full: sessions.filter((session) => session.status === "open" && session.remainingSpots <= 0).length,
      unavailable: sessions.filter((session) => session.status !== "open").length,
      bookings: sessions.reduce((total, session) => total + session.paidBookings.length, 0)
    }),
    [sessions]
  );
  const passCounts = useMemo(
    () => ({
      paid: passes.filter((pass) => pass.status === "paid").length,
      remainingCredits: passes.reduce((total, pass) => total + (Number(pass.remaining_credits) || 0), 0),
      redemptions: passes.reduce((total, pass) => total + pass.redemptions.length, 0)
    }),
    [passes]
  );

  async function addSession() {
    if (!newDate || !newTime) {
      setError("Choose a date and start time before adding a session.");
      return;
    }

    setIsSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/admin/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          trainingGroup: newGroupId,
          date: newDate,
          time: newTime,
          capacity: Math.min(slotCapacity, Math.max(1, Number(newCapacity) || slotCapacity)),
          location: newLocation
        })
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error || "The session could not be added.");
      }

      await refreshAdminData("Training session added to Supabase availability.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The session could not be added.");
    } finally {
      setIsSaving(false);
    }
  }

  async function updateSession(id: string, updates: { status?: "open" | "closed" | "cancelled"; capacity?: number; location?: string }) {
    setIsSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/admin/sessions/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(updates)
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error || "The session could not be updated.");
      }

      await refreshAdminData("Training session updated.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The session could not be updated.");
    } finally {
      setIsSaving(false);
    }
  }

  async function removeSession(id: string) {
    setIsSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/admin/sessions/${encodeURIComponent(id)}`, {
        method: "DELETE"
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error || "The session could not be deleted.");
      }

      await refreshAdminData("Training session deleted.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The session could not be deleted.");
    } finally {
      setIsSaving(false);
    }
  }

  async function closeSessionsOnDate() {
    if (!blockDate) {
      setError("Choose a date before closing sessions.");
      return;
    }

    const sessionsForDate = sessions.filter((session) => formatDateOnly(session.start_datetime, session.timezone) === blockDate);

    if (sessionsForDate.length === 0) {
      setNotice("No sessions exist for that date.");
      return;
    }

    setIsSaving(true);
    setError("");
    setNotice("");

    try {
      await Promise.all(sessionsForDate.map((session) => updateSession(session.id, { status: "closed" })));
      await refreshAdminData("All sessions on that date were closed.");
    } finally {
      setIsSaving(false);
    }
  }

  function editCapacity(session: AdminTrainingSession) {
    const nextCapacity = window.prompt("Set session capacity. Max is 6 players.", String(session.capacity));

    if (nextCapacity === null) {
      return;
    }

    const parsedCapacity = Math.min(slotCapacity, Math.max(1, Number(nextCapacity) || session.capacity));
    void updateSession(session.id, { capacity: parsedCapacity });
  }

  function editLocation(session: AdminTrainingSession) {
    const nextLocation = window.prompt("Set session location.", session.location || business.location);

    if (nextLocation === null) {
      return;
    }

    void updateSession(session.id, { location: nextLocation.trim() || business.location });
  }

  return (
    <div className="grid gap-8">
      <section className="panel p-5 sm:p-8">
        <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-start">
          <div>
            <p className="text-sm font-black uppercase text-electric">Admin Availability</p>
            <h2 className="mt-2 text-3xl font-black text-navy">Manage program booking slots.</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Add Future Elite and Elite Performance sessions, then track the six-player capacity and paid bookings from
              Supabase.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
            {[
              ["Open", counts.open],
              ["Full", counts.full],
              ["Unavailable", counts.unavailable],
              ["Bookings", counts.bookings]
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-slate-200 bg-mist p-4">
                <p className="text-2xl font-black text-navy">{value}</p>
                <p className="text-xs font-black uppercase text-slate-500">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {isLoading ? <p className="mt-5 rounded-md bg-mist p-3 text-sm font-bold text-slate-600">Loading Supabase sessions...</p> : null}
        {notice ? <p className="mt-5 rounded-md bg-field/10 p-3 text-sm font-bold text-field">{notice}</p> : null}
        {error ? <p className="mt-5 rounded-md bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}

        {diagnostics ? (
          <div className="mt-5 grid gap-3 rounded-lg border border-slate-200 bg-mist p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs font-black uppercase text-slate-500">Supabase configured</p>
              <p className="mt-1 font-black text-navy">{diagnostics.supabase?.configured ? "yes" : "no"}</p>
              <p className="mt-1 text-xs font-bold text-slate-500">
                URL: {diagnostics.supabase?.urlConfigured ? "yes" : "no"} / Service role:{" "}
                {diagnostics.supabase?.serviceRoleKeyConfigured ? "yes" : "no"}
              </p>
            </div>
            <div>
              <p className="text-xs font-black uppercase text-slate-500">Stripe key mode</p>
              <p className="mt-1 font-black text-navy">{diagnostics.stripeKeyMode}</p>
            </div>
            <div>
              <p className="text-xs font-black uppercase text-slate-500">Google Calendar configured</p>
              <p className="mt-1 font-black text-navy">{diagnostics.googleCalendar?.googleCalendarConfigured ? "yes" : "no"}</p>
              <p className="mt-1 break-words text-xs font-bold text-slate-500">
                Calendar: {diagnostics.googleCalendar?.googleCalendarId || "primary"}
              </p>
            </div>
            <div>
              <p className="text-xs font-black uppercase text-slate-500">Google client email</p>
              <p className="mt-1 break-words font-black text-navy">
                {diagnostics.googleCalendar?.googleServiceAccountEmail || "not configured"}
              </p>
            </div>
            <div>
              <p className="text-xs font-black uppercase text-slate-500">Last calendar event</p>
              <p className="mt-1 font-black text-navy">
                {diagnostics.googleCalendar?.lastCalendarEventCreationResult?.status || "none yet"}
              </p>
              {diagnostics.googleCalendar?.lastCalendarEventCreationResult?.message ? (
                <p className="mt-1 text-xs font-bold text-slate-500">
                  {diagnostics.googleCalendar.lastCalendarEventCreationResult.message}
                </p>
              ) : null}
            </div>
            <div>
              <p className="text-xs font-black uppercase text-slate-500">Webhook secret</p>
              <p className="mt-1 font-black text-navy">{diagnostics.webhookSecretExists ? "yes" : "no"}</p>
            </div>
            <div>
              <p className="text-xs font-black uppercase text-slate-500">Last payment verification</p>
              <p className="mt-1 font-black text-navy">
                {diagnostics.lastPaymentVerificationResult
                  ? diagnostics.lastPaymentVerificationResult.verified
                    ? "verified"
                    : "not verified"
                  : "none yet"}
              </p>
            </div>
            <div>
              <p className="text-xs font-black uppercase text-slate-500">SMTP configured</p>
              <p className="mt-1 font-black text-navy">{diagnostics.smtpConfigured ? "yes" : "no"}</p>
              <p className="mt-1 text-xs font-bold text-slate-500">
                EMAIL_FROM: {diagnostics.emailFromConfigured ? "yes" : "no"}
              </p>
            </div>
            <div>
              <p className="text-xs font-black uppercase text-slate-500">Admin email recipient</p>
              <p className="mt-1 break-words font-black text-navy">{diagnostics.adminNotificationRecipient}</p>
            </div>
            <div>
              <p className="text-xs font-black uppercase text-slate-500">Last email attempt</p>
              <p className="mt-1 font-black text-navy">
                {diagnostics.lastEmailAttempt
                  ? `Customer ${diagnostics.lastEmailAttempt.customerStatus} / Admin ${diagnostics.lastEmailAttempt.adminStatus}`
                  : "none yet"}
              </p>
            </div>
          </div>
        ) : null}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="panel p-5 sm:p-6">
          <h3 className="text-xl font-black text-navy">Add Available Session</h3>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-bold text-navy sm:col-span-2">
              Program
              <select className={inputClass} value={newGroupId} onChange={(event) => setNewGroupId(event.target.value as TrainingGroupId)}>
                {trainingGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name} ({group.ages})
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-bold text-navy">
              Date
              <input className={inputClass} type="date" value={newDate} onChange={(event) => setNewDate(event.target.value)} />
            </label>
            <label className="grid gap-2 text-sm font-bold text-navy">
              Start Time
              <input className={inputClass} type="time" value={newTime} onChange={(event) => setNewTime(event.target.value)} />
            </label>
            <label className="grid gap-2 text-sm font-bold text-navy">
              Capacity
              <input
                className={inputClass}
                type="number"
                min="1"
                max="6"
                value={newCapacity}
                onChange={(event) => setNewCapacity(event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm font-bold text-navy">
              Duration
              <input className={inputClass} type="number" min="60" max="60" value="60" readOnly />
            </label>
            <label className="grid gap-2 text-sm font-bold text-navy sm:col-span-2">
              Location
              <input className={inputClass} value={newLocation} onChange={(event) => setNewLocation(event.target.value)} />
            </label>
          </div>
          <button
            type="button"
            disabled={isSaving}
            onClick={addSession}
            className="mt-5 rounded-md bg-electric px-6 py-3 text-sm font-black uppercase text-white shadow-lg shadow-electric/25 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Add Session
          </button>
        </div>

        <div className="panel p-5 sm:p-6">
          <h3 className="text-xl font-black text-navy">Close Unavailable Day</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            This closes existing sessions on that date. Parents only see open Supabase sessions with remaining spots.
          </p>
          <label className="mt-5 grid gap-2 text-sm font-bold text-navy">
            Date
            <input className={inputClass} type="date" value={blockDate} onChange={(event) => setBlockDate(event.target.value)} />
          </label>
          <button
            type="button"
            disabled={isSaving}
            onClick={closeSessionsOnDate}
            className="mt-5 rounded-md bg-navy px-6 py-3 text-sm font-black uppercase text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            Close Day
          </button>
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="grid gap-4 border-b border-slate-200 p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
          <div>
            <p className="text-xs font-black uppercase text-electric">Launch Passes / Credits</p>
            <h3 className="mt-2 text-xl font-black text-navy">Paid Launch Pass purchases</h3>
            <p className="mt-2 text-sm text-slate-600">
              Track remaining credits, expiration, and bookings paid by Launch Pass credit.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-slate-200 bg-mist p-3">
              <p className="text-xl font-black text-navy">{passCounts.paid}</p>
              <p className="text-[10px] font-black uppercase text-slate-500">Paid Passes</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-mist p-3">
              <p className="text-xl font-black text-navy">{passCounts.remainingCredits}</p>
              <p className="text-[10px] font-black uppercase text-slate-500">Credits Left</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-mist p-3">
              <p className="text-xl font-black text-navy">{passCounts.redemptions}</p>
              <p className="text-[10px] font-black uppercase text-slate-500">Used</p>
            </div>
          </div>
        </div>
        {passes.length > 0 ? (
          <div className="grid divide-y divide-slate-200">
            {passes.map((pass) => (
              <article key={pass.id} className="grid gap-4 p-5">
                <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
                  <div>
                    <p className="text-xs font-black uppercase text-electric">{passTypeLabel(pass.pass_type)}</p>
                    <h4 className="mt-1 text-lg font-black text-navy">{pass.player_name}</h4>
                    <p className="mt-1 text-sm text-slate-600">
                      Parent: {pass.parent_name} - {pass.parent_email} - {pass.parent_phone}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Training group: {trainingGroups.find((group) => group.id === pass.training_group)?.name ?? pass.training_group}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-mist p-4 text-sm">
                    <p className="font-black text-navy">
                      {pass.remaining_credits}/{pass.total_credits} credits remaining
                    </p>
                    <p className="mt-1 text-slate-600">Status: {pass.status}</p>
                    <p className="mt-1 text-slate-600">
                      Expires: {new Date(pass.expires_at).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" })}
                    </p>
                    <p className="mt-1 text-slate-600">Paid: ${(pass.amount_paid / 100).toFixed(2)}</p>
                  </div>
                </div>
                {pass.redemptions.length > 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <p className="text-xs font-black uppercase text-electric">Redemption History</p>
                    <div className="mt-3 grid gap-2 text-sm text-slate-600">
                      {pass.redemptions.map((redemption) => (
                        <p key={redemption.id}>
                          {new Date(redemption.created_at).toLocaleString("en-US", {
                            dateStyle: "medium",
                            timeStyle: "short",
                            timeZone: "America/Los_Angeles"
                          })}{" "}
                          - {redemption.credits_used} credit used
                          {redemption.booking ? ` for ${redemption.booking.player_name}` : ""}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="rounded-lg border border-slate-200 bg-mist p-4 text-sm font-bold text-slate-600">
                    No credits used yet.
                  </p>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="p-5 sm:p-6">
            <p className="rounded-lg border border-slate-200 bg-mist p-5 text-sm font-bold text-slate-600">
              No Launch Pass purchases yet.
            </p>
          </div>
        )}
      </section>

      <section className="panel overflow-hidden">
        <div className="grid gap-4 border-b border-slate-200 p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
          <div>
            <h3 className="text-xl font-black text-navy">Supabase Sessions</h3>
            <p className="mt-2 text-sm text-slate-600">
              These are the only sessions that can appear on the public booking page.
            </p>
          </div>
          <button type="button" onClick={() => void refreshAdminData("Sessions refreshed.")} className="rounded-md border border-slate-300 px-4 py-2 text-xs font-black text-navy">
            Refresh
          </button>
        </div>
        {sessions.length > 0 ? (
          <div className="grid divide-y divide-slate-200">
            {sessions.map((session) => {
              const group = trainingGroups.find((item) => item.id === session.training_group);
              const isFull = session.remainingSpots <= 0;

              return (
                <article key={session.id} className="grid gap-5 p-5">
                  <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
                    <div>
                      <p className="text-xs font-black uppercase text-electric">
                        {group?.name ?? session.title} {group ? `(${group.ages})` : ""}
                      </p>
                      <h4 className="mt-1 text-lg font-black text-navy">
                        {formatDateTime(session.start_datetime, session.timezone)}
                      </h4>
                      <p className="mt-1 text-sm text-slate-600">
                        {session.location || business.location} - {session.paidPlayers}/{session.capacity} players booked -{" "}
                        {isFull ? "full" : `${session.remainingSpots} ${session.remainingSpots === 1 ? "spot" : "spots"} remaining`}
                      </p>
                      <p className="mt-1 text-xs font-black uppercase text-slate-500">Status: {session.status}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => void updateSession(session.id, { status: "open" })} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-black text-navy">
                        Open
                      </button>
                      <button type="button" onClick={() => void updateSession(session.id, { status: "closed" })} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-black text-navy">
                        Close
                      </button>
                      <button type="button" onClick={() => void updateSession(session.id, { status: "cancelled" })} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-black text-navy">
                        Cancel
                      </button>
                      <button type="button" onClick={() => editCapacity(session)} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-black text-navy">
                        Capacity
                      </button>
                      <button type="button" onClick={() => editLocation(session)} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-black text-navy">
                        Location
                      </button>
                      <button type="button" onClick={() => void removeSession(session.id)} className="rounded-md border border-red-200 px-3 py-2 text-xs font-black text-red-700">
                        Delete
                      </button>
                    </div>
                  </div>

                  {session.paidBookings.length > 0 ? (
                    <div className="rounded-lg border border-slate-200 bg-mist p-4">
                      <p className="text-xs font-black uppercase text-electric">Paid Bookings</p>
                      <div className="mt-3 grid gap-4">
                        {session.paidBookings.map((booking) => (
                          <article key={booking.id} className="rounded-lg border border-slate-200 bg-white p-4">
                            <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                              <div>
                                <h5 className="font-black text-navy">{booking.player_name}</h5>
                                <p className="mt-1 text-sm text-slate-600">
                                  {booking.player_count} player(s) - Payment: {booking.status}
                                </p>
                                <p className="mt-1 text-sm text-slate-600">
                                  Payment type:{" "}
                                  {booking.payment_type === "launch_pass_credit" ? "Launch Pass credit" : "Single Session"}
                                </p>
                                {booking.payment_type === "launch_pass_credit" ? (
                                  <p className="mt-1 text-sm text-slate-600">
                                    Pass credits remaining: {booking.passPurchase?.remaining_credits ?? "Not loaded"}
                                  </p>
                                ) : null}
                                <p className="mt-1 text-sm text-slate-600">Amount paid: ${(booking.amount_paid / 100).toFixed(2)}</p>
                              </div>
                              <div className="grid gap-1 text-sm text-slate-600">
                                <p><span className="font-black text-navy">Parent:</span> {booking.parent_name}</p>
                                <p><span className="font-black text-navy">Phone:</span> {booking.parent_phone}</p>
                                <p><span className="font-black text-navy">Email:</span> {booking.parent_email}</p>
                                <p><span className="font-black text-navy">Emergency:</span> {booking.emergency_name || "Not recorded"} - {booking.emergency_phone || "Not recorded"}</p>
                                <p><span className="font-black text-navy">Notes:</span> {booking.notes || "None"}</p>
                                <p><span className="font-black text-navy">Medical:</span> {booking.medical_notes || "None"}</p>
                                <p><span className="font-black text-navy">Calendar Event ID:</span> {booking.calendarEvent?.google_calendar_event_id || "Not recorded"}</p>
                                <p>
                                  <span className="font-black text-navy">Email Logs:</span>{" "}
                                  {booking.emailLogs.length > 0
                                    ? booking.emailLogs.map((log) => `${log.email_type}: ${log.status}`).join(" / ")
                                    : "No email logs yet"}
                                </p>
                              </div>
                            </div>

                            <div className="mt-4 rounded-lg border border-slate-200 bg-mist p-4">
                              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
                                <div>
                                  <p className="text-xs font-black uppercase text-electric">Waiver Record</p>
                                  <div className="mt-3 grid gap-1 text-sm text-slate-600 sm:grid-cols-2">
                                    <p><span className="font-black text-navy">Waiver Signed:</span> {booking.waiver?.waiver_signed ? "Yes" : "Not recorded"}</p>
                                    <p><span className="font-black text-navy">Typed Signature:</span> {booking.waiver?.typed_signature || "Not recorded"}</p>
                                    <p><span className="font-black text-navy">Signed Timestamp:</span> {formatWaiverTimestamp(booking.waiver?.signed_at)}</p>
                                    <p><span className="font-black text-navy">IP Address:</span> {booking.waiver?.ip_address || "Not collected"}</p>
                                    <p><span className="font-black text-navy">Media Consent:</span> {booking.waiver?.media_consent || "Not recorded"}</p>
                                    <p className="sm:col-span-2"><span className="font-black text-navy">Medical:</span> {booking.waiver?.emergency_medical_notes || booking.medical_notes || "None"}</p>
                                  </div>
                                </div>
                                <div className="flex flex-col gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setActiveWaiverRecord({ booking, session })}
                                    className="rounded-md bg-navy px-4 py-2 text-xs font-black uppercase text-white transition hover:bg-electric"
                                  >
                                    View Waiver Record
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => printWaiverRecord(booking, session)}
                                    className="rounded-md border border-navy px-4 py-2 text-xs font-black uppercase text-navy transition hover:border-electric hover:text-electric"
                                  >
                                    Print Waiver
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => downloadWaiverRecord(booking, session)}
                                    className="rounded-md border border-slate-300 px-4 py-2 text-xs font-black uppercase text-navy transition hover:border-electric hover:text-electric"
                                  >
                                    Download Waiver Record
                                  </button>
                                </div>
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="rounded-lg border border-slate-200 bg-mist p-4 text-sm font-bold text-slate-600">
                      No paid bookings for this session yet.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="p-5 sm:p-6">
            <p className="rounded-lg border border-slate-200 bg-mist p-5 text-sm font-bold text-slate-600">
              No Supabase sessions yet. Add the first available session above.
            </p>
          </div>
        )}
      </section>

      <section className="panel overflow-hidden">
        <div className="grid gap-4 border-b border-slate-200 p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
          <div>
            <h3 className="text-xl font-black text-navy">Email Notifications</h3>
            <p className="mt-2 text-sm text-slate-600">Owner notifications are sent to {bookingNotificationEmail}.</p>
          </div>
        </div>
      </section>

      {activeWaiverRecord ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-navy/70 px-4 py-8">
          <div className="mx-auto max-w-4xl border border-slate-300 bg-[#fffdf8] p-5 shadow-2xl sm:p-8">
            <div className="flex flex-col gap-4 border-b border-slate-300 pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase text-electric">Waiver Record</p>
                <h3 className="mt-1 text-2xl font-black text-navy">
                  Signed waiver for {activeWaiverRecord.booking.player_name}
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => printWaiverRecord(activeWaiverRecord.booking, activeWaiverRecord.session)}
                  className="rounded-md bg-navy px-4 py-2 text-xs font-black uppercase text-white"
                >
                  Print Waiver
                </button>
                <button
                  type="button"
                  onClick={() => setActiveWaiverRecord(null)}
                  className="rounded-md border border-slate-300 px-4 py-2 text-xs font-black uppercase text-navy"
                >
                  Close
                </button>
              </div>
            </div>
            <pre className="mt-5 whitespace-pre-wrap text-sm leading-7 text-slate-700">
              {bookingWaiverRecordText(activeWaiverRecord.booking, activeWaiverRecord.session)}
            </pre>
          </div>
        </div>
      ) : null}
    </div>
  );
}

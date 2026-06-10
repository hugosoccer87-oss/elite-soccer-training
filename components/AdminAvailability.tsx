"use client";

import { useEffect, useMemo, useState } from "react";
import { bookingNotificationEmail, slotCapacity, trainingGroups, type TrainingGroupId } from "@/lib/booking-data";
import { business } from "@/lib/site-data";
import type { AdminBookingRecord, AdminTrainingSession } from "@/lib/supabase-db";

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

function bookingWaiverRecordText(booking: AdminBookingRecord, session?: AdminTrainingSession) {
  const waiver = booking.waiver;

  return [
    "Elite Soccer Training CV - Waiver Record",
    "",
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
    `Google Calendar Event ID: ${booking.calendarEvent?.google_calendar_event_id || "Not recorded"}`
  ].join("\n");
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

export function AdminAvailability() {
  const [sessions, setSessions] = useState<AdminTrainingSession[]>([]);
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

  async function refreshAdminData(message?: string) {
    try {
      setError("");
      const [nextSessions, nextDiagnostics] = await Promise.all([readAdminSessions(), readAdminDiagnostics()]);
      setSessions(nextSessions);
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
                                <button
                                  type="button"
                                  onClick={() => downloadWaiverRecord(booking, session)}
                                  className="rounded-md border border-navy px-4 py-2 text-xs font-black uppercase text-navy transition hover:border-electric hover:text-electric"
                                >
                                  Download Waiver Record
                                </button>
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
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  availabilityStorageKey,
  bookingNotificationEmail,
  bookingsStorageKey,
  blockedDaysStorageKey,
  defaultTrainingSlots,
  getRemainingSpots,
  getTrainingGroup,
  isSlotAvailable,
  normalizeTrainingSlot,
  slotCapacity,
  trainingGroups,
  type BookingRecord,
  type TrainingGroupId,
  type SlotStatus,
  type TrainingSlot
} from "@/lib/booking-data";

const inputClass =
  "field-focus w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400";

function readSlots() {
  if (typeof window === "undefined") {
    return defaultTrainingSlots;
  }

  try {
    const stored = window.localStorage.getItem(availabilityStorageKey);
    return stored ? (JSON.parse(stored) as TrainingSlot[]).map(normalizeTrainingSlot) : defaultTrainingSlots;
  } catch {
    return defaultTrainingSlots;
  }
}

function readBlockedDays() {
  if (typeof window === "undefined") {
    return [] as string[];
  }

  try {
    return JSON.parse(window.localStorage.getItem(blockedDaysStorageKey) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function readBookings() {
  if (typeof window === "undefined") {
    return [] as BookingRecord[];
  }

  try {
    return JSON.parse(window.localStorage.getItem(bookingsStorageKey) ?? "[]") as BookingRecord[];
  } catch {
    return [];
  }
}

function formatDateParts(dateIso: string) {
  const date = new Date(`${dateIso}T00:00:00`);
  return {
    dateLabel: date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
    dayLabel: date.toLocaleDateString("en-US", { weekday: "long" })
  };
}

function formatTime(value: string) {
  const [hourValue, minuteValue] = value.split(":").map(Number);
  const suffix = hourValue >= 12 ? "PM" : "AM";
  const hour = hourValue % 12 || 12;
  return `${hour}:${String(minuteValue).padStart(2, "0")} ${suffix}`;
}

export function AdminAvailability() {
  const [slots, setSlots] = useState<TrainingSlot[]>(defaultTrainingSlots);
  const [blockedDays, setBlockedDays] = useState<string[]>([]);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [newGroupId, setNewGroupId] = useState<TrainingGroupId>(trainingGroups[0].id);
  const [newDate, setNewDate] = useState("2026-06-16");
  const [newTime, setNewTime] = useState("17:00");
  const [newCapacity, setNewCapacity] = useState("6");
  const [newDuration] = useState("60");
  const [blockDate, setBlockDate] = useState("2026-06-18");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const loadedSlots = readSlots();
    const loadedBlockedDays = readBlockedDays();
    setSlots(loadedSlots);
    setBlockedDays(loadedBlockedDays);
    setBookings(readBookings());
    window.localStorage.setItem(availabilityStorageKey, JSON.stringify(loadedSlots));
  }, []);

  const counts = useMemo(
    () => ({
      open: slots.filter((slot) => isSlotAvailable(slot, blockedDays)).length,
      booked: slots.filter((slot) => slot.status !== "blocked" && !blockedDays.includes(slot.dateIso) && getRemainingSpots(slot) === 0).length,
      blocked: slots.filter((slot) => slot.status === "blocked" || blockedDays.includes(slot.dateIso)).length,
      bookings: bookings.length
    }),
    [slots, blockedDays, bookings]
  );

  function saveSlots(nextSlots: TrainingSlot[]) {
    const normalizedSlots = nextSlots.map(normalizeTrainingSlot);
    setSlots(normalizedSlots);
    window.localStorage.setItem(availabilityStorageKey, JSON.stringify(normalizedSlots));
  }

  function saveBlockedDays(nextBlockedDays: string[]) {
    setBlockedDays(nextBlockedDays);
    window.localStorage.setItem(blockedDaysStorageKey, JSON.stringify(nextBlockedDays));
  }

  function addSlot() {
    const normalizedTime = newTime.replace(":", "");
    const id = `${newGroupId}-${newDate}-${normalizedTime}`;

    if (slots.some((slot) => slot.id === id)) {
      setNotice("That date and time already exists.");
      return;
    }

    const labels = formatDateParts(newDate);
    const capacity = Math.min(slotCapacity, Math.max(1, Number(newCapacity) || slotCapacity));
    const duration = 60;
    const nextSlots = [
      ...slots,
      {
        id,
        groupId: newGroupId,
        dateIso: newDate,
        dateLabel: labels.dateLabel,
        dayLabel: labels.dayLabel,
        time: formatTime(newTime),
        duration: `${duration} min`,
        capacity,
        bookedPlayers: 0,
        status: "open" as SlotStatus
      }
    ].sort((a, b) => `${a.dateIso} ${a.time}`.localeCompare(`${b.dateIso} ${b.time}`));

    saveSlots(nextSlots);
    setNotice("Availability added and visible on the booking calendar.");
  }

  function setSlotStatus(slotId: string, status: SlotStatus) {
    saveSlots(
      slots.map((slot) => {
        if (slot.id !== slotId) {
          return slot;
        }

        if (status === "open") {
          return { ...slot, status, bookedPlayers: getRemainingSpots(slot) === 0 ? 0 : slot.bookedPlayers };
        }

        return { ...slot, status };
      })
    );
    setNotice(status === "open" ? "Slot reopened." : `Slot marked ${status}.`);
  }

  function removeSlot(slotId: string) {
    saveSlots(slots.filter((slot) => slot.id !== slotId));
    setNotice("Slot removed from availability.");
  }

  function blockDay() {
    const nextBlockedDays = Array.from(new Set([...blockedDays, blockDate]));
    saveBlockedDays(nextBlockedDays);
    saveSlots(slots.map((slot) => (slot.dateIso === blockDate ? { ...slot, status: "blocked" } : slot)));
    setNotice("Unavailable day blocked and hidden from parent booking.");
  }

  function unblockDay(day: string) {
    saveBlockedDays(blockedDays.filter((blockedDay) => blockedDay !== day));
    saveSlots(
      slots.map((slot) =>
        slot.dateIso === day && slot.status === "blocked"
          ? { ...slot, status: getRemainingSpots(slot) === 0 ? "booked" : "open" }
          : slot
      )
    );
    setNotice("Day reopened.");
  }

  function removeBookedSlots() {
    saveSlots(slots.filter((slot) => slot.status !== "booked" && getRemainingSpots(slot) > 0));
    setNotice("Full sessions removed from the admin list.");
  }

  function resetSchedule() {
    saveSlots(defaultTrainingSlots);
    saveBlockedDays([]);
    setNotice("Schedule cleared. Add new time blocks to publish availability.");
  }

  function refreshBookings() {
    setBookings(readBookings());
    setNotice("Bookings refreshed.");
  }

  return (
    <div className="grid gap-8">
      <section className="panel p-5 sm:p-8">
        <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-start">
          <div>
            <p className="text-sm font-black uppercase text-electric">Admin Availability</p>
            <h2 className="mt-2 text-3xl font-black text-navy">Manage program booking slots.</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Add separate Future Elite and Elite Performance time blocks, then track the six-player capacity for each
              session.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
            {[
              ["Open", counts.open],
              ["Booked", counts.booked],
              ["Blocked", counts.blocked],
              ["Bookings", counts.bookings]
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-slate-200 bg-mist p-4">
                <p className="text-2xl font-black text-navy">{value}</p>
                <p className="text-xs font-black uppercase text-slate-500">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {notice ? <p className="mt-5 rounded-md bg-field/10 p-3 text-sm font-bold text-field">{notice}</p> : null}
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="panel p-5 sm:p-6">
          <h3 className="text-xl font-black text-navy">Add Available Slot</h3>
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
              Time
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
              <input
                className={inputClass}
                type="number"
                min="60"
                max="60"
                value={newDuration}
                readOnly
              />
            </label>
          </div>
          <button
            type="button"
            onClick={addSlot}
            className="mt-5 rounded-md bg-electric px-6 py-3 text-sm font-black uppercase text-white shadow-lg shadow-electric/25"
          >
            Add Slot
          </button>
        </div>

        <div className="panel p-5 sm:p-6">
          <h3 className="text-xl font-black text-navy">Block Unavailable Day</h3>
          <label className="mt-5 grid gap-2 text-sm font-bold text-navy">
            Date
            <input className={inputClass} type="date" value={blockDate} onChange={(event) => setBlockDate(event.target.value)} />
          </label>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={blockDay} className="rounded-md bg-navy px-6 py-3 text-sm font-black uppercase text-white">
              Block Day
            </button>
            <button type="button" onClick={removeBookedSlots} className="rounded-md border border-slate-300 px-6 py-3 text-sm font-black text-navy">
              Remove Booked Slots
            </button>
            <button type="button" onClick={resetSchedule} className="rounded-md border border-slate-300 px-6 py-3 text-sm font-black text-navy">
              Clear Schedule
            </button>
          </div>
        </div>
      </section>

      {blockedDays.length > 0 ? (
        <section className="panel p-5 sm:p-6">
          <h3 className="text-xl font-black text-navy">Blocked Days</h3>
          <div className="mt-4 flex flex-wrap gap-3">
            {blockedDays.map((day) => (
              <button key={day} type="button" onClick={() => unblockDay(day)} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-bold text-navy">
                {formatDateParts(day).dateLabel} - Reopen
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel overflow-hidden">
        <div className="border-b border-slate-200 p-5 sm:p-6">
          <h3 className="text-xl font-black text-navy">Schedule Slots</h3>
          <p className="mt-2 text-sm text-slate-600">Full and blocked sessions stay off the parent booking calendar.</p>
        </div>
        <div className="grid divide-y divide-slate-200">
          {slots.map((slot) => {
            const remainingSpots = getRemainingSpots(slot);
            const statusLabel = blockedDays.includes(slot.dateIso)
              ? "blocked day"
              : remainingSpots === 0
                ? "full"
                : `${remainingSpots} ${remainingSpots === 1 ? "spot" : "spots"} remaining`;

            return (
              <div key={slot.id} className="grid gap-4 p-5 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <p className="text-xs font-black uppercase text-electric">{getTrainingGroup(slot.groupId).name}</p>
                  <p className="font-black text-navy">
                    {slot.dateLabel} at {slot.time}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {slot.duration} - {slot.bookedPlayers}/{slot.capacity} players booked - {statusLabel}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setSlotStatus(slot.id, "open")} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-black text-navy">
                    Open
                  </button>
                  <button type="button" onClick={() => setSlotStatus(slot.id, "blocked")} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-black text-navy">
                    Block
                  </button>
                  <button type="button" onClick={() => removeSlot(slot.id)} className="rounded-md border border-red-200 px-3 py-2 text-xs font-black text-red-700">
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="grid gap-4 border-b border-slate-200 p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
          <div>
            <h3 className="text-xl font-black text-navy">Bookings Dashboard</h3>
            <p className="mt-2 text-sm text-slate-600">Owner notifications are prepared for {bookingNotificationEmail}.</p>
          </div>
          <button type="button" onClick={refreshBookings} className="rounded-md border border-slate-300 px-4 py-2 text-xs font-black text-navy">
            Refresh
          </button>
        </div>
        {bookings.length > 0 ? (
          <div className="grid divide-y divide-slate-200">
            {bookings.map((booking) => (
              <article key={booking.id} className="grid gap-4 p-5 lg:grid-cols-[1fr_1fr]">
                <div>
                  <p className="text-xs font-black uppercase text-electric">{booking.programName}</p>
                  <h4 className="mt-1 text-lg font-black text-navy">{booking.playerName}</h4>
                  <p className="mt-1 text-sm text-slate-600">
                    {booking.sessionDate} at {booking.sessionTime} - {booking.players} player(s)
                  </p>
                  <p className="mt-1 text-sm text-slate-600">Payment: {booking.paymentStatus}</p>
                </div>
                <div className="grid gap-1 text-sm text-slate-600">
                  <p><span className="font-black text-navy">Parent:</span> {booking.parentName}</p>
                  <p><span className="font-black text-navy">Phone:</span> {booking.phone}</p>
                  <p><span className="font-black text-navy">Email:</span> {booking.email}</p>
                  <p><span className="font-black text-navy">Emergency:</span> {booking.emergencyName} - {booking.emergencyPhone}</p>
                  <p><span className="font-black text-navy">Notes:</span> {booking.notes || "None"}</p>
                  <p><span className="font-black text-navy">Medical:</span> {booking.medicalNotes || "None"}</p>
                  <p><span className="font-black text-navy">Email Status:</span> {booking.notificationStatus}</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="p-5 sm:p-6">
            <p className="rounded-lg border border-slate-200 bg-mist p-5 text-sm font-bold text-slate-600">
              No bookings yet.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

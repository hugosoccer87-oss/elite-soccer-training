"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarIcon, ShieldIcon } from "./Icons";
import { SignaturePad } from "./SignaturePad";
import {
  availabilityStorageKey,
  bookingNotificationEmail,
  bookingsStorageKey,
  blockedDaysStorageKey,
  defaultTrainingSlots,
  getRemainingSpots,
  getTrainingGroup,
  isAgeInGroup,
  isSlotAvailable,
  normalizeTrainingSlot,
  slotCapacity,
  trainingGroups,
  type BookingRecord,
  type CalendarSyncStatus,
  type TrainingGroupId,
  type TrainingSlot
} from "@/lib/booking-data";
import { business } from "@/lib/site-data";

const inputClass =
  "field-focus w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400";

const stepLabels = ["Program", "Session", "Details", "Waiver", "Payment", "Confirmed"];
const waiverVersion = "EST-CA-2026-05";

type BookingStep = "program" | "session" | "details" | "waiver" | "payment" | "confirmed";

type BookingFields = {
  parentName: string;
  playerName: string;
  playerAge: string;
  phone: string;
  email: string;
  players: string;
  notes: string;
  medicalNotes: string;
  emergencyName: string;
  emergencyPhone: string;
  waiverAgreement: boolean;
  mediaConsent: "" | "yes" | "no";
  guardianSignature: string;
  cardName: string;
  cardNumber: string;
  cardExpiry: string;
  cardCvc: string;
  postalCode: string;
};

const initialFields: BookingFields = {
  parentName: "",
  playerName: "",
  playerAge: "",
  phone: "",
  email: "",
  players: "1",
  notes: "",
  medicalNotes: "",
  emergencyName: "",
  emergencyPhone: "",
  waiverAgreement: false,
  mediaConsent: "",
  guardianSignature: "",
  cardName: "",
  cardNumber: "",
  cardExpiry: "",
  cardCvc: "",
  postalCode: ""
};

type BookingSubmissionResult = {
  notificationStatus: BookingRecord["notificationStatus"];
  calendarStatus: CalendarSyncStatus;
  calendarMessage?: string;
  calendarEventId?: string;
  calendarEventUrl?: string;
  error?: string;
};

function readSlots() {
  if (typeof window === "undefined") {
    return defaultTrainingSlots;
  }

  const stored = window.localStorage.getItem(availabilityStorageKey);

  if (!stored) {
    window.localStorage.setItem(availabilityStorageKey, JSON.stringify(defaultTrainingSlots));
    return defaultTrainingSlots;
  }

  try {
    const normalizedSlots = (JSON.parse(stored) as TrainingSlot[]).map(normalizeTrainingSlot);
    window.localStorage.setItem(availabilityStorageKey, JSON.stringify(normalizedSlots));
    return normalizedSlots;
  } catch {
    window.localStorage.setItem(availabilityStorageKey, JSON.stringify(defaultTrainingSlots));
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

function saveSlots(nextSlots: TrainingSlot[]) {
  const normalizedSlots = nextSlots.map(normalizeTrainingSlot);
  window.localStorage.setItem(availabilityStorageKey, JSON.stringify(normalizedSlots));
  return normalizedSlots;
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

function saveBooking(booking: BookingRecord) {
  const nextBookings = [booking, ...readBookings()];
  window.localStorage.setItem(bookingsStorageKey, JSON.stringify(nextBookings));
  return nextBookings;
}

async function sendBookingNotifications(booking: BookingRecord) {
  try {
    const response = await fetch("/api/bookings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(booking)
    });
    const result = (await response.json()) as Partial<BookingSubmissionResult>;

    if (!response.ok) {
      return {
        notificationStatus: result.notificationStatus ?? "Ready",
        calendarStatus: result.calendarStatus ?? "Failed",
        calendarMessage: result.calendarMessage,
        error: result.error ?? "That session could not be confirmed."
      } satisfies BookingSubmissionResult;
    }

    return {
      notificationStatus: result.notificationStatus ?? "Ready",
      calendarStatus: result.calendarStatus ?? "Google Calendar not configured",
      calendarMessage: result.calendarMessage,
      calendarEventId: result.calendarEventId,
      calendarEventUrl: result.calendarEventUrl
    } satisfies BookingSubmissionResult;
  } catch {
    return {
      notificationStatus: "Email service not configured",
      calendarStatus: "Failed",
      calendarMessage: "The booking server could not be reached. Please try again."
    } satisfies BookingSubmissionResult;
  }
}

async function readSyncedSlots() {
  try {
    const response = await fetch("/api/google-calendar/availability", {
      cache: "no-store"
    });

    if (!response.ok) {
      return null;
    }

    const result = (await response.json()) as { status?: CalendarSyncStatus; slots?: TrainingSlot[] };

    if (result.status === "Synced") {
      return (result.slots ?? []).map(normalizeTrainingSlot);
    }
  } catch {
    return null;
  }

  return null;
}

function spotsLabel(count: number) {
  return `${count} ${count === 1 ? "spot" : "spots"} remaining`;
}

const waiverSections = [
  {
    title: "Assumption of Risk",
    copy:
      "I understand that Elite Soccer Training activities include small group soccer training, camps, clinics, conditioning, and related soccer activities. Participation involves inherent risks, including falls, collisions, physical contact, weather conditions, field conditions, equipment-related injuries, sprains, fractures, concussions, serious injury, or death."
  },
  {
    title: "Release of Liability",
    copy:
      "On behalf of myself, the participant, and our family or representatives, I release and hold harmless Elite Soccer Training, its coaches, trainers, staff, contractors, affiliates, and facility partners from claims, demands, damages, or losses related to participation, except to the extent caused by gross negligence or intentional misconduct."
  },
  {
    title: "Medical Authorization",
    copy:
      "I confirm the participant is physically able to take part in soccer training. If illness or injury occurs and I cannot be reached, I authorize reasonable emergency medical care and understand I am responsible for medical costs connected to that care."
  },
  {
    title: "Photo & Media Consent",
    copy:
      "I may allow Elite Soccer Training to use photos or videos from training for its website, social media, marketing, and promotional materials. I can decline media consent below while still completing registration."
  },
  {
    title: "Weather, Scheduling, Refunds & Cancellations",
    copy:
      "Sessions may continue during normal weather. Elite Soccer Training may cancel, delay, or reschedule training when weather, heat, air quality, lightning, or field conditions make participation unsafe. Payments are generally non-refundable. Missed sessions, no-shows, or late cancellations may not qualify for makeup sessions, credits, or refunds."
  },
  {
    title: "Parent/Guardian Responsibility",
    copy:
      "For participants under 18, a parent or legal guardian must complete this waiver. The parent or guardian remains responsible for the participant before drop-off, after the session ends, and during any time outside active coach supervision."
  },
  {
    title: "Governing Law",
    copy: "This agreement is governed by the laws of the State of California."
  },
  {
    title: "Electronic Signature Consent",
    copy:
      "By checking the agreement box and typing my name, I consent to complete this waiver electronically and agree that my electronic signature has the same effect as a handwritten signature for this registration."
  }
];

export function BookingForm() {
  const [step, setStep] = useState<BookingStep>("program");
  const [slots, setSlots] = useState<TrainingSlot[]>(defaultTrainingSlots);
  const [blockedDays, setBlockedDays] = useState<string[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<TrainingGroupId>(trainingGroups[0].id);
  const [selectedDate, setSelectedDate] = useState(
    defaultTrainingSlots.find((slot) => slot.groupId === trainingGroups[0].id)?.dateIso ?? ""
  );
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [confirmedSlot, setConfirmedSlot] = useState<TrainingSlot | null>(null);
  const [fields, setFields] = useState<BookingFields>(initialFields);
  const [bookingCode, setBookingCode] = useState("");
  const [notificationStatus, setNotificationStatus] = useState<BookingRecord["notificationStatus"]>("Ready");
  const [confirmedBooking, setConfirmedBooking] = useState<BookingRecord | null>(null);
  const [calendarStatus, setCalendarStatus] = useState<CalendarSyncStatus>("Ready");
  const [calendarMessage, setCalendarMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const currentSlots = readSlots();
    const currentBlockedDays = readBlockedDays();
    const firstOpenSlot = currentSlots.find(
      (slot) => slot.groupId === selectedGroupId && isSlotAvailable(slot, currentBlockedDays)
    );

    let active = true;

    setSlots(currentSlots);
    setBlockedDays(currentBlockedDays);
    setSelectedDate(firstOpenSlot?.dateIso ?? "");

    readSyncedSlots().then((syncedSlots) => {
      if (!active || !syncedSlots) {
        return;
      }

      const normalizedSlots = saveSlots(syncedSlots);
      const nextBlockedDays = readBlockedDays();
      const nextFirstOpenSlot = normalizedSlots.find(
        (slot) => slot.groupId === selectedGroupId && isSlotAvailable(slot, nextBlockedDays)
      );

      setSlots(normalizedSlots);
      setBlockedDays(nextBlockedDays);
      setSelectedDate(nextFirstOpenSlot?.dateIso ?? "");
      setSelectedSlotId("");
    });

    return () => {
      active = false;
    };
  }, [selectedGroupId]);

  const openSlots = useMemo(
    () => slots.filter((slot) => slot.groupId === selectedGroupId && isSlotAvailable(slot, blockedDays)),
    [slots, blockedDays, selectedGroupId]
  );

  const dates = useMemo(() => {
    const uniqueDates = new Map<string, TrainingSlot>();
    openSlots.forEach((slot) => {
      if (!uniqueDates.has(slot.dateIso)) {
        uniqueDates.set(slot.dateIso, slot);
      }
    });
    return Array.from(uniqueDates.values());
  }, [openSlots]);

  const selectedSlot = openSlots.find((slot) => slot.id === selectedSlotId);
  const selectedGroup = getTrainingGroup(selectedGroupId);
  const displaySlot = step === "confirmed" ? confirmedSlot : selectedSlot;
  const dateSlots = openSlots.filter((slot) => slot.dateIso === selectedDate);
  const activeStepIndex = ["program", "session", "details", "waiver", "payment", "confirmed"].findIndex((label) => label === step);
  const selectedRemainingSpots = selectedSlot ? getRemainingSpots(selectedSlot) : slotCapacity;
  const playerOptions = Array.from({ length: Math.max(1, Math.min(slotCapacity, selectedRemainingSpots)) }, (_, index) => index + 1);
  const calendarSummary =
    calendarStatus === "Created"
      ? "Google Calendar event created"
      : calendarStatus === "Synced"
        ? "Google Calendar availability updated"
        : calendarStatus === "Failed"
          ? "Google Calendar needs attention"
          : calendarStatus === "Google Calendar not configured"
            ? "Google Calendar ready to connect"
            : "Google Calendar ready";

  function setField(field: keyof BookingFields, value: string | boolean) {
    setFields((current) => ({ ...current, [field]: value }));
    setError("");
  }

  function selectGroup(groupId: TrainingGroupId) {
    const nextGroupSlot = slots.find((slot) => slot.groupId === groupId && isSlotAvailable(slot, blockedDays));

    setSelectedGroupId(groupId);
    setSelectedSlotId("");
    setSelectedDate(nextGroupSlot?.dateIso ?? "");
    setError("");
  }

  function requireSchedule() {
    if (!selectedSlot) {
      setError("Choose an available training slot before continuing.");
      return false;
    }
    return true;
  }

  function requireDetails() {
    const needed = [fields.parentName, fields.playerName, fields.playerAge, fields.phone, fields.email, fields.players];
    const playerCount = Number(fields.players);

    if (needed.some((value) => String(value).trim() === "")) {
      setError("Complete the required parent, player, and training details before continuing.");
      return false;
    }

    if (!selectedSlot || !Number.isInteger(playerCount) || playerCount < 1 || playerCount > getRemainingSpots(selectedSlot)) {
      setError(`This session has ${spotsLabel(selectedRemainingSpots)}. Adjust the player count before continuing.`);
      return false;
    }

    const playerAge = Number(fields.playerAge);

    if (!Number.isInteger(playerAge) || !isAgeInGroup(playerAge, selectedGroupId)) {
      setError(`${selectedGroup.name} is for ${selectedGroup.ages}. Choose the correct program before continuing.`);
      return false;
    }

    return true;
  }

  function requireWaiver() {
    const needed = [fields.emergencyName, fields.emergencyPhone, fields.medicalNotes, fields.guardianSignature];

    if (needed.some((value) => value.trim() === "") || !fields.mediaConsent || !fields.waiverAgreement) {
      setError("Complete the waiver, media consent, emergency contact, medical information, and parent signature before payment.");
      return false;
    }

    return true;
  }

  async function confirmPayment() {
    if (!selectedSlot) {
      setStep("session");
      setError("That slot is no longer available. Please choose another time.");
      return;
    }

    const requestedPlayers = Number(fields.players);
    const latestSlots = readSlots();
    const latestBlockedDays = readBlockedDays();
    const latestSlot = latestSlots.find((slot) => slot.id === selectedSlot.id);
    const latestRemainingSpots = latestSlot ? getRemainingSpots(latestSlot) : 0;

    if (
      !latestSlot ||
      latestSlot.groupId !== selectedGroupId ||
      !isSlotAvailable(latestSlot, latestBlockedDays) ||
      !Number.isInteger(requestedPlayers) ||
      requestedPlayers < 1 ||
      requestedPlayers > latestRemainingSpots
    ) {
      setSlots(readSlots());
      setStep("session");
      setError("That session no longer has enough spots. Please choose another available time.");
      return;
    }

    const updatedSlot: TrainingSlot = {
      ...latestSlot,
      bookedPlayers: latestSlot.bookedPlayers + requestedPlayers,
      status: latestSlot.bookedPlayers + requestedPlayers >= latestSlot.capacity ? "booked" : "open"
    };
    const nextSlots = latestSlots.map((slot) => (slot.id === selectedSlot.id ? updatedSlot : slot));
    const bookingTimestamp = new Date().toISOString();
    const booking: BookingRecord = {
      id: `EST-${selectedSlot.id.replaceAll("-", "").slice(-8).toUpperCase()}-${Date.now().toString().slice(-5)}`,
      createdAt: bookingTimestamp,
      parentName: fields.parentName,
      playerName: fields.playerName,
      playerAge: fields.playerAge,
      phone: fields.phone,
      email: fields.email,
      players: fields.players,
      notes: fields.notes,
      medicalNotes: fields.medicalNotes,
      emergencyName: fields.emergencyName,
      emergencyPhone: fields.emergencyPhone,
      guardianSignature: fields.guardianSignature,
      waiverAccepted: fields.waiverAgreement,
      waiverAcceptedAt: bookingTimestamp,
      waiverVersion,
      mediaConsent: fields.mediaConsent === "yes" ? "Granted" : "Declined",
      programId: selectedGroupId,
      programName: selectedGroup.name,
      sessionId: selectedSlot.id,
      sessionDateIso: latestSlot.dateIso,
      sessionDate: latestSlot.dateLabel,
      sessionTime: latestSlot.time,
      sessionDurationMinutes: 60,
      sessionCalendarEventId: latestSlot.calendarEventId,
      paymentStatus: "Paid",
      notificationStatus: "Ready",
      calendarStatus: "Ready"
    };

    setIsSubmitting(true);
    setError("");

    const submission = await sendBookingNotifications(booking);

    setIsSubmitting(false);

    if (submission.calendarStatus === "Unavailable") {
      setSlots(readSlots());
      setStep("session");
      setError(submission.error ?? "That session no longer has enough spots. Please choose another available time.");
      return;
    }

    if (submission.calendarStatus === "Failed" || submission.calendarStatus === "Google Calendar not configured") {
      setSlots(readSlots());
      setError(
        submission.error ??
          submission.calendarMessage ??
          "Google Calendar event could not be created. The booking was not confirmed."
      );
      return;
    }

    const updatedBooking: BookingRecord = {
      ...booking,
      notificationStatus: submission.notificationStatus,
      calendarStatus: submission.calendarStatus,
      calendarMessage: submission.calendarMessage,
      calendarEventId: submission.calendarEventId,
      calendarEventUrl: submission.calendarEventUrl
    };

    const savedSlots = saveSlots(nextSlots);
    setSlots(savedSlots);
    setBlockedDays(latestBlockedDays);
    setConfirmedSlot(updatedSlot);
    saveBooking(updatedBooking);
    setConfirmedBooking(updatedBooking);
    setNotificationStatus(updatedBooking.notificationStatus);
    setCalendarStatus(updatedBooking.calendarStatus);
    setCalendarMessage(updatedBooking.calendarMessage ?? "");
    setBookingCode(booking.id);
    setStep("confirmed");
  }

  return (
    <div className="grid gap-6">
      <div className="panel overflow-hidden">
        <div className="border-b border-slate-200 bg-navy p-5 text-white sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black uppercase text-electric">Booking</p>
              <h2 className="mt-2 text-2xl font-black leading-tight sm:text-3xl">Select your program.</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                60-minute small group soccer training for 1-6 players.
              </p>
            </div>
            {displaySlot ? (
              <div className="rounded-lg border border-white/15 bg-white/10 p-4 text-sm">
                <p className="font-black text-white">Selected Session</p>
                <p className="mt-1 text-slate-200">
                  {displaySlot.dateLabel} at {displaySlot.time}
                </p>
                <p className="mt-1 text-slate-300">{displaySlot.duration}</p>
              </div>
            ) : (
              <div className="rounded-lg border border-white/15 bg-white/10 p-4 text-sm">
                <p className="font-black text-white">{selectedGroup.name}</p>
                <p className="mt-1 text-slate-300">{selectedGroup.ages}</p>
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-3 border-b border-slate-200 bg-white p-4 sm:grid-cols-6">
          {stepLabels.map((label, index) => (
            <div
              key={label}
              className={`rounded-md border px-3 py-3 text-xs font-black uppercase ${
                index <= activeStepIndex
                  ? "border-electric bg-electric text-white"
                  : "border-slate-200 bg-slate-50 text-slate-500"
              }`}
            >
              {String(index + 1).padStart(2, "0")} {label}
            </div>
          ))}
        </div>

        {error ? (
          <div className="border-b border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-700">{error}</div>
        ) : null}

        {step === "program" ? (
          <section className="grid gap-6 p-5 sm:p-8">
            <div>
              <p className="text-sm font-black uppercase text-electric">Program</p>
              <h3 className="mt-2 text-2xl font-black text-navy">Choose the right age group</h3>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {trainingGroups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => selectGroup(group.id)}
                  className={`rounded-lg border p-5 text-left transition ${
                    selectedGroupId === group.id
                      ? "border-navy bg-navy text-white shadow-xl shadow-navy/20"
                      : "border-slate-200 bg-white text-navy hover:border-electric"
                  }`}
                >
                  <span className="text-xs font-black uppercase text-electric">{group.ages}</span>
                  <span className="mt-2 block text-2xl font-black">{group.name}</span>
                  <span className="mt-4 grid gap-2 text-sm font-semibold opacity-85">
                    {group.focus.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setStep("session")}
              className="inline-flex w-full items-center justify-center rounded-md bg-electric px-6 py-4 text-sm font-black uppercase text-white shadow-lg shadow-electric/25 transition hover:bg-blue-500 sm:w-fit"
            >
              Continue To Sessions
            </button>
          </section>
        ) : null}

        {step === "session" ? (
          <section className="grid gap-6 p-5 sm:p-8">
            <div>
              <p className="text-sm font-black uppercase text-electric">Availability</p>
              <h3 className="mt-2 text-2xl font-black text-navy">{selectedGroup.name}</h3>
              <p className="mt-2 text-sm font-bold text-slate-600">{selectedGroup.ages}</p>
            </div>

            {dates.length > 0 ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  {dates.map((slot) => (
                    <button
                      key={slot.dateIso}
                      type="button"
                      onClick={() => {
                        setSelectedDate(slot.dateIso);
                        setSelectedSlotId("");
                      }}
                      className={`rounded-lg border p-4 text-left transition ${
                        selectedDate === slot.dateIso
                          ? "border-electric bg-electric text-white shadow-lg shadow-electric/20"
                          : "border-slate-200 bg-white text-navy hover:border-electric"
                      }`}
                    >
                      <span className="block text-xs font-black uppercase opacity-80">{slot.dayLabel}</span>
                      <span className="mt-1 block text-lg font-black">{slot.dateLabel}</span>
                    </button>
                  ))}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {dateSlots.map((slot) => (
                    <button
                      key={slot.id}
                      type="button"
                      onClick={() => {
                        setSelectedSlotId(slot.id);
                        setFields((current) => ({
                          ...current,
                          players: String(Math.min(Number(current.players) || 1, getRemainingSpots(slot)))
                        }));
                      }}
                      className={`rounded-lg border p-4 text-left transition ${
                        selectedSlotId === slot.id
                          ? "border-navy bg-navy text-white shadow-xl shadow-navy/20"
                          : "border-slate-200 bg-white text-navy hover:border-electric"
                      }`}
                    >
                      <span className="block text-xl font-black">{slot.time}</span>
                      <span className="mt-1 block text-sm font-semibold opacity-80">{slot.duration} session</span>
                      <span className="mt-2 block text-xs font-black uppercase text-electric">{spotsLabel(getRemainingSpots(slot))}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-mist p-6">
                <p className="font-black text-navy">No open training slots are currently available.</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Check back soon or call <a className="font-black underline" href={business.phoneHref}>{business.phone}</a> for schedule help.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                if (requireSchedule()) {
                  setStep("details");
                }
              }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-electric px-6 py-4 text-sm font-black uppercase text-white shadow-lg shadow-electric/25 transition hover:bg-blue-500 sm:w-fit"
            >
              <CalendarIcon className="h-5 w-5" />
              Continue To Details
            </button>
            <button type="button" onClick={() => setStep("program")} className="w-fit rounded-md border border-slate-300 px-6 py-3 text-sm font-black text-navy">
              Back To Programs
            </button>
          </section>
        ) : null}

        {step === "details" ? (
          <section className="grid gap-5 p-5 sm:grid-cols-2 sm:p-8">
            <label className="grid gap-2 text-sm font-bold text-navy">
              Parent/Guardian Name
              <input className={inputClass} value={fields.parentName} onChange={(event) => setField("parentName", event.target.value)} />
            </label>
            <label className="grid gap-2 text-sm font-bold text-navy">
              Player Name
              <input className={inputClass} value={fields.playerName} onChange={(event) => setField("playerName", event.target.value)} />
            </label>
            <label className="grid gap-2 text-sm font-bold text-navy">
              Player Age
              <input className={inputClass} inputMode="numeric" value={fields.playerAge} onChange={(event) => setField("playerAge", event.target.value)} />
            </label>
            <label className="grid gap-2 text-sm font-bold text-navy">
              Phone Number
              <input className={inputClass} type="tel" value={fields.phone} onChange={(event) => setField("phone", event.target.value)} />
            </label>
            <label className="grid gap-2 text-sm font-bold text-navy">
              Email
              <input className={inputClass} type="email" value={fields.email} onChange={(event) => setField("email", event.target.value)} />
            </label>
            <label className="grid gap-2 text-sm font-bold text-navy">
              Number of Players Attending
              <select className={inputClass} value={fields.players} onChange={(event) => setField("players", event.target.value)}>
                {playerOptions.map((count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </select>
            </label>
            {selectedSlot ? (
              <p className="rounded-md bg-mist px-4 py-3 text-sm font-bold text-slate-600 sm:col-span-2">
                {spotsLabel(selectedRemainingSpots)} for {selectedSlot.dateLabel} at {selectedSlot.time}.
              </p>
            ) : null}
            <label className="grid gap-2 text-sm font-bold text-navy sm:col-span-2">
              Notes
              <textarea
                className={`${inputClass} min-h-24 resize-y`}
                value={fields.notes}
                onChange={(event) => setField("notes", event.target.value)}
                placeholder="Share player goals, scheduling details, or anything helpful for Coach Hugo"
              />
            </label>
            <label className="grid gap-2 text-sm font-bold text-navy sm:col-span-2">
              Medical Notes/Injuries
              <textarea
                className={`${inputClass} min-h-28 resize-y`}
                value={fields.medicalNotes}
                onChange={(event) => setField("medicalNotes", event.target.value)}
                placeholder="Share anything Coach Hugo should know before training"
              />
            </label>
            <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row">
              <button type="button" onClick={() => setStep("session")} className="rounded-md border border-slate-300 px-6 py-3 text-sm font-black text-navy">
                Back
              </button>
              <button
                type="button"
                onClick={() => {
                  if (requireDetails()) {
                    setStep("waiver");
                  }
                }}
                className="rounded-md bg-electric px-6 py-3 text-sm font-black uppercase text-white shadow-lg shadow-electric/25"
              >
                Continue To Waiver
              </button>
            </div>
          </section>
        ) : null}

        {step === "waiver" ? (
          <section className="grid gap-5 p-5 sm:p-8">
            <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <header className="border-b border-slate-200 bg-mist px-5 py-6 sm:px-8">
                <p className="text-sm font-black uppercase text-electric">Waiver Required</p>
                <h3 className="mt-2 text-2xl font-black leading-tight text-navy sm:text-3xl">
                  Elite Soccer Training Participation Waiver & Release of Liability
                </h3>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                  Review this document, choose media consent, and sign electronically before payment.
                </p>
              </header>

              <div className="divide-y divide-slate-200 px-5 py-2 sm:px-8">
                <section className="py-6">
                  <h4 className="text-lg font-black text-navy">1. Participant Information</h4>
                  <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
                    {[
                      ["Participant Name", fields.playerName || "Complete player details"],
                      ["Parent/Guardian Name", fields.parentName || "Complete parent details"],
                      ["Phone Number", fields.phone || "Complete phone number"],
                      ["Email", fields.email || "Complete email address"]
                    ].map(([label, value]) => (
                      <div key={label} className="border-b border-slate-200 pb-3">
                        <dt className="text-xs font-black uppercase text-slate-500">{label}</dt>
                        <dd className="mt-1 text-sm font-bold text-navy">{value}</dd>
                      </div>
                    ))}
                  </dl>

                  <div className="mt-5 grid gap-5 sm:grid-cols-2">
                    <label className="grid gap-2 text-sm font-bold text-navy">
                      Emergency Contact Name
                      <input className={inputClass} value={fields.emergencyName} onChange={(event) => setField("emergencyName", event.target.value)} />
                    </label>
                    <label className="grid gap-2 text-sm font-bold text-navy">
                      Emergency Contact Phone
                      <input className={inputClass} type="tel" value={fields.emergencyPhone} onChange={(event) => setField("emergencyPhone", event.target.value)} />
                    </label>
                  </div>

                  <label className="mt-5 grid gap-2 text-sm font-bold text-navy">
                    Medical Conditions / Allergies
                    <textarea
                      className={`${inputClass} min-h-24 resize-y`}
                      value={fields.medicalNotes}
                      onChange={(event) => setField("medicalNotes", event.target.value)}
                      placeholder="List medical conditions, allergies, injuries, or type None"
                    />
                  </label>
                </section>

                {waiverSections.map((section, index) => (
                  <section key={section.title} className="py-6">
                    <h4 className="text-lg font-black text-navy">
                      {index + 2}. {section.title}
                    </h4>
                    <p className="mt-3 text-sm leading-7 text-slate-700">{section.copy}</p>
                  </section>
                ))}

                <section className="py-6">
                  <h4 className="text-lg font-black text-navy">Media Consent Selection</h4>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {[
                      ["yes", "Yes, media use is approved"],
                      ["no", "No, media consent is declined"]
                    ].map(([value, label]) => (
                      <label
                        key={value}
                        className={`flex items-center gap-3 rounded-md border px-4 py-3 text-sm font-black transition ${
                          fields.mediaConsent === value
                            ? "border-electric bg-electric text-white"
                            : "border-slate-300 bg-white text-navy"
                        }`}
                      >
                        <input
                          className="h-4 w-4 border-slate-300"
                          type="radio"
                          name="mediaConsent"
                          checked={fields.mediaConsent === value}
                          onChange={() => setField("mediaConsent", value)}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </section>

                <section className="py-6">
                  <h4 className="text-lg font-black text-navy">Electronic Agreement & Signature</h4>
                  <label className="mt-4 flex items-start gap-3 rounded-md border border-slate-300 bg-mist p-4 text-sm font-semibold leading-6 text-slate-700">
                    <input
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-electric"
                      checked={fields.waiverAgreement}
                      type="checkbox"
                      onChange={(event) => setField("waiverAgreement", event.target.checked)}
                    />
                    <span>
                      I have read and understand the Elite Soccer Training waiver, including assumption of risk, release
                      of liability, medical authorization, media consent selection, cancellation policy,
                      parent/guardian responsibility, California governing law, and electronic signature consent.
                    </span>
                  </label>

                  <label className="mt-5 grid gap-2 text-sm font-bold text-navy">
                    Parent/Guardian Digital Signature
                    <input
                      className={inputClass}
                      value={fields.guardianSignature}
                      onChange={(event) => setField("guardianSignature", event.target.value)}
                      placeholder="Type parent/guardian full legal name"
                    />
                  </label>

                  <div className="mt-5 grid gap-2 text-sm font-bold text-navy">
                    Optional Drawn Signature
                    <SignaturePad />
                  </div>

                  <div className="mt-5 grid gap-2 border-t border-slate-200 pt-4 text-xs font-bold uppercase text-slate-500 sm:grid-cols-2">
                    <p>Waiver version {waiverVersion}</p>
                    <p>Date / Timestamp: saved automatically when payment is submitted</p>
                  </div>
                </section>
              </div>
            </article>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={() => setStep("details")} className="rounded-md border border-slate-300 px-6 py-3 text-sm font-black text-navy">
                Back
              </button>
              <button
                type="button"
                onClick={() => {
                  if (requireWaiver()) {
                    setStep("payment");
                  }
                }}
                className="rounded-md bg-electric px-6 py-3 text-sm font-black uppercase text-white shadow-lg shadow-electric/25"
              >
                Continue To Payment
              </button>
            </div>
          </section>
        ) : null}

        {step === "payment" ? (
          <section className="grid gap-6 p-5 sm:p-8 lg:grid-cols-[0.9fr_1.1fr]">
            <aside className="rounded-lg border border-slate-200 bg-mist p-5">
              <ShieldIcon className="h-9 w-9 text-electric" />
              <p className="mt-4 text-sm font-black uppercase text-electric">Stripe Ready</p>
              <h3 className="mt-2 text-2xl font-black text-navy">Complete payment to confirm.</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Credit/debit card, Apple Pay, and Google Pay are ready for online checkout.
              </p>
              {selectedSlot ? (
                <div className="mt-5 rounded-md bg-white p-4 text-sm text-slate-700">
                  <p className="font-black text-navy">{selectedSlot.dateLabel} at {selectedSlot.time}</p>
                  <p>{fields.players} player(s) attending</p>
                  <p>{selectedGroup.name}</p>
                </div>
              ) : null}
            </aside>

            <div className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5" data-stripe-ready="true">
              <button type="button" className="rounded-md bg-black px-5 py-3 text-sm font-black text-white">Pay with Apple Pay</button>
              <button type="button" className="rounded-md border border-slate-300 px-5 py-3 text-sm font-black text-navy">Pay with Google Pay</button>
              <div className="grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-bold text-navy sm:col-span-2">
                  Name on Card
                  <input className={inputClass} value={fields.cardName} onChange={(event) => setField("cardName", event.target.value)} />
                </label>
                <label className="grid gap-2 text-sm font-bold text-navy sm:col-span-2">
                  Card Number
                  <input className={inputClass} inputMode="numeric" value={fields.cardNumber} onChange={(event) => setField("cardNumber", event.target.value)} placeholder="4242 4242 4242 4242" />
                </label>
                <label className="grid gap-2 text-sm font-bold text-navy">
                  Expiration
                  <input className={inputClass} value={fields.cardExpiry} onChange={(event) => setField("cardExpiry", event.target.value)} placeholder="MM/YY" />
                </label>
                <label className="grid gap-2 text-sm font-bold text-navy">
                  CVC
                  <input className={inputClass} inputMode="numeric" value={fields.cardCvc} onChange={(event) => setField("cardCvc", event.target.value)} />
                </label>
                <label className="grid gap-2 text-sm font-bold text-navy sm:col-span-2">
                  ZIP / Postal Code
                  <input className={inputClass} value={fields.postalCode} onChange={(event) => setField("postalCode", event.target.value)} />
                </label>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={() => setStep("waiver")} className="rounded-md border border-slate-300 px-6 py-3 text-sm font-black text-navy">
                  Back
                </button>
                <button
                  type="button"
                  onClick={confirmPayment}
                  disabled={isSubmitting}
                  className="rounded-md bg-electric px-6 py-3 text-sm font-black uppercase text-white shadow-lg shadow-electric/25 disabled:cursor-wait disabled:opacity-70"
                >
                  {isSubmitting ? "Confirming..." : "Pay And Confirm Session"}
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {step === "confirmed" ? (
          <section className="grid gap-6 p-5 sm:p-8">
            <div className="rounded-lg border border-field/30 bg-field/10 p-6">
              <p className="text-sm font-black uppercase text-field">Session Confirmed</p>
              <h3 className="mt-2 text-3xl font-black text-navy">Your small group session is confirmed.</h3>
              <p className="mt-3 text-sm leading-6 text-slate-700">
                Confirmation code: <span className="font-black">{bookingCode}</span>
              </p>
              {confirmedSlot ? (
                <p className="mt-1 text-sm leading-6 text-slate-700">
                  {confirmedSlot.dateLabel} at {confirmedSlot.time} in {business.location}
                </p>
              ) : null}
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              {[
                "Payment successful",
                calendarSummary,
                notificationStatus === "Sent"
                  ? `Parent confirmation sent to ${fields.email || "parent email"}`
                  : `Parent confirmation ready for ${fields.email || "parent email"}`,
                notificationStatus === "Sent"
                  ? `Coach notification sent to ${bookingNotificationEmail}`
                  : `Coach notification ready for ${bookingNotificationEmail}`
              ].map((item) => (
                <div key={item} className="rounded-lg border border-slate-200 bg-white p-5">
                  <p className="text-sm font-black text-navy">{item}</p>
                  <p className="mt-2 text-xs font-bold uppercase text-field">
                    {item.includes("Google Calendar") && calendarStatus === "Google Calendar not configured"
                      ? "Calendar Setup Needed"
                      : item.includes("Google Calendar") && calendarStatus === "Failed"
                        ? "Check Calendar"
                      : notificationStatus !== "Sent" && item !== "Payment successful" && !item.includes("Google Calendar")
                        ? "Email Setup Needed"
                        : "Complete"}
                  </p>
                </div>
              ))}
            </div>
            {confirmedBooking ? (
              <div className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5">
                <p className="text-sm font-black uppercase text-electric">Confirmation Email UI</p>
                <h4 className="text-2xl font-black text-navy">Session Confirmed</h4>
                <p className="text-sm leading-6 text-slate-600">
                  {fields.parentName || "Parent"}, your {confirmedBooking.programName} session for {fields.playerName || "player"} is confirmed for{" "}
                  {confirmedBooking.sessionDate} at {confirmedBooking.sessionTime}. Payment status: {confirmedBooking.paymentStatus}.
                </p>
                <p className="text-sm leading-6 text-slate-600">
                  Waiver accepted electronically on {new Date(confirmedBooking.waiverAcceptedAt).toLocaleString("en-US")}. Media consent:{" "}
                  {confirmedBooking.mediaConsent}.
                </p>
                {confirmedBooking.calendarEventUrl ? (
                  <a className="text-sm font-black text-electric underline" href={confirmedBooking.calendarEventUrl}>
                    View Google Calendar event
                  </a>
                ) : null}
                <p className="text-sm font-bold text-slate-600">Reminder notification scheduled.</p>
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setFields(initialFields);
                setSelectedSlotId("");
                setConfirmedSlot(null);
                setConfirmedBooking(null);
                setNotificationStatus("Ready");
                setCalendarStatus("Ready");
                setBookingCode("");
                setStep("program");
              }}
              className="w-fit rounded-md border border-navy px-6 py-3 text-sm font-black text-navy"
            >
              Book Another Session
            </button>
          </section>
        ) : null}
      </div>
    </div>
  );
}

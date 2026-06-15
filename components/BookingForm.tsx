"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarIcon, ShieldIcon } from "./Icons";
import { SignaturePad } from "./SignaturePad";
import { SpecialRequestForm } from "./SpecialRequestForm";
import {
  getTrainingGroup,
  isAgeInGroup,
  slotCapacity,
  trainingGroups,
  type BookingRecord,
  type TrainingGroupId
} from "@/lib/booking-data";
import type {
  PublicAvailabilityDebugResponse,
  PublicAvailabilityResponse,
  PublicAvailableSession
} from "@/lib/public-availability";
import {
  bookingArrivalInstructions,
  business,
  groupSizeMessage,
  juneLaunchScheduleNote,
  refundCancellationReminder
} from "@/lib/site-data";
import {
  formatCurrencyFromCents,
  getLaunchPassOption,
  getSessionTotalCents,
  launchPassOptions,
  sessionPriceLabel,
  type LaunchPassType
} from "@/lib/pricing";
import { waiverSections, waiverVersion } from "@/lib/waiver-content";

const inputClass =
  "field-focus w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400";

const publicStepLabels = ["Choose Your Training Session", "Athlete Information", "Parent Waiver + Secure Payment"];
const specialTrainingRequestValue = "special-training-request";

type BookingStep = "program" | "session" | "details" | "waiver" | "payment";
type BookingOption = "single_session" | LaunchPassType | "use_existing_pass";

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
};

type BookingFieldErrorKey = keyof BookingFields | "session";
type BookingFieldErrors = Partial<Record<BookingFieldErrorKey, string>>;

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
  guardianSignature: ""
};

type StripeCheckoutResult = {
  checkoutUrl?: string;
  sessionId?: string;
  error?: string;
};

type LaunchPassSummary = {
  id: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  playerName: string;
  playerAge: string;
  trainingGroup: TrainingGroupId;
  trainingGroupLabel: string;
  passType: LaunchPassType;
  passTitle: string;
  totalCredits: number;
  remainingCredits: number;
  expiresAt: string;
};

type PassPurchaseFields = {
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  playerName: string;
  playerAge: string;
  trainingGroup: TrainingGroupId;
};

type PassLookupFields = {
  parentEmail: string;
  playerName: string;
};

async function createStripeCheckout(booking: BookingRecord) {
  try {
    const response = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(booking)
    });
    const result = (await response.json()) as StripeCheckoutResult;

    if (!response.ok) {
      return {
        error: result.error ?? "Secure payment could not be started."
      } satisfies StripeCheckoutResult;
    }

    return result;
  } catch {
    return {
      error: "Secure payment could not be reached. Please try again."
    } satisfies StripeCheckoutResult;
  }
}

async function createLaunchPassCheckout(passType: LaunchPassType, fields: PassPurchaseFields) {
  try {
    const response = await fetch("/api/stripe/pass-checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...fields,
        passType
      })
    });
    const result = (await response.json()) as StripeCheckoutResult & { passPurchaseId?: string };

    if (!response.ok) {
      return {
        error: result.error ?? "Launch Pass payment could not be started."
      };
    }

    return result;
  } catch {
    return {
      error: "Launch Pass payment could not be reached. Please try again."
    };
  }
}

async function lookupLaunchPassCredits(fields: PassLookupFields) {
  try {
    const response = await fetch("/api/passes/lookup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(fields)
    });
    const result = (await response.json()) as { passes?: LaunchPassSummary[]; error?: string };

    if (!response.ok) {
      return {
        passes: [],
        error: result.error ?? "Launch Pass credits could not be checked."
      };
    }

    return {
      passes: result.passes ?? [],
      error: ""
    };
  } catch {
    return {
      passes: [],
      error: "Launch Pass credits could not be reached. Please try again."
    };
  }
}

async function redeemLaunchPassCredit(passPurchaseId: string, booking: BookingRecord) {
  try {
    const response = await fetch("/api/passes/redeem", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        passPurchaseId,
        booking
      })
    });
    const result = (await response.json()) as {
      status?: string;
      bookingId?: string;
      remainingCredits?: number;
      error?: string;
    };

    if (!response.ok) {
      return {
        error: result.error ?? "Launch Pass credit could not be used."
      };
    }

    return result;
  } catch {
    return {
      error: "Launch Pass credit could not be reached. Please try again."
    };
  }
}

async function readAvailableSessions() {
  try {
    const response = await fetch(`/api/availability?fresh=${Date.now()}`, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache"
      }
    });

    if (!response.ok) {
      return null;
    }

    const result = (await response.json()) as PublicAvailabilityResponse;

    return result;
  } catch {
    return null;
  }
}

async function readAvailabilityDebug() {
  try {
    const response = await fetch(`/api/availability/debug?fresh=${Date.now()}`, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache"
      }
    });

    return (await response.json()) as PublicAvailabilityDebugResponse;
  } catch {
    return null;
  }
}

function spotsLabel(count: number) {
  return `${count} ${count === 1 ? "spot" : "spots"} remaining`;
}

function isValidEmailAddress(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function sessionLocationLines(location: string) {
  if (location.includes("40700 Yucca Lane")) {
    return [business.trainingLocationName, business.trainingLocationAddress];
  }

  return location.split(/\n|,\s(?=\d)/).filter(Boolean);
}

function monthKeyFromDateIso(dateIso: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateIso) ? dateIso.slice(0, 7) : "";
}

function addMonths(monthKey: string, amount: number) {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function monthDays(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const blanks = Array.from({ length: firstWeekday }, () => "");
  const days = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    return `${monthKey}-${String(day).padStart(2, "0")}`;
  });

  return [...blanks, ...days];
}

function readableDate(dateIso: string) {
  const [year, month, day] = dateIso.split("-").map(Number);

  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function BookingForm() {
  const [step, setStep] = useState<BookingStep>("program");
  const [bookingOption, setBookingOption] = useState<BookingOption>("single_session");
  const [apiSessions, setApiSessions] = useState<PublicAvailableSession[]>([]);
  const [availabilityStatus, setAvailabilityStatus] = useState("Loading");
  const [availabilityError, setAvailabilityError] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<TrainingGroupId | "">("");
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [selectedSessionDate, setSelectedSessionDate] = useState("");
  const [visibleMonth, setVisibleMonth] = useState("");
  const [isSpecialRequest, setIsSpecialRequest] = useState(false);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(true);
  const [showAvailabilityDebug, setShowAvailabilityDebug] = useState(false);
  const [availabilityDebug, setAvailabilityDebug] = useState<PublicAvailabilityDebugResponse | null>(null);
  const [fields, setFields] = useState<BookingFields>(initialFields);
  const [passPurchaseFields, setPassPurchaseFields] = useState<PassPurchaseFields>({
    parentName: "",
    parentEmail: "",
    parentPhone: "",
    playerName: "",
    playerAge: "",
    trainingGroup: trainingGroups[0].id
  });
  const [passLookupFields, setPassLookupFields] = useState<PassLookupFields>({
    parentEmail: "",
    playerName: ""
  });
  const [foundPasses, setFoundPasses] = useState<LaunchPassSummary[]>([]);
  const [selectedPassId, setSelectedPassId] = useState("");
  const [passNotice, setPassNotice] = useState("");
  const [creditBookingSuccess, setCreditBookingSuccess] = useState<{
    bookingId: string;
    remainingCredits?: number;
  } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<BookingFieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    readAvailableSessions().then((result) => {
      if (!active) {
        return;
      }

      if (!result) {
        setApiSessions([]);
        setAvailabilityStatus("Failed");
        setAvailabilityError("Availability could not be loaded.");
        return;
      }

      setApiSessions(result.sessions);
      setAvailabilityStatus(result.status);
      setAvailabilityError(result.message ?? "");
      setSelectedSlotId("");
    }).finally(() => {
      if (active) {
        setIsLoadingAvailability(false);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const shouldShowDebug = new URLSearchParams(window.location.search).get("debugAvailability") === "1";
    setShowAvailabilityDebug(shouldShowDebug);

    if (shouldShowDebug) {
      void readAvailabilityDebug().then(setAvailabilityDebug);
    }
  }, []);

  const availableSessions = useMemo(
    () =>
      selectedGroupId
        ? apiSessions.filter((session) => session.trainingGroupId === selectedGroupId)
        : apiSessions,
    [apiSessions, selectedGroupId]
  );
  const sessionsByDate = useMemo(
    () =>
      availableSessions.reduce<Record<string, PublicAvailableSession[]>>((current, session) => {
        current[session.date] = [...(current[session.date] ?? []), session];
        return current;
      }, {}),
    [availableSessions]
  );
  const availableDateSet = useMemo(() => new Set(Object.keys(sessionsByDate)), [sessionsByDate]);
  const sessionsForSelectedDate = selectedSessionDate
    ? sessionsByDate[selectedSessionDate] ?? []
    : availableSessions;
  const selectedPass = foundPasses.find((pass) => pass.id === selectedPassId) ?? null;
  const usesExistingPass = bookingOption === "use_existing_pass";
  const isPassPurchaseOption =
    bookingOption === "four_session_launch_pass" || bookingOption === "six_session_launch_pass";

  useEffect(() => {
    if (availableSessions.length === 0) {
      if (selectedSlotId) {
        setSelectedSlotId("");
      }
      setSelectedSessionDate("");

      return;
    }

    const hasSelectedSlot = selectedSlotId && availableSessions.some((slot) => slot.id === selectedSlotId);

    if (selectedSlotId && !hasSelectedSlot) {
      setSelectedSlotId("");
    }
  }, [availableSessions, selectedSlotId]);

  useEffect(() => {
    if (availableSessions.length === 0) {
      return;
    }

    const firstDate = availableSessions[0].date;

    if (!selectedSessionDate || !availableDateSet.has(selectedSessionDate)) {
      setSelectedSessionDate(firstDate);
    }

    const firstMonth = monthKeyFromDateIso(selectedSessionDate || firstDate);

    if (!visibleMonth && firstMonth) {
      setVisibleMonth(firstMonth);
    }
  }, [availableDateSet, availableSessions, selectedSessionDate, visibleMonth]);

  const selectedSlot = availableSessions.find((slot) => slot.id === selectedSlotId);
  const selectedGroup = selectedGroupId ? getTrainingGroup(selectedGroupId) : null;
  const bookingGroup = selectedSlot ? getTrainingGroup(selectedSlot.trainingGroupId) : selectedGroup;
  const displaySlot = selectedSlot;
  const publicStepNumber = step === "program" || step === "session" ? 1 : step === "details" ? 2 : 3;
  const publicStepLabel = publicStepLabels[publicStepNumber - 1];
  const progressWidth = `${(publicStepNumber / publicStepLabels.length) * 100}%`;
  const selectedRemainingSpots = selectedSlot ? selectedSlot.remainingSpots : slotCapacity;
  const playerOptions = usesExistingPass
    ? [1]
    : Array.from({ length: Math.max(1, Math.min(slotCapacity, selectedRemainingSpots)) }, (_, index) => index + 1);
  const paymentTotal = usesExistingPass ? "Launch Pass credit" : formatCurrencyFromCents(getSessionTotalCents(fields.players));

  function clearFieldError(field: BookingFieldErrorKey) {
    setFieldErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function focusBookingField(field: BookingFieldErrorKey) {
    window.setTimeout(() => {
      const target = document.querySelector<HTMLElement>(`[data-booking-field="${field}"]`);

      if (!target) {
        return;
      }

      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.focus({ preventScroll: true });
    }, 50);
  }

  function applyFieldErrors(nextErrors: BookingFieldErrors, message: string) {
    setFieldErrors(nextErrors);
    setError(message);

    const firstField = Object.keys(nextErrors)[0] as BookingFieldErrorKey | undefined;

    if (firstField) {
      focusBookingField(firstField);
    }
  }

  function fieldInputClass(field: BookingFieldErrorKey, baseClass = inputClass) {
    return `${baseClass} ${
      fieldErrors[field] ? "border-red-500 bg-red-50 text-red-950 ring-1 ring-red-500" : ""
    }`;
  }

  function fieldLabelClass(field: BookingFieldErrorKey, extraClass = "") {
    return `grid gap-2 text-sm font-bold ${fieldErrors[field] ? "text-red-700" : "text-navy"} ${extraClass}`;
  }

  function fieldErrorMessage(field: BookingFieldErrorKey) {
    return fieldErrors[field] ? <p className="text-xs font-bold leading-5 text-red-700">{fieldErrors[field]}</p> : null;
  }

  function setField(field: keyof BookingFields, value: string | boolean) {
    setFields((current) => ({ ...current, [field]: value }));
    clearFieldError(field);
    setError("");
  }

  function selectGroup(groupId: TrainingGroupId | "") {
    setIsSpecialRequest(false);
    setSelectedGroupId(groupId);
    setSelectedSlotId("");
    setSelectedSessionDate("");
    setVisibleMonth("");
    clearFieldError("session");
    setError("");
  }

  function selectBookingOption(option: BookingOption) {
    setBookingOption(option);
    setIsSpecialRequest(false);
    setSelectedSlotId("");
    setSelectedSessionDate("");
    setVisibleMonth("");
    setFieldErrors({});
    setPassNotice("");
    setCreditBookingSuccess(null);
    setError("");

    if (option === "single_session") {
      setSelectedPassId("");
      setFoundPasses([]);
      return;
    }

    if (option === "use_existing_pass") {
      setSelectedGroupId("");
      setFields((current) => ({ ...current, players: "1" }));
      return;
    }

    setSelectedGroupId("");
  }

  function selectTrainingGroup(value: string) {
    if (value === specialTrainingRequestValue) {
      setIsSpecialRequest(true);
      setSelectedSlotId("");
      setFieldErrors({});
      setError("");
      return;
    }

    selectGroup(value as TrainingGroupId | "");
  }

  function setPassPurchaseField(field: keyof PassPurchaseFields, value: string) {
    setPassPurchaseFields((current) => ({ ...current, [field]: value }));
    setError("");
  }

  function setPassLookupField(field: keyof PassLookupFields, value: string) {
    setPassLookupFields((current) => ({ ...current, [field]: value }));
    setError("");
    setPassNotice("");
  }

  async function startLaunchPassCheckout() {
    if (bookingOption !== "four_session_launch_pass" && bookingOption !== "six_session_launch_pass") {
      return;
    }

    if (
      !passPurchaseFields.parentName.trim() ||
      !passPurchaseFields.parentEmail.trim() ||
      !isValidEmailAddress(passPurchaseFields.parentEmail) ||
      !passPurchaseFields.parentPhone.trim() ||
      !passPurchaseFields.playerName.trim() ||
      !passPurchaseFields.playerAge.trim()
    ) {
      setError("Complete all Launch Pass purchase fields before continuing to payment.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    const checkout = await createLaunchPassCheckout(bookingOption, passPurchaseFields);

    if (!checkout.checkoutUrl) {
      setIsSubmitting(false);
      setError(checkout.error ?? "Launch Pass payment could not be started. Please try again.");
      return;
    }

    window.location.href = checkout.checkoutUrl;
  }

  async function checkLaunchPassCredits() {
    if (!passLookupFields.parentEmail.trim() || !passLookupFields.playerName.trim()) {
      setError("Enter the parent email and player name tied to the Launch Pass.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    setPassNotice("");

    const result = await lookupLaunchPassCredits(passLookupFields);
    setIsSubmitting(false);

    if (result.error) {
      setFoundPasses([]);
      setSelectedPassId("");
      setError(result.error);
      return;
    }

    setFoundPasses(result.passes);

    if (result.passes.length === 0) {
      setSelectedPassId("");
      setPassNotice("No active Launch Pass credits were found for that parent email and player name.");
      return;
    }

    const firstPass = result.passes[0];
    setSelectedPassId(firstPass.id);
    setSelectedGroupId(firstPass.trainingGroup);
    setFields((current) => ({
      ...current,
      parentName: firstPass.parentName,
      playerName: firstPass.playerName,
      playerAge: firstPass.playerAge,
      email: firstPass.parentEmail,
      phone: firstPass.parentPhone,
      players: "1"
    }));
    setPassNotice(`${firstPass.remainingCredits} Launch Pass credit(s) available for ${firstPass.playerName}.`);
  }

  function selectLaunchPass(pass: LaunchPassSummary) {
    setSelectedPassId(pass.id);
    setSelectedGroupId(pass.trainingGroup);
    setSelectedSlotId("");
    setSelectedSessionDate("");
    setVisibleMonth("");
    setFields((current) => ({
      ...current,
      parentName: pass.parentName,
      playerName: pass.playerName,
      playerAge: pass.playerAge,
      email: pass.parentEmail,
      phone: pass.parentPhone,
      players: "1"
    }));
    setPassNotice(`${pass.remainingCredits} Launch Pass credit(s) available for ${pass.playerName}.`);
  }

  function requireSchedule() {
    if (!selectedSlot) {
      applyFieldErrors(
        { session: "Select an available date and time before continuing." },
        "Choose an available training slot before continuing."
      );
      return false;
    }

    clearFieldError("session");
    setError("");
    return true;
  }

  function requireDetails() {
    const nextErrors: BookingFieldErrors = {};
    const playerCount = Number(fields.players);

    if (!fields.parentName.trim()) {
      nextErrors.parentName = "Enter the parent or guardian name.";
    }

    if (!fields.playerName.trim()) {
      nextErrors.playerName = "Enter the player name.";
    }

    if (!fields.playerAge.trim()) {
      nextErrors.playerAge = "Enter the player age.";
    } else {
      const playerAge = Number(fields.playerAge);

      if (!Number.isInteger(playerAge)) {
        nextErrors.playerAge = "Enter a valid whole-number age.";
      } else if (bookingGroup && !isAgeInGroup(playerAge, bookingGroup.id)) {
        nextErrors.playerAge = `${bookingGroup.name} is for ${bookingGroup.ages}. Choose the correct training group.`;
      }
    }

    if (!fields.phone.trim()) {
      nextErrors.phone = "Enter a phone number.";
    }

    if (!fields.email.trim()) {
      nextErrors.email = "Enter an email address.";
    } else if (!isValidEmailAddress(fields.email)) {
      nextErrors.email = "Enter a valid email address.";
    }

    if (!fields.emergencyName.trim()) {
      nextErrors.emergencyName = "Enter an emergency contact name.";
    }

    if (!fields.emergencyPhone.trim()) {
      nextErrors.emergencyPhone = "Enter an emergency contact phone number.";
    }

    if (!fields.players.trim()) {
      nextErrors.players = "Select the number of players attending.";
    } else if (!selectedSlot || !Number.isInteger(playerCount) || playerCount < 1 || playerCount > selectedSlot.remainingSpots) {
      nextErrors.players = `This session has ${spotsLabel(selectedRemainingSpots)}. Adjust the player count before continuing.`;
    }

    if (!fields.medicalNotes.trim()) {
      nextErrors.medicalNotes = "Enter medical notes/injuries, or type None.";
    }

    if (Object.keys(nextErrors).length > 0) {
      applyFieldErrors(nextErrors, "Complete the highlighted athlete information before continuing.");
      return false;
    }

    setFieldErrors({});
    setError("");

    return true;
  }

  function requireWaiver() {
    const nextErrors: BookingFieldErrors = {};

    if (!fields.medicalNotes.trim()) {
      nextErrors.medicalNotes = "Enter medical notes/injuries, or type None.";
    }

    if (!fields.mediaConsent) {
      nextErrors.mediaConsent = "Choose yes or no for media consent.";
    }

    if (!fields.waiverAgreement) {
      nextErrors.waiverAgreement = "Confirm that you have read and agree to the waiver.";
    }

    if (!fields.guardianSignature.trim()) {
      nextErrors.guardianSignature = "Type the parent or guardian legal name.";
    }

    if (Object.keys(nextErrors).length > 0) {
      applyFieldErrors(nextErrors, "Complete the highlighted waiver fields before payment.");
      return false;
    }

    setFieldErrors({});
    setError("");

    return true;
  }

  function buildBookingPayload(slot: PublicAvailableSession, paymentType: "single_session" | "launch_pass_credit") {
    const bookingTimestamp = new Date().toISOString();

    return {
      id: `EST-${slot.id.replaceAll("-", "").slice(-8).toUpperCase()}-${Date.now().toString().slice(-5)}`,
      createdAt: bookingTimestamp,
      parentName: fields.parentName,
      playerName: fields.playerName,
      playerAge: fields.playerAge,
      phone: fields.phone,
      email: fields.email,
      players: paymentType === "launch_pass_credit" ? "1" : fields.players,
      notes: fields.notes,
      medicalNotes: fields.medicalNotes,
      emergencyName: fields.emergencyName,
      emergencyPhone: fields.emergencyPhone,
      guardianSignature: fields.guardianSignature,
      waiverAccepted: fields.waiverAgreement,
      waiverAcceptedAt: bookingTimestamp,
      waiverVersion,
      mediaConsent: fields.mediaConsent === "yes" ? "Granted" : "Declined",
      programId: slot.trainingGroupId,
      programName: slot.trainingGroup,
      sessionId: slot.id,
      sessionDateIso: slot.date,
      sessionDate: slot.dateLabel,
      sessionTime: slot.startTime,
      sessionDurationMinutes: 60,
      sessionCalendarEventId: slot.calendarEventId,
      paymentStatus: paymentType === "launch_pass_credit" ? "Paid" : "pending_payment",
      notificationStatus: "Ready",
      calendarStatus: "Ready",
      paymentType,
      passPurchaseId: selectedPass?.id
    } satisfies BookingRecord;
  }

  async function startStripeCheckout() {
    if (!selectedSlot) {
      setStep("session");
      setError("That slot is no longer available. Please choose another time.");
      return;
    }

    const requestedPlayers = Number(fields.players);
    const latestAvailability = await readAvailableSessions();
    const latestSlot = latestAvailability?.sessions.find((slot) => slot.id === selectedSlot.id);
    const latestRemainingSpots = latestSlot?.remainingSpots ?? 0;

    if (
      !latestSlot ||
      latestSlot.trainingGroupId !== selectedSlot.trainingGroupId ||
      !Number.isInteger(requestedPlayers) ||
      requestedPlayers < 1 ||
      requestedPlayers > latestRemainingSpots
    ) {
      setApiSessions(latestAvailability?.sessions ?? []);
      setAvailabilityStatus(latestAvailability?.status ?? "Failed");
      setAvailabilityError(latestAvailability?.message ?? "");
      setStep("session");
      setError("That session no longer has enough spots. Please choose another available time.");
      return;
    }

    const booking = buildBookingPayload(latestSlot, "single_session");

    setIsSubmitting(true);
    setError("");

    const checkout = await createStripeCheckout(booking);

    if (!checkout.checkoutUrl) {
      setIsSubmitting(false);
      setError(checkout.error ?? "Secure payment could not be started. Please try again.");
      return;
    }

    window.localStorage.setItem("est-pending-booking", JSON.stringify({ ...booking, stripeSessionId: checkout.sessionId }));
    window.location.href = checkout.checkoutUrl;
  }

  async function confirmWithLaunchPassCredit() {
    if (!selectedPass || !selectedSlot) {
      setStep("session");
      setError("Choose an active Launch Pass and an available session before confirming.");
      return;
    }

    const latestAvailability = await readAvailableSessions();
    const latestSlot = latestAvailability?.sessions.find((slot) => slot.id === selectedSlot.id);

    if (!latestSlot || latestSlot.trainingGroupId !== selectedPass.trainingGroup || latestSlot.remainingSpots < 1) {
      setApiSessions(latestAvailability?.sessions ?? []);
      setAvailabilityStatus(latestAvailability?.status ?? "Failed");
      setAvailabilityError(latestAvailability?.message ?? "");
      setStep("session");
      setError("That session is no longer available for this Launch Pass. Please choose another open time.");
      return;
    }

    const booking = buildBookingPayload(latestSlot, "launch_pass_credit");

    setIsSubmitting(true);
    setError("");

    const result = await redeemLaunchPassCredit(selectedPass.id, booking);

    if (!result.bookingId) {
      setIsSubmitting(false);
      setError(result.error ?? "Launch Pass credit could not be used. Please try again.");
      return;
    }

    setIsSubmitting(false);
    setCreditBookingSuccess({
      bookingId: result.bookingId,
      remainingCredits: result.remainingCredits
    });
    setPassNotice("Your session is confirmed using a Launch Pass credit.");
    void readAvailableSessions().then((next) => {
      if (next) {
        setApiSessions(next.sessions);
      }
    });
  }

  return (
    <div className="grid gap-6">
      <div className="panel overflow-hidden">
        <div className="border-b border-slate-200 bg-navy p-5 text-white sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-black uppercase text-electric">Booking</p>
              <h2 className="mt-2 text-2xl font-black leading-tight sm:text-3xl">{publicStepLabel}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                60-minute small group soccer training for 1-6 players. {groupSizeMessage}
              </p>
            </div>
            {displaySlot ? (
              <div className="rounded-lg border border-white/15 bg-white/10 p-4 text-sm">
                <p className="font-black text-white">Selected Session</p>
                <p className="mt-1 text-slate-200">
                  {displaySlot.dateLabel} at {displaySlot.startTime}
                </p>
                <p className="mt-1 text-slate-300">{displaySlot.duration}</p>
                <p className="mt-2 text-xs font-bold uppercase text-electric">{groupSizeMessage}</p>
              </div>
            ) : null}
          </div>
        </div>

        <div className="border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-4 text-xs font-black uppercase tracking-wide">
            <p className="text-slate-500">
              Step {publicStepNumber} of {publicStepLabels.length}
            </p>
            <p className="text-navy">{publicStepLabel}</p>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-electric transition-all" style={{ width: progressWidth }} />
          </div>
        </div>

        {error ? (
          <div className="border-b border-red-200 bg-red-50 px-5 py-4 text-sm font-bold text-red-700">{error}</div>
        ) : null}

        {step === "program" ? (
          <section className="grid gap-6 p-5 sm:p-8">
            <div>
              <p className="text-sm font-black uppercase text-electric">Step 1</p>
              <h3 className="mt-2 text-2xl font-black text-navy">Choose your training session</h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Choose a single session, purchase a June Launch Pass, or book with existing Launch Pass credits.
              </p>
            </div>

            <div className="grid gap-3 lg:grid-cols-4">
              {[
                ["single_session", "Single Session", "$55", "Book one 60-minute session now."],
                [
                  "four_session_launch_pass",
                  "4-Session Launch Pass",
                  "$200",
                  "Four credits through June 30."
                ],
                [
                  "six_session_launch_pass",
                  "6-Session Launch Pass",
                  "$285",
                  "Six credits through June 30."
                ],
                ["use_existing_pass", "Use Existing Credits", "Launch Pass", "Reserve a session with paid credits."]
              ].map(([value, title, price, description]) => {
                const isSelected = bookingOption === value;

                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => selectBookingOption(value as BookingOption)}
                    className={`rounded-lg border p-4 text-left transition ${
                      isSelected ? "border-navy bg-navy text-white shadow-xl shadow-navy/15" : "border-slate-200 bg-white text-navy hover:border-electric"
                    }`}
                  >
                    <span className={`block text-xs font-black uppercase ${isSelected ? "text-electric" : "text-slate-500"}`}>{price}</span>
                    <span className="mt-2 block text-lg font-black">{title}</span>
                    <span className="mt-2 block text-sm leading-6 opacity-80">{description}</span>
                  </button>
                );
              })}
            </div>

            {isSpecialRequest ? (
              <div className="rounded-lg border border-slate-200 bg-mist p-5">
                <SpecialRequestForm embedded />
              </div>
            ) : isPassPurchaseOption ? (
              <div className="grid gap-5 rounded-lg border border-slate-200 bg-mist p-5">
                <div>
                  <p className="text-xs font-black uppercase text-electric">{getLaunchPassOption(bookingOption as LaunchPassType).price}</p>
                  <h4 className="mt-2 text-2xl font-black text-navy">{getLaunchPassOption(bookingOption as LaunchPassType).title}</h4>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {getLaunchPassOption(bookingOption as LaunchPassType).description} Launch Pass credits expire June 30, 2026 and are tied to the parent email and player name entered here.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-bold text-navy">
                    Parent/Guardian Name
                    <input className={inputClass} value={passPurchaseFields.parentName} onChange={(event) => setPassPurchaseField("parentName", event.target.value)} />
                  </label>
                  <label className="grid gap-2 text-sm font-bold text-navy">
                    Parent Email
                    <input className={inputClass} type="email" value={passPurchaseFields.parentEmail} onChange={(event) => setPassPurchaseField("parentEmail", event.target.value)} />
                  </label>
                  <label className="grid gap-2 text-sm font-bold text-navy">
                    Parent Phone
                    <input className={inputClass} type="tel" value={passPurchaseFields.parentPhone} onChange={(event) => setPassPurchaseField("parentPhone", event.target.value)} />
                  </label>
                  <label className="grid gap-2 text-sm font-bold text-navy">
                    Player Name
                    <input className={inputClass} value={passPurchaseFields.playerName} onChange={(event) => setPassPurchaseField("playerName", event.target.value)} />
                  </label>
                  <label className="grid gap-2 text-sm font-bold text-navy">
                    Player Age
                    <input className={inputClass} inputMode="numeric" value={passPurchaseFields.playerAge} onChange={(event) => setPassPurchaseField("playerAge", event.target.value)} />
                  </label>
                  <label className="grid gap-2 text-sm font-bold text-navy">
                    Preferred Training Group
                    <select className={inputClass} value={passPurchaseFields.trainingGroup} onChange={(event) => setPassPurchaseField("trainingGroup", event.target.value as TrainingGroupId)}>
                      {trainingGroups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}: {group.ages}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => void startLaunchPassCheckout()}
                  className="inline-flex w-full items-center justify-center rounded-md bg-electric px-6 py-4 text-sm font-black uppercase text-white shadow-lg shadow-electric/25 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-fit"
                >
                  {isSubmitting ? "Starting Payment..." : `Buy ${getLaunchPassOption(bookingOption as LaunchPassType).title}`}
                </button>
              </div>
            ) : usesExistingPass ? (
              <div className="grid gap-5 rounded-lg border border-slate-200 bg-mist p-5">
                <div>
                  <p className="text-xs font-black uppercase text-electric">Launch Pass Credits</p>
                  <h4 className="mt-2 text-2xl font-black text-navy">Find your active credits</h4>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Enter the parent email and player name used when purchasing the Launch Pass.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                  <label className="grid gap-2 text-sm font-bold text-navy">
                    Parent Email
                    <input className={inputClass} type="email" value={passLookupFields.parentEmail} onChange={(event) => setPassLookupField("parentEmail", event.target.value)} />
                  </label>
                  <label className="grid gap-2 text-sm font-bold text-navy">
                    Player Name
                    <input className={inputClass} value={passLookupFields.playerName} onChange={(event) => setPassLookupField("playerName", event.target.value)} />
                  </label>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => void checkLaunchPassCredits()}
                    className="rounded-md bg-navy px-5 py-3 text-sm font-black uppercase text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Check Credits
                  </button>
                </div>
                {passNotice ? <p className="rounded-md bg-white p-3 text-sm font-bold text-slate-700">{passNotice}</p> : null}
                {foundPasses.length > 0 ? (
                  <div className="grid gap-3">
                    {foundPasses.map((pass) => {
                      const isSelected = selectedPassId === pass.id;

                      return (
                        <button
                          key={pass.id}
                          type="button"
                          onClick={() => selectLaunchPass(pass)}
                          className={`rounded-lg border p-4 text-left transition ${
                            isSelected ? "border-navy bg-white shadow-lg shadow-navy/10" : "border-slate-200 bg-white hover:border-electric"
                          }`}
                        >
                          <p className="text-xs font-black uppercase text-electric">{pass.passTitle}</p>
                          <h5 className="mt-1 font-black text-navy">{pass.playerName}</h5>
                          <p className="mt-1 text-sm font-semibold text-slate-600">{pass.trainingGroupLabel}</p>
                          <p className="mt-2 text-sm font-black text-navy">
                            {pass.remainingCredits} of {pass.totalCredits} credits remaining
                          </p>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                <button
                  type="button"
                  disabled={!selectedPass}
                  onClick={() => setStep("session")}
                  className="inline-flex w-full items-center justify-center rounded-md bg-electric px-6 py-4 text-sm font-black uppercase text-white shadow-lg shadow-electric/25 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 sm:w-fit"
                >
                  View Available Sessions
                </button>
              </div>
            ) : (
              <>
                <label className="grid gap-2 text-sm font-bold text-navy">
                  Select Training Group
                  <select
                    className={inputClass}
                    value={isSpecialRequest ? specialTrainingRequestValue : selectedGroupId}
                    onChange={(event) => selectTrainingGroup(event.target.value)}
                  >
                    <option value="">All Available Training Groups</option>
                    {trainingGroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}: {group.ages}
                      </option>
                    ))}
                    <option value={specialTrainingRequestValue}>Special Training Request</option>
                  </select>
                </label>
                {selectedGroup ? (
                  <div className="rounded-lg border border-slate-200 bg-mist p-5">
                    <p className="text-xs font-black uppercase text-electric">{selectedGroup.ages}</p>
                    <h4 className="mt-2 text-2xl font-black text-navy">{selectedGroup.name}</h4>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{groupSizeMessage}</p>
                    <div className="mt-4 grid gap-2 text-sm font-semibold text-slate-700 sm:grid-cols-2">
                      {selectedGroup.focus.map((item) => (
                        <p key={item}>{item}</p>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-mist p-5">
                    <p className="text-xs font-black uppercase text-electric">Available Sessions</p>
                    <h4 className="mt-2 text-2xl font-black text-navy">Choose from open training times</h4>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      View all open Future Elite and Elite Performance sessions, or select a group above to narrow the schedule.
                    </p>
                    <p className="mt-3 text-sm font-bold text-slate-700">{groupSizeMessage}</p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setStep("session")}
                  className="inline-flex w-full items-center justify-center rounded-md bg-electric px-6 py-4 text-sm font-black uppercase text-white shadow-lg shadow-electric/25 transition hover:bg-blue-500 sm:w-fit"
                >
                  View Available Sessions
                </button>
              </>
            )}
          </section>
        ) : null}

        {step === "session" ? (
          <section className="grid gap-6 p-5 sm:p-8">
            <div>
              <p className="text-sm font-black uppercase text-electric">Step 1</p>
              <h3 className="mt-2 text-2xl font-black text-navy">Choose your training session</h3>
              <p className="mt-2 text-sm font-bold text-slate-600">
                {selectedGroup ? selectedGroup.ages : "All available training groups"}
              </p>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{groupSizeMessage}</p>
              <p className="mt-3 max-w-2xl rounded-lg border border-electric/20 bg-blue-50 p-4 text-sm font-bold leading-6 text-slate-700">
                {juneLaunchScheduleNote}
              </p>
            </div>

            {showAvailabilityDebug ? (
              <div className="rounded-lg border border-dashed border-electric/50 bg-blue-50 p-4 text-xs text-slate-700">
                <p className="font-black uppercase text-navy">Availability Debug</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <p><span className="font-black text-navy">API request status:</span> {availabilityStatus}</p>
                  <p><span className="font-black text-navy">Total sessions returned by /api/availability:</span> {apiSessions.length}</p>
                  <p><span className="font-black text-navy">Supabase configured:</span> {availabilityDebug?.supabaseConfigured ? "yes" : "no"}</p>
                  <p><span className="font-black text-navy">All sessions loaded:</span> {availabilityDebug?.summary?.allSessionsLoaded ?? "loading"}</p>
                  <p><span className="font-black text-navy">Open future sessions:</span> {availabilityDebug?.summary?.openFutureSessions ?? "loading"}</p>
                  <p><span className="font-black text-navy">Sessions with remaining spots:</span> {availabilityDebug?.summary?.sessionsWithRemainingSpots ?? "loading"}</p>
                  <p><span className="font-black text-navy">Selected training group:</span> {selectedGroup ? selectedGroup.name : "All available training groups"}</p>
                  <p><span className="font-black text-navy">Sessions after group filter:</span> {availableSessions.length}</p>
                  <p><span className="font-black text-navy">Final sessions rendered:</span> {sessionsForSelectedDate.length}</p>
                </div>
                {availabilityError ? <p className="mt-3 font-bold text-red-700">{availabilityError}</p> : null}
                <div className="mt-3 grid gap-1">
                  {(availabilityDebug?.loadedSessions?.length ?? 0) > 0 ? (
                    availabilityDebug?.loadedSessions.map((slot) => (
                      <p key={slot.id}>
                        {slot.id} / {slot.date} / {slot.time} / {slot.trainingGroup} / {slot.remainingSpots} spots /{" "}
                        {slot.included ? "included" : `removed: ${slot.removedReasons.join(", ")}`}
                      </p>
                    ))
                  ) : (
                    <p>No sessions returned by /api/availability/debug.</p>
                  )}
                </div>
              </div>
            ) : null}

            {availableSessions.length > 0 ? (
              <div
                data-booking-field="session"
                tabIndex={-1}
                className={`grid gap-3 rounded-lg outline-none ${
                  fieldErrors.session ? "border border-red-300 bg-red-50 p-3" : ""
                }`}
              >
                {visibleMonth ? (
                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setVisibleMonth((current) => addMonths(current || monthKeyFromDateIso(availableSessions[0].date), -1))}
                        className="rounded-md border border-slate-300 px-3 py-2 text-xs font-black text-navy"
                      >
                        Prev
                      </button>
                      <p className="text-center text-sm font-black uppercase text-navy">{monthLabel(visibleMonth)}</p>
                      <button
                        type="button"
                        onClick={() => setVisibleMonth((current) => addMonths(current || monthKeyFromDateIso(availableSessions[0].date), 1))}
                        className="rounded-md border border-slate-300 px-3 py-2 text-xs font-black text-navy"
                      >
                        Next
                      </button>
                    </div>
                    <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[11px] font-black uppercase text-slate-500">
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                        <p key={day}>{day}</p>
                      ))}
                    </div>
                    <div className="mt-2 grid grid-cols-7 gap-1">
                      {monthDays(visibleMonth).map((dateIso, index) => {
                        const hasSessions = Boolean(dateIso && availableDateSet.has(dateIso));
                        const isSelected = selectedSessionDate === dateIso;
                        const dayNumber = dateIso ? Number(dateIso.slice(-2)) : "";

                        return dateIso ? (
                          <button
                            key={dateIso}
                            type="button"
                            disabled={!hasSessions}
                            onClick={() => {
                              setSelectedSessionDate(dateIso);
                              setSelectedSlotId("");
                            }}
                            className={`aspect-square rounded-md border text-sm font-black transition ${
                              isSelected
                                ? "border-navy bg-navy text-white"
                                : hasSessions
                                  ? "border-electric/30 bg-blue-50 text-navy hover:border-electric"
                                  : "border-slate-100 bg-slate-50 text-slate-300"
                            }`}
                          >
                            {dayNumber}
                          </button>
                        ) : (
                          <span key={`blank-${index}`} />
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {selectedSessionDate ? (
                  <p className="text-sm font-black text-navy">Available sessions for {readableDate(selectedSessionDate)}</p>
                ) : null}

                <div className="grid gap-3">
                  {sessionsForSelectedDate.map((slot) => {
                    const isSelected = selectedSlotId === slot.id;

                    return (
                      <button
                        key={slot.id}
                        type="button"
                        onClick={() => {
                          setSelectedSlotId(slot.id);
                          clearFieldError("session");
                          setFields((current) => ({
                            ...current,
                            players: String(Math.min(Number(current.players) || 1, slot.remainingSpots))
                          }));
                        }}
                        className={`rounded-lg border p-4 text-left transition ${
                          isSelected
                            ? "border-navy bg-navy text-white shadow-xl shadow-navy/20"
                            : "border-slate-200 bg-white text-navy hover:border-electric"
                        }`}
                      >
                        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
                          <div>
                            <span className={`block text-xs font-black uppercase ${isSelected ? "text-electric" : "text-slate-500"}`}>
                              {slot.dayLabel}, {slot.dateLabel}
                            </span>
                            <span className="mt-1 block text-2xl font-black">{slot.startTime}</span>
                            <span className="mt-2 block text-sm font-bold opacity-90">
                              {slot.trainingGroup}: {slot.trainingGroupAges}
                            </span>
                            <span className="mt-1 block text-sm font-semibold opacity-80">
                              {sessionLocationLines(slot.location).map((line) => (
                                <span key={line} className="block">{line}</span>
                              ))}
                            </span>
                            <span className="mt-1 block text-sm font-semibold opacity-80">{slot.duration} session</span>
                            <span className="mt-3 block text-xs font-black uppercase text-electric">{spotsLabel(slot.remainingSpots)}</span>
                          </div>
                          <span
                            className={`inline-flex w-full justify-center rounded-md px-4 py-3 text-xs font-black uppercase sm:w-auto ${
                              isSelected ? "bg-electric text-white" : "bg-mist text-navy"
                            }`}
                          >
                            {isSelected ? "Selected" : "Select Session"}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {sessionsForSelectedDate.length === 0 ? (
                  <p className="rounded-lg border border-slate-200 bg-mist p-4 text-sm font-bold text-slate-600">
                    No open sessions are available for this date. Choose another highlighted date.
                  </p>
                ) : null}
                {fieldErrorMessage("session")}
              </div>
            ) : (
              <div data-booking-field="session" tabIndex={-1} className="rounded-lg border border-slate-200 bg-mist p-6 outline-none">
                {isLoadingAvailability ? (
                  <>
                    <p className="font-black text-navy">Loading available sessions...</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">Checking the latest open training times.</p>
                  </>
                ) : (
                  <>
                    <p className="font-black text-navy">
                      No open sessions are available right now. Please check back soon or submit a Special Training Request.
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      You can also call <a className="font-black underline" href={business.phoneHref}>{business.phone}</a> for schedule help.
                    </p>
                  </>
                )}
                {fieldErrorMessage("session")}
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
              Continue To Athlete Information
            </button>
            <button type="button" onClick={() => setStep("program")} className="w-fit rounded-md border border-slate-300 px-6 py-3 text-sm font-black text-navy">
              Back
            </button>
          </section>
        ) : null}

        {step === "details" ? (
          <section className="grid gap-5 p-5 sm:grid-cols-2 sm:p-8">
            <div className="sm:col-span-2">
              <p className="text-sm font-black uppercase text-electric">Step 2</p>
              <h3 className="mt-2 text-2xl font-black text-navy">Athlete information</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Add parent contact details, athlete information, emergency contact, and any helpful notes for Coach Hugo.
              </p>
            </div>
            <label className={fieldLabelClass("parentName")}>
              Parent/Guardian Name
              <input
                data-booking-field="parentName"
                className={fieldInputClass("parentName")}
                value={fields.parentName}
                onChange={(event) => setField("parentName", event.target.value)}
                aria-invalid={Boolean(fieldErrors.parentName)}
              />
              {fieldErrorMessage("parentName")}
            </label>
            <label className={fieldLabelClass("playerName")}>
              Player Name
              <input
                data-booking-field="playerName"
                className={fieldInputClass("playerName")}
                value={fields.playerName}
                onChange={(event) => setField("playerName", event.target.value)}
                aria-invalid={Boolean(fieldErrors.playerName)}
              />
              {fieldErrorMessage("playerName")}
            </label>
            <label className={fieldLabelClass("playerAge")}>
              Player Age
              <input
                data-booking-field="playerAge"
                className={fieldInputClass("playerAge")}
                inputMode="numeric"
                value={fields.playerAge}
                onChange={(event) => setField("playerAge", event.target.value)}
                aria-invalid={Boolean(fieldErrors.playerAge)}
              />
              {fieldErrorMessage("playerAge")}
            </label>
            <label className={fieldLabelClass("phone")}>
              Phone Number
              <input
                data-booking-field="phone"
                className={fieldInputClass("phone")}
                type="tel"
                value={fields.phone}
                onChange={(event) => setField("phone", event.target.value)}
                aria-invalid={Boolean(fieldErrors.phone)}
              />
              {fieldErrorMessage("phone")}
            </label>
            <label className={fieldLabelClass("email")}>
              Email
              <input
                data-booking-field="email"
                className={fieldInputClass("email")}
                type="email"
                value={fields.email}
                onChange={(event) => setField("email", event.target.value)}
                aria-invalid={Boolean(fieldErrors.email)}
              />
              {fieldErrorMessage("email")}
            </label>
            <label className={fieldLabelClass("emergencyName")}>
              Emergency Contact Name
              <input
                data-booking-field="emergencyName"
                className={fieldInputClass("emergencyName")}
                value={fields.emergencyName}
                onChange={(event) => setField("emergencyName", event.target.value)}
                aria-invalid={Boolean(fieldErrors.emergencyName)}
              />
              {fieldErrorMessage("emergencyName")}
            </label>
            <label className={fieldLabelClass("emergencyPhone")}>
              Emergency Contact Phone
              <input
                data-booking-field="emergencyPhone"
                className={fieldInputClass("emergencyPhone")}
                type="tel"
                value={fields.emergencyPhone}
                onChange={(event) => setField("emergencyPhone", event.target.value)}
                aria-invalid={Boolean(fieldErrors.emergencyPhone)}
              />
              {fieldErrorMessage("emergencyPhone")}
            </label>
            {usesExistingPass ? (
              <div className="rounded-md bg-mist px-4 py-3 text-sm font-bold text-slate-600">
                Launch Pass booking uses 1 credit for {fields.playerName || "this player"}.
              </div>
            ) : (
              <label className={fieldLabelClass("players")}>
                Number of Players Attending
                <select
                  data-booking-field="players"
                  className={fieldInputClass("players")}
                  value={fields.players}
                  onChange={(event) => setField("players", event.target.value)}
                  aria-invalid={Boolean(fieldErrors.players)}
                >
                  {playerOptions.map((count) => (
                    <option key={count} value={count}>
                      {count}
                    </option>
                  ))}
                </select>
                {fieldErrorMessage("players")}
              </label>
            )}
            {selectedSlot ? (
              <p className="rounded-md bg-mist px-4 py-3 text-sm font-bold text-slate-600 sm:col-span-2">
                {spotsLabel(selectedRemainingSpots)} for {selectedSlot.dateLabel} at {selectedSlot.startTime}. {groupSizeMessage}
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
            <label className={fieldLabelClass("medicalNotes", "sm:col-span-2")}>
              Medical Notes/Injuries
              <textarea
                data-booking-field="medicalNotes"
                className={fieldInputClass("medicalNotes", `${inputClass} min-h-28 resize-y`)}
                value={fields.medicalNotes}
                onChange={(event) => setField("medicalNotes", event.target.value)}
                placeholder="Share anything Coach Hugo should know before training"
                aria-invalid={Boolean(fieldErrors.medicalNotes)}
              />
              {fieldErrorMessage("medicalNotes")}
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
                Continue To Parent Waiver
              </button>
            </div>
          </section>
        ) : null}

        {step === "waiver" ? (
          <section className="grid gap-5 bg-[#f4f6f8] px-4 py-6 sm:px-8 sm:py-8">
            <article className="mx-auto w-full max-w-3xl border border-slate-300 bg-[#fffdf8] px-5 py-7 shadow-sm sm:px-10 sm:py-10">
              <header className="border-b border-slate-300 pb-5">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Step 3</p>
                <h3 className="mt-2 text-xl font-black leading-tight text-navy sm:text-2xl">
                  Elite Soccer Training CV Participation Waiver & Release of Liability
                </h3>
                <p className="mt-3 text-sm leading-6 text-slate-700">
                  Review the parent waiver, choose media consent, and sign electronically before secure payment.
                </p>
              </header>

              <div className="text-sm leading-6 text-slate-700">
                <section className="border-b border-slate-300 py-5">
                  <h4 className="text-sm font-black uppercase tracking-wide text-navy">Participant Information</h4>
                  <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                    {[
                      ["Participant Name", fields.playerName || "Complete player details"],
                      ["Parent/Guardian Name", fields.parentName || "Complete parent details"],
                      ["Phone Number", fields.phone || "Complete phone number"],
                      ["Email", fields.email || "Complete email address"],
                      ["Emergency Contact", fields.emergencyName || "Complete emergency contact"],
                      ["Emergency Phone", fields.emergencyPhone || "Complete emergency phone"]
                    ].map(([label, value]) => (
                      <div key={label} className="border-b border-slate-300 pb-2">
                        <dt className="text-[11px] font-bold uppercase text-slate-500">{label}</dt>
                        <dd className="mt-0.5 font-semibold text-navy">{value}</dd>
                      </div>
                    ))}
                  </dl>

                  <label className={`mt-4 grid gap-2 text-xs font-bold uppercase tracking-wide ${fieldErrors.medicalNotes ? "text-red-700" : "text-navy"}`}>
                    Medical Conditions / Allergies
                    <textarea
                      data-booking-field="medicalNotes"
                      className={fieldInputClass("medicalNotes", `${inputClass} min-h-24 resize-y`)}
                      value={fields.medicalNotes}
                      onChange={(event) => setField("medicalNotes", event.target.value)}
                      placeholder="List medical conditions, allergies, injuries, or type None"
                      aria-invalid={Boolean(fieldErrors.medicalNotes)}
                    />
                    {fieldErrorMessage("medicalNotes")}
                  </label>
                </section>

                {waiverSections.map((section) => (
                  <section key={section.title} className="border-b border-slate-300 py-4">
                    <h4 className="text-sm font-black uppercase tracking-wide text-navy">{section.title}</h4>
                    <p className="mt-2 leading-6 text-slate-700">{section.copy}</p>
                  </section>
                ))}

                <section className="pt-5">
                  <div className="border-b-2 border-navy/30 pb-3">
                    <h4 className="text-sm font-black uppercase tracking-wide text-navy">Media Consent</h4>
                  </div>

                  <div
                    data-booking-field="mediaConsent"
                    tabIndex={-1}
                    className={`border-b border-slate-300 py-4 outline-none ${
                      fieldErrors.mediaConsent ? "rounded-md border border-red-300 bg-red-50 p-3" : ""
                    }`}
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      {[
                        ["yes", "Yes, media use is approved"],
                        ["no", "No, media consent is declined"]
                      ].map(([value, label]) => (
                        <label key={value} className={`flex items-center gap-3 text-sm font-semibold ${fieldErrors.mediaConsent ? "text-red-700" : "text-navy"}`}>
                          <input
                            className="h-4 w-4 border-slate-400 text-electric"
                            type="radio"
                            name="mediaConsent"
                            checked={fields.mediaConsent === value}
                            onChange={() => setField("mediaConsent", value)}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    {fieldErrorMessage("mediaConsent")}
                  </div>

                  <h4 className="mt-5 text-sm font-black uppercase tracking-wide text-navy">Electronic Agreement & Signature</h4>
                  <div className="mt-3 rounded-md border border-slate-300 bg-white p-4 text-sm font-semibold leading-6 text-slate-700">
                    <p>{refundCancellationReminder}</p>
                  </div>
                  <label
                    className={`mt-3 flex items-start gap-3 rounded-md text-sm font-semibold leading-6 ${
                      fieldErrors.waiverAgreement ? "border border-red-300 bg-red-50 p-3 text-red-700" : "text-slate-700"
                    }`}
                  >
                    <input
                      data-booking-field="waiverAgreement"
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-electric"
                      checked={fields.waiverAgreement}
                      type="checkbox"
                      onChange={(event) => setField("waiverAgreement", event.target.checked)}
                    />
                    <span>
                      I have read and understand the Elite Soccer Training CV waiver, including assumption of risk, release
                      of liability, medical authorization, media consent selection, cancellation policy,
                      parent/guardian responsibility, California governing law, and electronic signature consent.
                    </span>
                  </label>
                  {fieldErrorMessage("waiverAgreement")}

                  <label className={`mt-5 grid gap-2 text-xs font-bold uppercase tracking-wide ${fieldErrors.guardianSignature ? "text-red-700" : "text-navy"}`}>
                    Parent/Guardian Digital Signature
                    <input
                      data-booking-field="guardianSignature"
                      className={fieldInputClass(
                        "guardianSignature",
                        "field-focus w-full border-0 border-b border-slate-400 bg-transparent px-0 py-3 text-base font-semibold text-slate-900 placeholder:text-slate-400"
                      )}
                      value={fields.guardianSignature}
                      onChange={(event) => setField("guardianSignature", event.target.value)}
                      placeholder="Type parent/guardian full legal name"
                      aria-invalid={Boolean(fieldErrors.guardianSignature)}
                    />
                    {fieldErrorMessage("guardianSignature")}
                  </label>

                  <div className="mt-5 grid gap-2 text-xs font-bold uppercase tracking-wide text-navy">
                    Optional Drawn Signature
                    <SignaturePad />
                  </div>

                  <div className="mt-5 grid gap-2 border-t border-slate-300 pt-3 text-[11px] font-bold uppercase text-slate-500 sm:grid-cols-2">
                    <p>Waiver version {waiverVersion}</p>
                    <p>Date / Timestamp: saved automatically when payment is submitted</p>
                  </div>
                </section>
              </div>
            </article>

            <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 sm:flex-row">
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
                Continue To Secure Payment
              </button>
            </div>
          </section>
        ) : null}

        {step === "payment" ? (
          <section className="grid gap-6 p-5 sm:p-8 lg:grid-cols-[0.9fr_1.1fr]">
            <aside className="rounded-lg border border-slate-200 bg-mist p-5">
              <ShieldIcon className="h-9 w-9 text-electric" />
              <p className="mt-4 text-sm font-black uppercase text-electric">Step 3</p>
              <h3 className="mt-2 text-2xl font-black text-navy">
                {usesExistingPass ? "Parent waiver + Launch Pass credit" : "Parent waiver + secure payment"}
              </h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                {usesExistingPass
                  ? "Your paid Launch Pass credit will reserve this session after the waiver."
                  : "Secure online payment is completed after the waiver."}
              </p>
              {selectedSlot ? (
                <div className="mt-5 rounded-md bg-white p-4 text-sm text-slate-700">
                  <p className="font-black text-navy">{selectedSlot.dateLabel} at {selectedSlot.startTime}</p>
                  <p>{usesExistingPass ? "1 player using Launch Pass credit" : `${fields.players} player(s) attending`}</p>
                  <p>{bookingGroup?.name ?? "Selected training group"}</p>
                  <p className="mt-2 text-xs font-bold uppercase text-slate-500">{groupSizeMessage}</p>
                  <p className="mt-3 border-t border-slate-200 pt-3 font-black text-navy">
                    {usesExistingPass ? "Payment: Launch Pass credit" : `${fields.players} x ${sessionPriceLabel} = ${paymentTotal}`}
                  </p>
                </div>
              ) : null}
            </aside>

            <div className="grid gap-5 rounded-lg border border-slate-200 bg-white p-5" data-stripe-checkout-ready="true">
              {creditBookingSuccess ? (
                <div className="rounded-md border border-field/20 bg-field/10 p-5">
                  <p className="text-sm font-black uppercase text-field">Session Confirmed</p>
                  <h3 className="mt-2 text-2xl font-black text-navy">Booked with Launch Pass credit.</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-700">
                    Confirmation details were sent by email. Booking ID: {creditBookingSuccess.bookingId}
                  </p>
                  {typeof creditBookingSuccess.remainingCredits === "number" ? (
                    <p className="mt-2 text-sm font-black text-navy">
                      Remaining Launch Pass credits: {creditBookingSuccess.remainingCredits}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div className="rounded-md border border-slate-200 bg-mist p-5">
                <p className="text-sm font-black uppercase text-electric">
                  {usesExistingPass ? "Confirm Booking" : "Confirm & Pay"}
                </p>
                <div className="mt-4 grid gap-3 text-sm text-slate-700">
                  <div className="flex items-center justify-between gap-4">
                    <span>
                      {usesExistingPass ? "Elite Soccer Training CV - Launch Pass Credit" : "Elite Soccer Training CV - Single Session"}
                    </span>
                    <span className="font-black text-navy">{usesExistingPass ? "1 credit" : sessionPriceLabel}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span>Players attending</span>
                    <span className="font-black text-navy">{usesExistingPass ? "1" : fields.players}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4 border-t border-slate-300 pt-3 text-base">
                    <span className="font-black text-navy">{usesExistingPass ? "Payment" : "Total Due"}</span>
                    <span className="font-black text-navy">{paymentTotal}</span>
                  </div>
                </div>
              </div>
              {usesExistingPass ? (
                <p className="text-sm leading-6 text-slate-600">
                  No card payment is collected for this booking because one Launch Pass credit will be used.
                </p>
              ) : (
                <>
                  <p className="text-sm leading-6 text-slate-600">
                    Secure online payment is completed after the waiver.
                  </p>
                  <p className="text-sm font-semibold leading-6 text-slate-600">
                    Have a promo code? You'll be able to enter it securely during checkout.
                  </p>
                </>
              )}
              <div className="rounded-md border border-electric/20 bg-blue-50 p-4 text-sm leading-6 text-slate-700">
                <p className="font-black uppercase text-navy">Arrival Reminder</p>
                <p className="mt-2">{bookingArrivalInstructions.join(" ")}</p>
              </div>
              <p className="rounded-md border border-slate-200 bg-mist p-4 text-sm font-bold leading-6 text-slate-700">
                {refundCancellationReminder}
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={() => setStep("waiver")} className="rounded-md border border-slate-300 px-6 py-3 text-sm font-black text-navy">
                  Back
                </button>
                <button
                  type="button"
                  onClick={usesExistingPass ? confirmWithLaunchPassCredit : startStripeCheckout}
                  disabled={isSubmitting || Boolean(creditBookingSuccess)}
                  className="rounded-md bg-electric px-6 py-3 text-sm font-black uppercase text-white shadow-lg shadow-electric/25 disabled:cursor-wait disabled:opacity-70"
                >
                  {usesExistingPass
                    ? isSubmitting
                      ? "Confirming..."
                      : creditBookingSuccess
                        ? "Confirmed"
                        : "Confirm Booking"
                    : isSubmitting
                      ? "Opening Secure Payment..."
                      : "Confirm & Pay"}
                </button>
              </div>
            </div>
          </section>
        ) : null}

      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarIcon, ShieldIcon } from "./Icons";
import { PrivateSessionRequestForm } from "./PrivateSessionRequestForm";
import { SignaturePad } from "./SignaturePad";
import {
  getTrainingGroup,
  isAgeInGroup,
  slotCapacity,
  trainingGroups,
  type BookingRecord,
  type TrainingGroupId
} from "@/lib/booking-data";
import type {
  PublicAvailablePrivateSession,
  PublicAvailabilityDebugResponse,
  PublicAvailabilityResponse,
  PublicAvailableSession
} from "@/lib/public-availability";
import {
  bookingArrivalInstructions,
  business,
  groupSizeMessage,
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
const activeBookingGroupId: TrainingGroupId = "elite-performance";

type BookingStep = "program" | "session" | "details" | "waiver" | "payment";
type BookingOption = "single_session" | LaunchPassType | "use_existing_pass" | "private_session" | "private_request";
type LaunchPassUseMode = "choose_now" | "choose_later";

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
  marketingOptIn: boolean;
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
  guardianSignature: "",
  marketingOptIn: false
};

type StripeCheckoutResult = {
  checkoutUrl?: string;
  sessionId?: string;
  error?: string;
};

type PrivateSessionCheckoutResult = StripeCheckoutResult & {
  status?: "zelle_pending";
  message?: string;
  zellePhone?: string;
  memo?: string;
  amountDue?: number;
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

type LaunchPassBookingDetails = {
  notes: string;
  medicalNotes: string;
  emergencyName: string;
  emergencyPhone: string;
  guardianSignature: string;
  waiverAccepted: boolean;
  waiverAcceptedAt: string;
  mediaConsent: "Granted" | "Declined";
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

async function createPrivateSessionCheckout(payload: {
  privateSessionId: string;
  playerName: string;
  playerAge: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  paymentMethod: "card" | "zelle";
  notes: string;
  medicalNotes: string;
  emergencyName: string;
  emergencyPhone: string;
  guardianSignature: string;
  waiverAccepted: boolean;
  mediaConsent: "Granted" | "Declined";
  marketingOptIn: boolean;
}) {
  try {
    const response = await fetch("/api/private-sessions/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const result = (await response.json()) as PrivateSessionCheckoutResult;

    if (!response.ok) {
      return {
        error: result.error ?? "Private session payment could not be started."
      } satisfies PrivateSessionCheckoutResult;
    }

    return result;
  } catch {
    return {
      error: "Private session payment could not be reached. Please try again."
    } satisfies PrivateSessionCheckoutResult;
  }
}

async function createLaunchPassCheckout(
  passType: LaunchPassType,
  fields: PassPurchaseFields,
  selectedSessionIds: string[] = [],
  bookingDetails?: LaunchPassBookingDetails,
  marketingOptIn = false
) {
  try {
    const response = await fetch("/api/stripe/pass-checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...fields,
        passType,
        selectedSessionIds,
        bookingDetails,
        marketingOptIn
      })
    });
    const result = (await response.json()) as StripeCheckoutResult & { passPurchaseId?: string };

    if (!response.ok) {
      return {
        error: result.error ?? "Training Package payment could not be started."
      };
    }

    return result;
  } catch {
    return {
      error: "Training Package payment could not be reached. Please try again."
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
        error: result.error ?? "Training credits could not be checked."
      };
    }

    return {
      passes: result.passes ?? [],
      error: ""
    };
  } catch {
    return {
      passes: [],
      error: "Training credits could not be reached. Please try again."
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
        error: result.error ?? "Training credit could not be used."
      };
    }

    return result;
  } catch {
    return {
      error: "Training credit could not be reached. Please try again."
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

function sessionFocusTitle(slot: Pick<PublicAvailableSession, "trainingGroup"> & Partial<Pick<PublicAvailableSession, "trainingGroupAges">>) {
  return "Small Group Training";
}

const smallGroupAgeRestrictionMessage =
  "This small group session is currently recommended for older players. Please submit a private training request and Coach Hugo will follow up with availability.";

function sessionTimeRange(slot: PublicAvailableSession) {
  return `${slot.startTime}-${slot.endTime}`;
}

function privateSessionTimeRange(slot: PublicAvailablePrivateSession) {
  return `${slot.startTime}-${slot.endTime}`;
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

function bookingOptionFromTypeParam(value: string | null): BookingOption | null {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  if (normalized === "single") {
    return "single_session";
  }

  if (normalized === "4-pass") {
    return "four_session_launch_pass";
  }

  if (normalized === "6-pass") {
    return "six_session_launch_pass";
  }

  if (normalized === "private" || normalized === "private-request" || normalized === "1-on-1") {
    return "private_request";
  }

  if (normalized === "private-session" || normalized === "private-booking") {
    return "single_session";
  }

  return null;
}

export function BookingForm() {
  const [step, setStep] = useState<BookingStep>("program");
  const [bookingOption, setBookingOption] = useState<BookingOption>("single_session");
  const [apiSessions, setApiSessions] = useState<PublicAvailableSession[]>([]);
  const [apiPrivateSessions, setApiPrivateSessions] = useState<PublicAvailablePrivateSession[]>([]);
  const [availabilityStatus, setAvailabilityStatus] = useState("Loading");
  const [availabilityError, setAvailabilityError] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<TrainingGroupId | "">("");
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [selectedPrivateSessionId, setSelectedPrivateSessionId] = useState("");
  const [selectedSessionDate, setSelectedSessionDate] = useState("");
  const [visibleMonth, setVisibleMonth] = useState("");
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
    trainingGroup: activeBookingGroupId
  });
  const [passLookupFields, setPassLookupFields] = useState<PassLookupFields>({
    parentEmail: "",
    playerName: ""
  });
  const [launchPassUseMode, setLaunchPassUseMode] = useState<LaunchPassUseMode>("choose_later");
  const [selectedPassSessionIds, setSelectedPassSessionIds] = useState<string[]>([]);
  const [foundPasses, setFoundPasses] = useState<LaunchPassSummary[]>([]);
  const [selectedPassId, setSelectedPassId] = useState("");
  const [passNotice, setPassNotice] = useState("");
  const [creditBookingSuccess, setCreditBookingSuccess] = useState<{
    bookingId: string;
    remainingCredits?: number;
  } | null>(null);
  const [privatePaymentMethod, setPrivatePaymentMethod] = useState<"card" | "zelle">("card");
  const [privateBookingSuccess, setPrivateBookingSuccess] = useState<PrivateSessionCheckoutResult | null>(null);
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
        setApiPrivateSessions([]);
        setAvailabilityStatus("Failed");
        setAvailabilityError("Availability could not be loaded.");
        return;
      }

      setApiSessions(result.sessions);
      setApiPrivateSessions(result.privateSessions ?? []);
      setAvailabilityStatus(result.status);
      setAvailabilityError(result.message ?? "");
      setSelectedSlotId("");
      setSelectedPrivateSessionId("");
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

    const searchParams = new URLSearchParams(window.location.search);
    const directBookingOption = bookingOptionFromTypeParam(searchParams.get("type"));
    const shouldShowDebug = searchParams.get("debugAvailability") === "1";

    if (directBookingOption) {
      selectBookingOption(directBookingOption);
    }

    setShowAvailabilityDebug(shouldShowDebug);

    if (shouldShowDebug) {
      void readAvailabilityDebug().then(setAvailabilityDebug);
    }
  }, []);

  const availableSessions = useMemo(
    () => apiSessions.filter((session) => session.trainingGroupId === activeBookingGroupId),
    [apiSessions]
  );
  const availablePrivateSessions = useMemo(() => apiPrivateSessions, [apiPrivateSessions]);
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
  const selectedLaunchPassOption = isPassPurchaseOption ? getLaunchPassOption(bookingOption as LaunchPassType) : null;
  const passPurchaseAvailableSessions = useMemo(
    () => apiSessions.filter((session) => session.trainingGroupId === activeBookingGroupId),
    [apiSessions]
  );
  const selectedPassSessions = useMemo(
    () =>
      selectedPassSessionIds
        .map((sessionId) => apiSessions.find((session) => session.id === sessionId))
        .filter((session): session is PublicAvailableSession => Boolean(session)),
    [apiSessions, selectedPassSessionIds]
  );
  const selectedPassCreditLimit = selectedLaunchPassOption?.credits ?? 0;

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
    if (!selectedPrivateSessionId) {
      return;
    }

    if (!availablePrivateSessions.some((slot) => slot.id === selectedPrivateSessionId)) {
      setSelectedPrivateSessionId("");
    }
  }, [availablePrivateSessions, selectedPrivateSessionId]);

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

  useEffect(() => {
    if (!isPassPurchaseOption) {
      return;
    }

    setSelectedPassSessionIds((current) =>
      current
        .filter((sessionId) => {
          const session = apiSessions.find((item) => item.id === sessionId);

          return session?.trainingGroupId === activeBookingGroupId;
        })
        .slice(0, selectedPassCreditLimit || current.length)
    );
  }, [apiSessions, isPassPurchaseOption, selectedPassCreditLimit]);

  const selectedSlot = availableSessions.find((slot) => slot.id === selectedSlotId);
  const selectedPrivateSession = availablePrivateSessions.find((slot) => slot.id === selectedPrivateSessionId);
  const selectedGroup = getTrainingGroup(activeBookingGroupId);
  const bookingGroup = selectedSlot ? getTrainingGroup(selectedSlot.trainingGroupId) : selectedGroup;
  const displaySlot = selectedSlot;
  const isPrivateSessionOption = bookingOption === "private_session";
  const isPrivateSessionBooking = isPrivateSessionOption || Boolean(selectedPrivateSession);
  const publicStepNumber = step === "program" || step === "session" ? 1 : step === "details" ? 2 : 3;
  const publicStepLabel = publicStepLabels[publicStepNumber - 1];
  const progressWidth = `${(publicStepNumber / publicStepLabels.length) * 100}%`;
  const selectedRemainingSpots = selectedSlot ? selectedSlot.remainingSpots : slotCapacity;
  const playerOptions = usesExistingPass
    ? [1]
    : isPrivateSessionBooking
      ? [1]
    : Array.from({ length: Math.max(1, Math.min(slotCapacity, selectedRemainingSpots)) }, (_, index) => index + 1);
  const paymentTotal = usesExistingPass
    ? "Training credit"
    : isPrivateSessionBooking
      ? formatCurrencyFromCents(getSessionTotalCents("1"))
      : formatCurrencyFromCents(getSessionTotalCents(fields.players));
  const paidSessionSummaryLabel = isPrivateSessionBooking
    ? "Elite Soccer Training CV - Private Session"
    : "Elite Soccer Training CV - Single Session";

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
    setSelectedGroupId(groupId);
    setSelectedSlotId("");
    setSelectedSessionDate("");
    setVisibleMonth("");
    clearFieldError("session");
    setError("");
  }

  function selectBookingOption(option: BookingOption) {
    setBookingOption(option);
    setSelectedSlotId("");
    setSelectedPrivateSessionId("");
    setSelectedSessionDate("");
    setVisibleMonth("");
    setFieldErrors({});
    setPassNotice("");
    setCreditBookingSuccess(null);
    setPrivateBookingSuccess(null);
    setSelectedPassSessionIds([]);
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

    if (option === "private_request") {
      setSelectedGroupId("");
      setSelectedPassId("");
      setFoundPasses([]);
      return;
    }

    if (option === "private_session") {
      setSelectedGroupId("");
      setSelectedPassId("");
      setFoundPasses([]);
      setFields((current) => ({ ...current, players: "1" }));
      return;
    }

    setSelectedGroupId(activeBookingGroupId);
    setLaunchPassUseMode("choose_later");
  }

  function setPassPurchaseField(field: keyof PassPurchaseFields, value: string) {
    setPassPurchaseFields((current) => ({ ...current, [field]: value }));
    if (field === "trainingGroup") {
      setSelectedPassSessionIds([]);
    }
    setError("");
  }

  function setPassLookupField(field: keyof PassLookupFields, value: string) {
    setPassLookupFields((current) => ({ ...current, [field]: value }));
    setError("");
    setPassNotice("");
  }

  function togglePassSession(sessionId: string) {
    setSelectedPassSessionIds((current) => {
      if (current.includes(sessionId)) {
        return current.filter((id) => id !== sessionId);
      }

      if (selectedPassCreditLimit && current.length >= selectedPassCreditLimit) {
        setError(`Choose up to ${selectedPassCreditLimit} sessions for this Training Package.`);
        return current;
      }

      setError("");
      return [...current, sessionId];
    });
  }

  async function startLaunchPassCheckout() {
    if (bookingOption !== "four_session_launch_pass" && bookingOption !== "six_session_launch_pass") {
      return;
    }

    const needsSelectedSessions = launchPassUseMode === "choose_now";

    if (
      !passPurchaseFields.parentName.trim() ||
      !passPurchaseFields.parentEmail.trim() ||
      !isValidEmailAddress(passPurchaseFields.parentEmail) ||
      !passPurchaseFields.parentPhone.trim() ||
      !passPurchaseFields.playerName.trim() ||
      !passPurchaseFields.playerAge.trim()
    ) {
      setError("Complete all Training Package purchase fields before continuing to payment.");
      return;
    }

    const passPlayerAge = Number(passPurchaseFields.playerAge);

    if (!Number.isInteger(passPlayerAge)) {
      setError("Enter a valid whole-number player age before continuing.");
      return;
    }

    if (needsSelectedSessions) {
      if (passPlayerAge < 13) {
        setError(smallGroupAgeRestrictionMessage);
        return;
      }

      if (selectedPassSessionIds.length === 0) {
        setError("Choose at least one session, or select choose dates later.");
        return;
      }

      if (selectedPassSessionIds.length > selectedPassCreditLimit) {
        setError(`Choose no more than ${selectedPassCreditLimit} sessions for this Training Package.`);
        return;
      }

      if (
        !fields.emergencyName.trim() ||
        !fields.emergencyPhone.trim() ||
        !fields.medicalNotes.trim() ||
        !fields.mediaConsent ||
        !fields.waiverAgreement ||
        !fields.guardianSignature.trim()
      ) {
        setError("Complete the emergency details and signed waiver before checkout.");
        return;
      }
    }

    setIsSubmitting(true);
    setError("");

    const checkout = await createLaunchPassCheckout(
      bookingOption,
      passPurchaseFields,
      needsSelectedSessions ? selectedPassSessionIds : [],
      needsSelectedSessions
        ? {
            notes: fields.notes,
            medicalNotes: fields.medicalNotes,
            emergencyName: fields.emergencyName,
            emergencyPhone: fields.emergencyPhone,
            guardianSignature: fields.guardianSignature,
            waiverAccepted: fields.waiverAgreement,
            waiverAcceptedAt: new Date().toISOString(),
            mediaConsent: fields.mediaConsent === "yes" ? "Granted" : "Declined"
          }
        : undefined,
      fields.marketingOptIn
    );

    if (!checkout.checkoutUrl) {
      setIsSubmitting(false);
      setError(checkout.error ?? "Training Package payment could not be started. Please try again.");
      return;
    }

    window.location.href = checkout.checkoutUrl;
  }

  async function checkLaunchPassCredits() {
    if (!passLookupFields.parentEmail.trim() || !passLookupFields.playerName.trim()) {
      setError("Enter the parent email and player name tied to the Training Package.");
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
      setPassNotice("No active Training credits were found for this player.");
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
    setPassNotice(`${firstPass.remainingCredits} Training credit(s) available for ${firstPass.playerName}.`);
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
    setPassNotice(`${pass.remainingCredits} Training credit(s) available for ${pass.playerName}.`);
  }

  function requireSchedule() {
    if (isPrivateSessionBooking) {
      if (!selectedPrivateSession) {
        applyFieldErrors(
          { session: "Select an available private session time before continuing." },
          "Choose an available private session time before continuing."
        );
        return false;
      }

      clearFieldError("session");
      setError("");
      return true;
    }

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
      } else if (!isPrivateSessionBooking && bookingGroup && !isAgeInGroup(playerAge, bookingGroup.id)) {
        nextErrors.playerAge = smallGroupAgeRestrictionMessage;
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
    } else if (isPrivateSessionBooking && playerCount !== 1) {
      nextErrors.players = "Private sessions are booked for one player at a time.";
    } else if (!isPrivateSessionBooking && (!selectedSlot || !Number.isInteger(playerCount) || playerCount < 1 || playerCount > selectedSlot.remainingSpots)) {
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
      programName: sessionFocusTitle(slot),
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
      passPurchaseId: selectedPass?.id,
      marketingOptIn: fields.marketingOptIn
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
      latestSlot.trainingGroupId !== activeBookingGroupId ||
      !Number.isInteger(requestedPlayers) ||
      requestedPlayers < 1 ||
      requestedPlayers > latestRemainingSpots
    ) {
      setApiSessions(latestAvailability?.sessions ?? []);
      setAvailabilityStatus(latestAvailability?.status ?? "Failed");
      setAvailabilityError(latestAvailability?.message ?? "");
      setStep("session");
      setError("That session is no longer available for this booking option. Please choose another available time.");
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

  async function startPrivateSessionCheckout() {
    if (!selectedPrivateSession) {
      setStep("session");
      setError("That private session time is no longer available. Please choose another time.");
      return;
    }

    const latestAvailability = await readAvailableSessions();
    const latestPrivateSlot = latestAvailability?.privateSessions?.find((slot) => slot.id === selectedPrivateSession.id);

    if (!latestPrivateSlot) {
      setApiSessions(latestAvailability?.sessions ?? []);
      setApiPrivateSessions(latestAvailability?.privateSessions ?? []);
      setAvailabilityStatus(latestAvailability?.status ?? "Failed");
      setAvailabilityError(latestAvailability?.message ?? "");
      setStep("session");
      setError("That private session time is no longer available. Please choose another time.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    const checkout = await createPrivateSessionCheckout({
      privateSessionId: latestPrivateSlot.id,
      playerName: fields.playerName,
      playerAge: fields.playerAge,
      parentName: fields.parentName,
      parentEmail: fields.email,
      parentPhone: fields.phone,
      paymentMethod: privatePaymentMethod,
      notes: fields.notes,
      medicalNotes: fields.medicalNotes,
      emergencyName: fields.emergencyName,
      emergencyPhone: fields.emergencyPhone,
      guardianSignature: fields.guardianSignature,
      waiverAccepted: fields.waiverAgreement,
      mediaConsent: fields.mediaConsent === "yes" ? "Granted" : "Declined",
      marketingOptIn: fields.marketingOptIn
    });

    if (checkout.status === "zelle_pending") {
      setIsSubmitting(false);
      setPrivateBookingSuccess(checkout);
      void readAvailableSessions().then((next) => {
        if (next) {
          setApiSessions(next.sessions);
          setApiPrivateSessions(next.privateSessions ?? []);
        }
      });
      return;
    }

    if (!checkout.checkoutUrl) {
      setIsSubmitting(false);
      setError(checkout.error ?? "Private session payment could not be started. Please try again.");
      return;
    }

    window.location.href = checkout.checkoutUrl;
  }

  async function confirmWithLaunchPassCredit() {
    if (!selectedPass || !selectedSlot) {
      setStep("session");
      setError("Choose an active Training Package and an available session before confirming.");
      return;
    }

    const latestAvailability = await readAvailableSessions();
    const latestSlot = latestAvailability?.sessions.find((slot) => slot.id === selectedSlot.id);

    if (!latestSlot || latestSlot.trainingGroupId !== selectedPass.trainingGroup || latestSlot.remainingSpots < 1) {
      setApiSessions(latestAvailability?.sessions ?? []);
      setAvailabilityStatus(latestAvailability?.status ?? "Failed");
      setAvailabilityError(latestAvailability?.message ?? "");
      setStep("session");
      setError("That session is no longer available for this Training Package. Please choose another open time.");
      return;
    }

    const booking = buildBookingPayload(latestSlot, "launch_pass_credit");

    setIsSubmitting(true);
    setError("");

    const result = await redeemLaunchPassCredit(selectedPass.id, booking);

    if (!result.bookingId) {
      setIsSubmitting(false);
      setError(result.error ?? "Training credit could not be used. Please try again.");
      return;
    }

    setIsSubmitting(false);
    setCreditBookingSuccess({
      bookingId: result.bookingId,
      remainingCredits: result.remainingCredits
    });
    setPassNotice("Your session is confirmed using a Training credit.");
    void readAvailableSessions().then((next) => {
      if (next) {
        setApiSessions(next.sessions);
        setApiPrivateSessions(next.privateSessions ?? []);
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
                {isPrivateSessionBooking
                  ? "Private session booking with parent waiver and secure payment."
                  : `60-minute small group soccer training for 1-6 players. ${groupSizeMessage}`}
              </p>
            </div>
            {displaySlot ? (
              <div className="rounded-lg border border-white/15 bg-white/10 p-4 text-sm">
                <p className="font-black text-white">Selected Session</p>
                <p className="mt-1 text-slate-200">
                  {displaySlot.dateLabel} at {sessionTimeRange(displaySlot)}
                </p>
                <p className="mt-1 text-slate-300">{displaySlot.duration}</p>
                <p className="mt-2 text-xs font-bold uppercase text-electric">{groupSizeMessage}</p>
              </div>
            ) : null}
            {selectedPrivateSession ? (
              <div className="rounded-lg border border-white/15 bg-white/10 p-4 text-sm">
                <p className="font-black text-white">Selected Private Session</p>
                <p className="mt-1 text-slate-200">
                  {selectedPrivateSession.dateLabel} at {privateSessionTimeRange(selectedPrivateSession)}
                </p>
                <p className="mt-1 text-slate-300">{selectedPrivateSession.duration}</p>
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
                Choose a booking option. Single Session can include available small group or public private session times.
              </p>
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              {[
                ["single_session", "Single Session", "$55", "Book one training session"],
                [
                  "four_session_launch_pass",
                  "4-Session Training Package",
                  "$200",
                  "Buy 4 training credits"
                ],
                [
                  "six_session_launch_pass",
                  "6-Session Training Package",
                  "$285",
                  "Buy 6 training credits"
                ]
              ].map(([value, title, price, description]) => {
                const isSelected = bookingOption === value;

                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => selectBookingOption(value as BookingOption)}
                    className={`rounded-lg border p-4 text-left transition sm:p-5 ${
                      isSelected ? "border-navy bg-navy text-white shadow-xl shadow-navy/15" : "border-slate-200 bg-white text-navy hover:border-electric"
                    }`}
                  >
                    <span className={`block text-xs font-black uppercase ${isSelected ? "text-electric" : "text-slate-500"}`}>{price}</span>
                    <span className="mt-2 block text-lg font-black">{title}</span>
                    <span className="mt-1 block text-sm leading-6 opacity-80">{description}</span>
                  </button>
                );
              })}
            </div>

            <div>
              <button
                type="button"
                onClick={() => selectBookingOption("use_existing_pass")}
                className={`rounded-md border px-4 py-3 text-left text-sm font-black transition ${
                  usesExistingPass
                    ? "border-navy bg-navy text-white"
                    : "border-electric/40 bg-blue-50 text-electric hover:border-electric hover:bg-white"
                }`}
              >
                Already have training credits? Reserve with existing credits.
              </button>
            </div>

            {bookingOption === "private_request" ? (
              <div className="rounded-lg border border-slate-200 bg-mist p-5">
                <PrivateSessionRequestForm embedded />
              </div>
            ) : isPassPurchaseOption ? (
              <div className="grid gap-5 rounded-lg border border-slate-200 bg-mist p-5">
                <div>
                  <p className="text-xs font-black uppercase text-electric">{getLaunchPassOption(bookingOption as LaunchPassType).price}</p>
                  <h4 className="mt-2 text-2xl font-black text-navy">{getLaunchPassOption(bookingOption as LaunchPassType).title}</h4>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {getLaunchPassOption(bookingOption as LaunchPassType).description} Credits are tied to the parent email and player name entered here.
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
                    Training Plan
                    <input className={inputClass} value="EST CV Training Sessions" readOnly />
                  </label>
                  <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm font-semibold leading-6 text-slate-700 sm:col-span-2">
                    <input
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-electric"
                      type="checkbox"
                      checked={fields.marketingOptIn}
                      onChange={(event) => setField("marketingOptIn", event.target.checked)}
                    />
                    <span>Yes, I&apos;d like to receive EST CV training schedules, updates, and special offers by email.</span>
                  </label>
                </div>
                <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4">
                  <div>
                    <p className="text-xs font-black uppercase text-electric">How would you like to use your package?</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Choose sessions now, or buy the package first and come back later to use the credits.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      ["choose_now", "Choose session dates now", "Reserve up to your training credits after payment."],
                      ["choose_later", "Choose session dates later", "Keep all credits available for future booking."]
                    ].map(([value, title, description]) => {
                      const isSelected = launchPassUseMode === value;

                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            setLaunchPassUseMode(value as LaunchPassUseMode);
                            setError("");
                          }}
                          className={`rounded-lg border p-4 text-left transition ${
                            isSelected
                              ? "border-navy bg-navy text-white shadow-lg shadow-navy/15"
                              : "border-slate-200 bg-mist text-navy hover:border-electric"
                          }`}
                        >
                          <span className={`block text-sm font-black ${isSelected ? "text-white" : "text-navy"}`}>{title}</span>
                          <span className="mt-2 block text-sm leading-6 opacity-80">{description}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {launchPassUseMode === "choose_now" ? (
                  <div className="grid gap-5 rounded-lg border border-slate-200 bg-white p-4">
                    <div>
                      <p className="text-xs font-black uppercase text-electric">Select Sessions</p>
                      <h5 className="mt-2 text-xl font-black text-navy">Choose up to {selectedPassCreditLimit} sessions</h5>
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        You may choose fewer now and use the remaining credits later.
                      </p>
                    </div>

                    {passPurchaseAvailableSessions.length > 0 ? (
                      <div className="grid max-h-[28rem] gap-3 overflow-y-auto pr-1">
                        {passPurchaseAvailableSessions.map((slot) => {
                          const isSelected = selectedPassSessionIds.includes(slot.id);

                          return (
                            <button
                              key={slot.id}
                              type="button"
                              onClick={() => togglePassSession(slot.id)}
                              className={`rounded-lg border p-4 text-left transition ${
                                isSelected
                                  ? "border-navy bg-navy text-white shadow-lg shadow-navy/15"
                                  : "border-slate-200 bg-mist text-navy hover:border-electric"
                              }`}
                            >
                              <span className={`block text-xs font-black uppercase ${isSelected ? "text-electric" : "text-slate-500"}`}>
                                {slot.dayLabel}, {slot.dateLabel}
                              </span>
                              <span className="mt-1 block text-2xl font-black">{sessionTimeRange(slot)}</span>
                              <span className="mt-2 block text-sm font-bold opacity-90">
                                Small Group Training
                              </span>
                              <span
                                className={`mt-3 block rounded-md border px-3 py-2 text-xs font-black uppercase ${
                                  isSelected
                                    ? "border-white/20 bg-white/10 text-white"
                                    : "border-electric/20 bg-blue-50 text-electric"
                                }`}
                              >
                                {sessionFocusTitle(slot)}
                              </span>
                              <span className="mt-1 block text-sm font-semibold opacity-80">
                                {sessionLocationLines(slot.location).map((line) => (
                                  <span key={line} className="block">{line}</span>
                                ))}
                              </span>
                              <span className="mt-3 block text-xs font-black uppercase text-electric">{spotsLabel(slot.remainingSpots)}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="rounded-md bg-mist p-4 text-sm font-bold text-slate-600">
                        No open sessions are available for this training group right now.
                      </p>
                    )}

                    <div className="rounded-md bg-mist p-4 text-sm font-bold text-slate-700">
                      <p>{selectedPassSessionIds.length} selected / {selectedPassCreditLimit} included</p>
                      <p className="mt-1">
                        Credits left for later after checkout: {Math.max(0, selectedPassCreditLimit - selectedPassSessionIds.length)}
                      </p>
                      {selectedPassSessions.length > 0 ? (
                        <div className="mt-3 grid gap-1 font-semibold">
                          {selectedPassSessions.map((slot) => (
                            <p key={slot.id}>
                              {slot.dateLabel} at {sessionTimeRange(slot)} - {sessionFocusTitle(slot)}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="grid gap-2 text-sm font-bold text-navy">
                        Emergency Contact Name
                        <input className={inputClass} value={fields.emergencyName} onChange={(event) => setField("emergencyName", event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-bold text-navy">
                        Emergency Contact Phone
                        <input className={inputClass} type="tel" value={fields.emergencyPhone} onChange={(event) => setField("emergencyPhone", event.target.value)} />
                      </label>
                      <label className="grid gap-2 text-sm font-bold text-navy sm:col-span-2">
                        Notes
                        <textarea
                          className={`${inputClass} min-h-20 resize-y`}
                          value={fields.notes}
                          onChange={(event) => setField("notes", event.target.value)}
                          placeholder="Optional notes for Coach Hugo"
                        />
                      </label>
                      <label className="grid gap-2 text-sm font-bold text-navy sm:col-span-2">
                        Medical Notes/Injuries
                        <textarea
                          className={`${inputClass} min-h-24 resize-y`}
                          value={fields.medicalNotes}
                          onChange={(event) => setField("medicalNotes", event.target.value)}
                          placeholder="Share medical conditions, allergies, injuries, or type None"
                        />
                      </label>
                    </div>

                    <div className="rounded-lg border border-slate-300 bg-[#fffdf8] p-4 text-sm leading-6 text-slate-700">
                      <p className="text-xs font-black uppercase text-electric">Parent Waiver</p>
                      <h5 className="mt-2 font-black text-navy">Elite Soccer Training CV Participation Waiver & Release of Liability</h5>
                      <div className="mt-4 max-h-72 overflow-y-auto border-y border-slate-200 py-3">
                        {waiverSections.map((section) => (
                          <section key={section.title} className="py-3">
                            <h6 className="font-black uppercase tracking-wide text-navy">{section.title}</h6>
                            <p className="mt-1">{section.copy}</p>
                          </section>
                        ))}
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {[
                          ["yes", "Yes, media use is approved"],
                          ["no", "No, media consent is declined"]
                        ].map(([value, label]) => (
                          <label key={value} className="flex items-center gap-3 font-semibold text-navy">
                            <input
                              className="h-4 w-4 border-slate-400 text-electric"
                              type="radio"
                              name="launchPassMediaConsent"
                              checked={fields.mediaConsent === value}
                              onChange={() => setField("mediaConsent", value)}
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                      <label className="mt-4 flex items-start gap-3 font-semibold text-slate-700">
                        <input
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-electric"
                          checked={fields.waiverAgreement}
                          type="checkbox"
                          onChange={(event) => setField("waiverAgreement", event.target.checked)}
                        />
                        <span>I have read and agree to the Elite Soccer Training CV waiver for the selected Training Package sessions.</span>
                      </label>
                      <label className="mt-4 grid gap-2 text-xs font-bold uppercase tracking-wide text-navy">
                        Parent/Guardian Digital Signature
                        <input
                          className="field-focus w-full border-0 border-b border-slate-400 bg-transparent px-0 py-3 text-base font-semibold text-slate-900 placeholder:text-slate-400"
                          value={fields.guardianSignature}
                          onChange={(event) => setField("guardianSignature", event.target.value)}
                          placeholder="Type parent/guardian full legal name"
                        />
                      </label>
                    </div>
                  </div>
                ) : (
                  <p className="rounded-md bg-white p-4 text-sm font-bold leading-6 text-slate-700">
                    You will receive instructions by email after payment. No session spots are reserved until credits are used.
                  </p>
                )}

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => void startLaunchPassCheckout()}
                  className="inline-flex w-full items-center justify-center rounded-md bg-electric px-6 py-4 text-sm font-black uppercase text-white shadow-lg shadow-electric/25 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-fit"
                >
                  {isSubmitting
                    ? "Starting Payment..."
                    : launchPassUseMode === "choose_now"
                      ? `Buy Package & Book ${selectedPassSessionIds.length || ""} Session${selectedPassSessionIds.length === 1 ? "" : "s"}`
                      : `Buy ${getLaunchPassOption(bookingOption as LaunchPassType).title}`}
                </button>
              </div>
            ) : usesExistingPass ? (
              <div className="grid gap-5 rounded-lg border border-slate-200 bg-mist p-5">
                <div>
                  <p className="text-xs font-black uppercase text-electric">Training Credits</p>
                  <h4 className="mt-2 text-2xl font-black text-navy">Find your active credits</h4>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Enter the parent email and player name used when purchasing the Training Package.
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
            ) : isPrivateSessionOption ? (
              <>
                <div className="rounded-lg border border-slate-200 bg-mist p-5">
                  <p className="text-xs font-black uppercase text-electric">Private Session</p>
                  <h4 className="mt-2 text-2xl font-black text-navy">Choose a private training time</h4>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    Private session openings are created by Coach Hugo and shown here when they are available for public booking.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setStep("session")}
                  className="inline-flex w-full items-center justify-center rounded-md bg-electric px-6 py-4 text-sm font-black uppercase text-white shadow-lg shadow-electric/25 transition hover:bg-blue-500 sm:w-fit"
                >
                  View Private Times
                </button>
              </>
            ) : (
              <>
                <div className="rounded-lg border border-slate-200 bg-mist p-5">
                  <p className="text-xs font-black uppercase text-electric">EST CV Training Sessions</p>
                  <h4 className="mt-2 text-2xl font-black text-navy">Small Group and Private Training</h4>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    Small group and private training options are designed to help players improve through focused,
                    competitive, and personal coaching.
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-5">
                  <h4 className="text-xl font-black text-navy">Need a different time, date, or private training option?</h4>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Submit a training request and Coach Hugo will follow up with availability.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      selectBookingOption("private_request");
                      setSelectedSlotId("");
                      setError("");
                    }}
                    className="mt-4 rounded-md border border-electric px-5 py-3 text-xs font-black uppercase text-electric transition hover:bg-electric hover:text-white"
                  >
                    Request Private Training
                  </button>
                </div>

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
              <h3 className="mt-2 text-2xl font-black text-navy">
                {isPrivateSessionOption ? "Choose your private session" : "Choose your training session"}
              </h3>
              <p className="mt-2 text-sm font-bold text-slate-600">
                {isPrivateSessionOption ? "Private Session" : "EST CV Training Sessions"}
              </p>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                {isPrivateSessionOption
                  ? "Private sessions are one-on-one openings created by Coach Hugo. Choose an available time below."
                  : groupSizeMessage}
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
                  <p><span className="font-black text-navy">Selected sessions:</span> EST CV Training Sessions</p>
                  <p><span className="font-black text-navy">Sessions after group/option filter:</span> {availableSessions.length}</p>
                  <p><span className="font-black text-navy">Final sessions rendered:</span> {sessionsForSelectedDate.length}</p>
                </div>
                {availabilityError ? <p className="mt-3 font-bold text-red-700">{availabilityError}</p> : null}
                <div className="mt-3 grid gap-1">
                  {(availabilityDebug?.loadedSessions?.length ?? 0) > 0 ? (
                    availabilityDebug?.loadedSessions.map((slot) => (
                      <p key={slot.id}>
                        {slot.id} / {slot.date} / {slot.time} / {slot.trainingGroup} / {slot.remainingSpots} spots /{" "}
                        {sessionFocusTitle(slot)} /{" "}
                        {slot.included ? "included" : `removed: ${slot.removedReasons.join(", ")}`}
                      </p>
                    ))
                  ) : (
                    <p>No sessions returned by /api/availability/debug.</p>
                  )}
                </div>
              </div>
            ) : null}

            {isPrivateSessionOption ? (
              <div
                data-booking-field="session"
                tabIndex={-1}
                className={`grid gap-3 rounded-lg outline-none ${
                  fieldErrors.session ? "border border-red-300 bg-red-50 p-3" : ""
                }`}
              >
                {availablePrivateSessions.length > 0 ? (
                  availablePrivateSessions.map((slot) => {
                    const isSelected = selectedPrivateSessionId === slot.id;

                    return (
                      <button
                        key={slot.id}
                        type="button"
                        onClick={() => {
                          setSelectedPrivateSessionId(slot.id);
                          clearFieldError("session");
                          setFields((current) => ({ ...current, players: "1" }));
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
                            <span className="mt-1 block text-2xl font-black">{privateSessionTimeRange(slot)}</span>
                            <span className="mt-2 block text-sm font-bold opacity-90">Private Session</span>
                            <span className="mt-1 block text-sm font-semibold opacity-80">
                              {sessionLocationLines(slot.location).map((line) => (
                                <span key={line} className="block">{line}</span>
                              ))}
                            </span>
                            <span className="mt-1 block text-sm font-semibold opacity-80">{slot.duration} session</span>
                            <span className="mt-3 block text-xs font-black uppercase text-electric">Available</span>
                          </div>
                          <span
                            className={`inline-flex w-full justify-center rounded-md px-4 py-3 text-xs font-black uppercase sm:w-auto ${
                              isSelected ? "bg-electric text-white" : "bg-mist text-navy"
                            }`}
                          >
                            {isSelected ? "Selected" : "Book Private Session"}
                          </span>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-mist p-6 outline-none">
                    {isLoadingAvailability ? (
                      <>
                        <p className="font-black text-navy">Loading private sessions...</p>
                        <p className="mt-2 text-sm leading-6 text-slate-600">Checking the latest private openings.</p>
                      </>
                    ) : (
                      <>
                        <p className="font-black text-navy">No public private session times are available right now.</p>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          You can still submit a private request or call{" "}
                          <a className="font-black underline" href={business.phoneHref}>{business.phone}</a> for schedule help.
                        </p>
                      </>
                    )}
                  </div>
                )}
                {fieldErrorMessage("session")}
              </div>
            ) : availableSessions.length > 0 || availablePrivateSessions.length > 0 ? (
              <div
                data-booking-field="session"
                tabIndex={-1}
                className={`grid gap-3 rounded-lg outline-none ${
                  fieldErrors.session ? "border border-red-300 bg-red-50 p-3" : ""
                }`}
              >
                {availableSessions.length > 0 && visibleMonth ? (
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

                {availableSessions.length > 0 && selectedSessionDate ? (
                  <p className="text-sm font-black text-navy">Available sessions for {readableDate(selectedSessionDate)}</p>
                ) : null}

                {availableSessions.length > 0 ? (
                  <div className="grid gap-3">
                    {sessionsForSelectedDate.map((slot) => {
                      const isSelected = selectedSlotId === slot.id;

                      return (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={() => {
                            setSelectedSlotId(slot.id);
                            setSelectedPrivateSessionId("");
                            setPrivateBookingSuccess(null);
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
                              <span className="mt-1 block text-2xl font-black">{sessionTimeRange(slot)}</span>
                              <span className="mt-2 block text-sm font-bold opacity-90">
                                Small Group Training
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
                              {isSelected ? "Selected" : "Book Session"}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                {availableSessions.length > 0 && sessionsForSelectedDate.length === 0 ? (
                  <p className="rounded-lg border border-slate-200 bg-mist p-4 text-sm font-bold text-slate-600">
                    No open sessions are available for this date. Choose another highlighted date.
                  </p>
                ) : null}
                {availablePrivateSessions.length > 0 ? (
                  <div className="grid gap-3 border-t border-slate-200 pt-5">
                    <div>
                      <p className="text-sm font-black text-navy">Available private sessions</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        Private sessions are booked for one player and do not count toward small group capacity.
                      </p>
                    </div>
                    {availablePrivateSessions.map((slot) => {
                      const isSelected = selectedPrivateSessionId === slot.id;

                      return (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={() => {
                            setSelectedPrivateSessionId(slot.id);
                            setSelectedSlotId("");
                            setSelectedSessionDate("");
                            setPrivateBookingSuccess(null);
                            clearFieldError("session");
                            setFields((current) => ({ ...current, players: "1" }));
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
                              <span className="mt-1 block text-2xl font-black">{privateSessionTimeRange(slot)}</span>
                              <span className="mt-2 block text-sm font-bold opacity-90">Private Session</span>
                              <span className="mt-1 block text-sm font-semibold opacity-80">
                                {sessionLocationLines(slot.location).map((line) => (
                                  <span key={line} className="block">{line}</span>
                                ))}
                              </span>
                              <span className="mt-1 block text-sm font-semibold opacity-80">{slot.duration} session</span>
                              <span className="mt-3 block text-xs font-black uppercase text-electric">Available</span>
                            </div>
                            <span
                              className={`inline-flex w-full justify-center rounded-md px-4 py-3 text-xs font-black uppercase sm:w-auto ${
                                isSelected ? "bg-electric text-white" : "bg-mist text-navy"
                              }`}
                            >
                              {isSelected ? "Selected" : "Book Private Session"}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
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
              {fieldErrors.playerAge === smallGroupAgeRestrictionMessage ? (
                <button
                  type="button"
                  onClick={() => {
                    selectBookingOption("private_request");
                    setStep("program");
                    setError("");
                  }}
                  className="w-fit rounded-md border border-electric px-4 py-2 text-xs font-black uppercase text-electric transition hover:bg-electric hover:text-white"
                >
                  Request Private Training
                </button>
              ) : null}
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
            <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-mist p-4 text-sm font-semibold leading-6 text-slate-700 sm:col-span-2">
              <input
                className="mt-1 h-4 w-4 rounded border-slate-300 text-electric"
                type="checkbox"
                checked={fields.marketingOptIn}
                onChange={(event) => setField("marketingOptIn", event.target.checked)}
              />
              <span>Yes, I&apos;d like to receive EST CV training schedules, updates, and special offers by email.</span>
            </label>
            {usesExistingPass ? (
              <div className="rounded-md bg-mist px-4 py-3 text-sm font-bold text-slate-600">
                Training Package booking uses 1 credit for {fields.playerName || "this player"}.
              </div>
            ) : isPrivateSessionBooking ? (
              <div className="rounded-md bg-mist px-4 py-3 text-sm font-bold text-slate-600">
                Private sessions are booked for one player at a time.
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
                {spotsLabel(selectedRemainingSpots)} for {selectedSlot.dateLabel} at {sessionTimeRange(selectedSlot)}. {groupSizeMessage}
              </p>
            ) : null}
            {selectedPrivateSession ? (
              <p className="rounded-md bg-mist px-4 py-3 text-sm font-bold text-slate-600 sm:col-span-2">
                Private Session for {selectedPrivateSession.dateLabel} at {privateSessionTimeRange(selectedPrivateSession)}.
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
                {usesExistingPass
                  ? "Parent waiver + Training credit"
                  : isPrivateSessionBooking
                    ? "Parent waiver + private session payment"
                    : "Parent waiver + secure payment"}
              </h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                {usesExistingPass
                  ? "Your paid Training credit will reserve this session after the waiver."
                  : isPrivateSessionBooking
                    ? "Choose card payment or submit the waiver and view Zelle instructions."
                  : "Secure online payment is completed after the waiver."}
              </p>
              {selectedSlot ? (
                <div className="mt-5 rounded-md bg-white p-4 text-sm text-slate-700">
                  <p className="font-black text-navy">{selectedSlot.dateLabel} at {sessionTimeRange(selectedSlot)}</p>
                  <p>{usesExistingPass ? "1 player using Training credit" : `${fields.players} player(s) attending`}</p>
                  <p>Small Group Training</p>
                  <p className="mt-2 rounded-md border border-electric/20 bg-blue-50 px-3 py-2 text-xs font-black uppercase text-electric">
                    {sessionFocusTitle(selectedSlot)}
                  </p>
                  <p className="mt-2 text-xs font-bold uppercase text-slate-500">{groupSizeMessage}</p>
                  <p className="mt-3 border-t border-slate-200 pt-3 font-black text-navy">
                    {usesExistingPass ? "Payment: Training credit" : `${fields.players} x ${sessionPriceLabel} = ${paymentTotal}`}
                  </p>
                </div>
              ) : null}
              {selectedPrivateSession ? (
                <div className="mt-5 rounded-md bg-white p-4 text-sm text-slate-700">
                  <p className="font-black text-navy">
                    {selectedPrivateSession.dateLabel} at {privateSessionTimeRange(selectedPrivateSession)}
                  </p>
                  <p>1 player attending</p>
                  <p>Private Session</p>
                  <p className="mt-2 text-xs font-bold uppercase text-slate-500">Private sessions do not count toward small group capacity.</p>
                  <p className="mt-3 border-t border-slate-200 pt-3 font-black text-navy">
                    Private Session = {paymentTotal}
                  </p>
                </div>
              ) : null}
            </aside>

            <div className="grid gap-5 rounded-lg border border-slate-200 bg-white p-5" data-stripe-checkout-ready="true">
              {privateBookingSuccess?.status === "zelle_pending" ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-5">
                  <p className="text-sm font-black uppercase text-amber-800">Zelle Instructions</p>
                  <h3 className="mt-2 text-2xl font-black text-navy">Private session pending payment.</h3>
                  <div className="mt-3 grid gap-2 text-sm leading-6 text-slate-700">
                    <p>Send payment through Zelle to: <span className="font-black text-navy">{privateBookingSuccess.zellePhone}</span></p>
                    <p>Memo: <span className="font-black text-navy">{privateBookingSuccess.memo}</span></p>
                    <p>Total due: <span className="font-black text-navy">{formatCurrencyFromCents(privateBookingSuccess.amountDue ?? 0)}</span></p>
                    <p>Zelle payments must be confirmed manually.</p>
                  </div>
                </div>
              ) : null}
              {creditBookingSuccess ? (
                <div className="rounded-md border border-field/20 bg-field/10 p-5">
                  <p className="text-sm font-black uppercase text-field">Session Confirmed</p>
                  <h3 className="mt-2 text-2xl font-black text-navy">Booked with Training credit.</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-700">
                    Confirmation details were sent by email. Booking ID: {creditBookingSuccess.bookingId}
                  </p>
                  {typeof creditBookingSuccess.remainingCredits === "number" ? (
                    <p className="mt-2 text-sm font-black text-navy">
                      Remaining Training credits: {creditBookingSuccess.remainingCredits}
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
                      {usesExistingPass ? "Elite Soccer Training CV - Training Package Credit" : paidSessionSummaryLabel}
                    </span>
                    <span className="font-black text-navy">{usesExistingPass ? "1 credit" : sessionPriceLabel}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span>Players attending</span>
                    <span className="font-black text-navy">{usesExistingPass || isPrivateSessionBooking ? "1" : fields.players}</span>
                  </div>
                  {isPrivateSessionBooking ? (
                    <div className="flex items-center justify-between gap-4">
                      <span>Payment method</span>
                      <span className="font-black text-navy">{privatePaymentMethod === "zelle" ? "Zelle" : "Card"}</span>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between gap-4 border-t border-slate-300 pt-3 text-base">
                    <span className="font-black text-navy">{usesExistingPass ? "Payment" : "Total Due"}</span>
                    <span className="font-black text-navy">{paymentTotal}</span>
                  </div>
                </div>
              </div>
              {usesExistingPass ? (
                <p className="text-sm leading-6 text-slate-600">
                  No card payment is collected for this booking because one Training credit will be used.
                </p>
              ) : isPrivateSessionBooking ? (
                <div className="grid gap-3">
                  <p className="text-sm leading-6 text-slate-600">
                    Private session payment is completed after the waiver.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      ["card", "Pay by Card", "Continue to secure card payment."],
                      ["zelle", "Pay by Zelle", "Submit waiver and view Zelle instructions."]
                    ].map(([value, title, description]) => {
                      const isSelected = privatePaymentMethod === value;

                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setPrivatePaymentMethod(value as "card" | "zelle")}
                          className={`rounded-lg border p-4 text-left transition ${
                            isSelected
                              ? "border-navy bg-navy text-white shadow-lg shadow-navy/15"
                              : "border-slate-200 bg-mist text-navy hover:border-electric"
                          }`}
                        >
                          <span className="block text-sm font-black">{title}</span>
                          <span className="mt-2 block text-sm leading-6 opacity-80">{description}</span>
                        </button>
                      );
                    })}
                  </div>
                  {privatePaymentMethod === "zelle" ? (
                    <p className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-900">
                      Zelle instructions will show after the waiver is submitted. Send payment to 3236848024.
                    </p>
                  ) : (
                    <p className="text-sm font-semibold leading-6 text-slate-600">
                      Have a promo code? You'll be able to enter it securely during checkout.
                    </p>
                  )}
                </div>
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
                  onClick={
                    usesExistingPass
                      ? confirmWithLaunchPassCredit
                      : isPrivateSessionBooking
                        ? startPrivateSessionCheckout
                        : startStripeCheckout
                  }
                  disabled={isSubmitting || Boolean(creditBookingSuccess) || Boolean(privateBookingSuccess)}
                  className="rounded-md bg-electric px-6 py-3 text-sm font-black uppercase text-white shadow-lg shadow-electric/25 disabled:cursor-wait disabled:opacity-70"
                >
                  {usesExistingPass
                    ? isSubmitting
                      ? "Confirming..."
                      : creditBookingSuccess
                        ? "Confirmed"
                        : "Confirm Booking"
                    : isPrivateSessionBooking
                      ? isSubmitting
                        ? privatePaymentMethod === "zelle"
                          ? "Submitting..."
                          : "Opening Secure Payment..."
                        : privateBookingSuccess
                          ? "Submitted"
                          : privatePaymentMethod === "zelle"
                            ? "Submit Waiver + View Zelle Instructions"
                            : "Confirm & Pay"
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

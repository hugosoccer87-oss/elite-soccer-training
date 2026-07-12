export const shootingFinishingTrainingFocusValue = "Shooting & Finishing";
export const privateSessionTrainingFocusValue = "Private Session";

export type TrainingFocusValue =
  | "regular"
  | "general_training"
  | "shooting_finishing"
  | typeof shootingFinishingTrainingFocusValue
  | typeof privateSessionTrainingFocusValue;

export type TrainingFocusDisplay = {
  value: string;
  label: string;
  description?: string;
};

export const trainingFocusOptions: Array<{
  value: TrainingFocusValue;
  label: string;
}> = [
  { value: "regular", label: "Regular Training" },
  { value: "general_training", label: "General Training" },
  { value: shootingFinishingTrainingFocusValue, label: "Shooting & Finishing" },
  { value: privateSessionTrainingFocusValue, label: "Private Session" }
];

export const sessionFocusExamples = [
  "Technical Work",
  "Wingers / Wing Backs",
  "First Touch & Passing",
  "Defending Session",
  "Shooting / Attacking Session",
  "Speed of Play & Decision Making",
  privateSessionTrainingFocusValue
];

function normalizedFocus(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/&/g, "and").replace(/\s+/g, "_") ?? "";
}

export function isShootingFinishingFocus(value: string | null | undefined) {
  const normalized = normalizedFocus(value);

  return (
    normalized === "shooting_finishing" ||
    normalized === "shooting-finishing" ||
    normalized === "shooting_and_finishing"
  );
}

export function isRegularTrainingFocus(value: string | null | undefined) {
  const normalized = normalizedFocus(value);

  return (
    !normalized ||
    normalized === "regular" ||
    normalized === "regular_training" ||
    normalized === "general" ||
    normalized === "general_training"
  );
}

export function isPrivateSessionFocus(value: string | null | undefined) {
  const normalized = normalizedFocus(value);

  return normalized === "private_session" || normalized === "private";
}

export function normalizeTrainingFocusForStorage(value: string | null | undefined) {
  const trimmed = value?.trim();

  if (!trimmed || isRegularTrainingFocus(trimmed)) {
    return null;
  }

  if (isShootingFinishingFocus(trimmed)) {
    return shootingFinishingTrainingFocusValue;
  }

  if (isPrivateSessionFocus(trimmed)) {
    return privateSessionTrainingFocusValue;
  }

  return trimmed;
}

export function getTrainingFocusLabel(value: string | null | undefined) {
  const normalized = value?.trim();

  if (isShootingFinishingFocus(normalized)) {
    return "Shooting & Finishing";
  }

  if (isPrivateSessionFocus(normalized)) {
    return "Private Session";
  }

  if (isRegularTrainingFocus(normalized)) {
    return "Regular Training";
  }

  const match = trainingFocusOptions.find((option) => option.value === value);

  if (match) {
    return match.label;
  }

  return normalized || "General Training";
}

export function getSessionFocusLabel(value: string | null | undefined) {
  return isRegularTrainingFocus(value) ? "General Training" : getTrainingFocusLabel(value);
}

export function getTrainingFocusDisplay(value: string | null | undefined): TrainingFocusDisplay | null {
  const normalized = value?.trim();

  if (!normalized || isRegularTrainingFocus(normalized)) {
    return null;
  }

  if (isShootingFinishingFocus(normalized)) {
    return {
      value: normalized,
      label: "Shooting & Finishing",
      description: "Focused attacking reps, ball striking, and finishing confidence."
    };
  }

  if (isPrivateSessionFocus(normalized)) {
    return {
      value: normalized,
      label: "Private Session",
      description: "Private 1-on-1 session time controlled by Coach Hugo."
    };
  }

  return {
    value: normalized,
    label: getTrainingFocusLabel(normalized)
  };
}

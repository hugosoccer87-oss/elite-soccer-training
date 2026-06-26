export const shootingFinishingTrainingFocusValue = "Shooting & Finishing";

export type TrainingFocusValue = "regular" | "general_training" | "shooting_finishing" | typeof shootingFinishingTrainingFocusValue;

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
  { value: shootingFinishingTrainingFocusValue, label: "Shooting & Finishing" }
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

export function normalizeTrainingFocusForStorage(value: string | null | undefined) {
  const trimmed = value?.trim();

  if (!trimmed || isRegularTrainingFocus(trimmed)) {
    return null;
  }

  if (isShootingFinishingFocus(trimmed)) {
    return shootingFinishingTrainingFocusValue;
  }

  return trimmed;
}

export function getTrainingFocusLabel(value: string | null | undefined) {
  const normalized = value?.trim();

  if (isShootingFinishingFocus(normalized)) {
    return "Shooting & Finishing";
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

  return {
    value: normalized,
    label: getTrainingFocusLabel(normalized)
  };
}

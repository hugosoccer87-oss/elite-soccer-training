export type TrainingFocusValue = "general_training" | "shooting_finishing";

export type TrainingFocusDisplay = {
  value: string;
  label: string;
  description?: string;
};

export const trainingFocusOptions: Array<{
  value: TrainingFocusValue;
  label: string;
}> = [
  { value: "general_training", label: "General Training" },
  { value: "shooting_finishing", label: "Shooting & Finishing" }
];

export function getTrainingFocusLabel(value: string | null | undefined) {
  const match = trainingFocusOptions.find((option) => option.value === value);

  if (match) {
    return match.label;
  }

  return value?.trim() || "General Training";
}

export function getTrainingFocusDisplay(value: string | null | undefined): TrainingFocusDisplay | null {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  if (normalized === "shooting_finishing" || normalized === "shooting-finishing") {
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

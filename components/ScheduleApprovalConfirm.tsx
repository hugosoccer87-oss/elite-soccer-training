"use client";

import { useState } from "react";

type ScheduleApprovalConfirmProps = {
  token: string;
  disabled?: boolean;
};

export function ScheduleApprovalConfirm({ token, disabled }: ScheduleApprovalConfirmProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<"idle" | "confirmed" | "failed">("idle");
  const [message, setMessage] = useState("");

  async function confirmSchedule() {
    setIsSubmitting(true);
    setStatus("idle");
    setMessage("");

    try {
      const response = await fetch(`/api/schedule-approvals/${token}/confirm`, {
        method: "POST"
      });
      const result = (await response.json().catch(() => ({}))) as {
        status?: string;
        bookingCount?: number;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(result.error || "This schedule could not be confirmed.");
      }

      setStatus("confirmed");
      setMessage(
        `Schedule confirmed. ${result.bookingCount ?? 0} session${result.bookingCount === 1 ? "" : "s"} booked with Launch Pass credits.`
      );
    } catch (error) {
      setStatus("failed");
      setMessage(error instanceof Error ? error.message : "This schedule could not be confirmed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-4">
      {message ? (
        <p
          className={`rounded-lg border p-4 text-sm font-bold leading-6 ${
            status === "confirmed"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message}
        </p>
      ) : null}
      <button
        type="button"
        disabled={disabled || isSubmitting || status === "confirmed"}
        onClick={() => void confirmSchedule()}
        className="rounded-md bg-electric px-6 py-4 text-sm font-black uppercase text-white shadow-lg shadow-electric/25 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Confirming..." : status === "confirmed" ? "Schedule Confirmed" : "Confirm Schedule"}
      </button>
    </div>
  );
}

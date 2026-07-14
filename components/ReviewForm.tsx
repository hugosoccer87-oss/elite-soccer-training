"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { StarIcon } from "./Icons";

const inputClass =
  "field-focus w-full rounded-md border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400";

export function ReviewForm() {
  const [rating, setRating] = useState("5");
  const [status, setStatus] = useState("");
  const [statusType, setStatusType] = useState<"success" | "error">("success");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus("");

    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      parentName: String(formData.get("parentName") ?? ""),
      email: String(formData.get("email") ?? ""),
      playerName: String(formData.get("playerName") ?? ""),
      playerAgeGroup: String(formData.get("playerAgeGroup") ?? ""),
      rating: Number(formData.get("rating") ?? 0),
      review: String(formData.get("review") ?? ""),
      permission: formData.get("permission") === "on"
    };

    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        setStatusType("error");
        setStatus(result.error ?? "Your review could not be sent. Please try again.");
        return;
      }

      form.reset();
      setRating("5");
      setStatusType("success");
      setStatus("Thank you for your review. Coach Hugo will review it before it appears on the website.");
    } catch {
      setStatusType("error");
      setStatus("Your review could not be sent. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form id="review-form" className="panel grid gap-5 p-5 sm:p-8" onSubmit={submitReview}>
      <div>
        <p className="text-sm font-black uppercase text-electric">Leave a Review</p>
        <h2 className="mt-2 text-3xl font-black leading-tight text-navy">Share your EST CV experience.</h2>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Reviews are sent to Coach Hugo first and will only appear publicly after approval.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-bold text-navy">
          Parent/Guardian Name
          <input className={inputClass} name="parentName" autoComplete="name" required />
        </label>
        <label className="grid gap-2 text-sm font-bold text-navy">
          Email
          <input className={inputClass} name="email" type="email" autoComplete="email" required />
        </label>
        <label className="grid gap-2 text-sm font-bold text-navy">
          <span>
            Player Name <span className="font-semibold text-slate-500">(optional)</span>
          </span>
          <input className={inputClass} name="playerName" />
        </label>
        <label className="grid gap-2 text-sm font-bold text-navy">
          <span>
            Player Age Group <span className="font-semibold text-slate-500">(optional)</span>
          </span>
          <input className={inputClass} name="playerAgeGroup" placeholder="Example: 2010 player or ages 13–18" />
        </label>
      </div>

      <fieldset className="grid gap-3">
        <legend className="text-sm font-bold text-navy">Star Rating</legend>
        <div className="grid grid-cols-5 gap-2 sm:flex sm:flex-wrap">
          {[1, 2, 3, 4, 5].map((value) => (
            <label
              key={value}
              className={`flex cursor-pointer items-center justify-center gap-1 rounded-md border px-3 py-3 text-sm font-black transition ${
                Number(rating) === value
                  ? "border-electric bg-electric text-white shadow-lg shadow-electric/20"
                  : "border-slate-200 bg-white text-navy hover:border-electric"
              }`}
            >
              <input
                className="sr-only"
                type="radio"
                name="rating"
                value={value}
                checked={Number(rating) === value}
                onChange={() => setRating(String(value))}
                required
              />
              {value}
              <StarIcon className="h-4 w-4" />
            </label>
          ))}
        </div>
      </fieldset>

      <label className="grid gap-2 text-sm font-bold text-navy">
        Review/Testimonial
        <textarea
          className={`${inputClass} min-h-36 resize-y`}
          name="review"
          placeholder="Share what stood out about the training experience"
          required
        />
      </label>

      <label className="flex gap-3 rounded-md border border-slate-200 bg-mist p-4 text-sm font-semibold leading-6 text-slate-700">
        <input className="mt-1 h-4 w-4 accent-electric" name="permission" type="checkbox" required />
        <span>I give Elite Soccer Training CV permission to display this review on the website.</span>
      </label>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex justify-center rounded-md bg-electric px-7 py-4 text-sm font-black uppercase text-white shadow-lg shadow-electric/25 transition hover:bg-blue-500 disabled:cursor-wait disabled:opacity-70"
        >
          {isSubmitting ? "Sending..." : "Submit Review"}
        </button>
        {status ? (
          <p
            className={`text-sm font-semibold ${
              statusType === "success" ? "text-field" : "text-red-600"
            }`}
            aria-live="polite"
          >
            {status}
          </p>
        ) : null}
      </div>
    </form>
  );
}

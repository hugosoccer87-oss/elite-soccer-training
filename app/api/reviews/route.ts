import { NextResponse } from "next/server";
import {
  reviewRecipient,
  sendReviewSubmissionEmail,
  type ReviewSubmissionPayload
} from "@/lib/review-email";

export const runtime = "nodejs";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
  const payload = (await request.json()) as ReviewSubmissionPayload;
  const parentName = String(payload.parentName ?? "").trim();
  const email = String(payload.email ?? "").trim();
  const review = String(payload.review ?? "").trim();
  const rating = Number(payload.rating);
  const permission = Boolean(payload.permission);

  if (!parentName || !email || !review || !Number.isInteger(rating) || rating < 1 || rating > 5 || !permission) {
    return NextResponse.json(
      { error: "Complete all required review fields and permission checkbox." },
      { status: 400 }
    );
  }

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const normalizedPayload: ReviewSubmissionPayload = {
    parentName,
    email,
    playerName: String(payload.playerName ?? "").trim(),
    playerAgeGroup: String(payload.playerAgeGroup ?? "").trim(),
    rating,
    review,
    permission
  };

  try {
    const result = await sendReviewSubmissionEmail(normalizedPayload);

    console.info("[EST Reviews] Review submission email sent", {
      to: reviewRecipient,
      parentName,
      rating,
      messageId: result.messageId
    });

    return NextResponse.json({ status: "sent" });
  } catch (error) {
    console.error("[EST Reviews] Review submission email failed", {
      to: reviewRecipient,
      parentName,
      rating,
      error: error instanceof Error ? error.message : String(error)
    });

    return NextResponse.json(
      {
        error: "Your review could not be sent. Please try again or contact Elite Soccer Training CV directly."
      },
      { status: 500 }
    );
  }
}

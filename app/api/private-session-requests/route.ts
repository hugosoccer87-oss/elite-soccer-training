import { NextResponse } from "next/server";
import { sendPrivateSessionRequestEmails } from "@/lib/private-session-request-email";
import { sendPrivateSessionRequestAdminPushoverAlert } from "@/lib/pushover";
import { createPrivateSessionRequest, type PrivateSessionRequestInput } from "@/lib/supabase-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const focusOptions = new Set([
  "Shooting / Finishing",
  "Confidence",
  "First Touch & Passing",
  "Speed of Play",
  "Wingers / Wing Backs",
  "Defending",
  "Speed & Agility",
  "General Technical Work"
]);

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as Partial<PrivateSessionRequestInput> | null;

  if (
    !payload?.playerName?.trim() ||
    !payload.playerAge?.trim() ||
    !payload.parentName?.trim() ||
    !payload.parentEmail?.trim() ||
    !isValidEmail(payload.parentEmail) ||
    !payload.parentPhone?.trim() ||
    !payload.preferredTimes?.trim()
  ) {
    return NextResponse.json({ error: "Complete all required private session request fields." }, { status: 400 });
  }

  const focusAreas = Array.isArray(payload.focusAreas)
    ? payload.focusAreas.filter((focus) => typeof focus === "string" && focusOptions.has(focus))
    : [];

  try {
    const saved = await createPrivateSessionRequest({
      playerName: payload.playerName,
      playerAge: payload.playerAge,
      parentName: payload.parentName,
      parentEmail: payload.parentEmail,
      parentPhone: payload.parentPhone,
      preferredTimes: payload.preferredTimes,
      focusAreas,
      notes: payload.notes ?? ""
    });

    if (!saved) {
      return NextResponse.json({ error: "Private session request could not be saved." }, { status: 500 });
    }

    try {
      const email = await sendPrivateSessionRequestEmails(saved);
      console.info("[EST Private Request] Emails processed", {
        requestId: saved.id,
        parentSent: email.parentSent,
        adminSent: email.adminSent,
        parentError: email.parentError,
        adminError: email.adminError
      });
    } catch (emailError) {
      console.error("[EST Private Request] Email sending failed", {
        requestId: saved.id,
        error: emailError instanceof Error ? emailError.message : String(emailError)
      });
    }

    await sendPrivateSessionRequestAdminPushoverAlert(saved).catch((alertError) => {
      console.error("[EST Pushover] Private session request admin alert failed", {
        requestId: saved.id,
        error: alertError instanceof Error ? alertError.message : String(alertError)
      });
    });

    return NextResponse.json({
      status: "saved",
      message: "Thank you. We received your private session request and will contact you to confirm availability."
    });
  } catch (error) {
    console.error("[EST Private Request] Request failed", {
      error: error instanceof Error ? error.message : String(error)
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Private session request could not be sent." },
      { status: 500 }
    );
  }
}

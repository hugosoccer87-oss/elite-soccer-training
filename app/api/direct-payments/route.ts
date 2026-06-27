import { NextResponse } from "next/server";
import { directPaymentOptions, type DirectPaymentOption } from "@/lib/pricing";
import { createStripeDirectPaymentCheckoutSession } from "@/lib/stripe";
import {
  attachDirectPaymentStripeCheckoutSession,
  createDirectPaymentRecord,
  saveEmailSubscriberOptIn
} from "@/lib/supabase-db";
import { sendDirectPaymentTransactionalEmails } from "@/lib/transactional-email";
import { waiverVersion } from "@/lib/waiver-content";

export const runtime = "nodejs";

const zellePhone = "3236848024";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isDirectPaymentOption(value: string): value is DirectPaymentOption {
  return value in directPaymentOptions;
}

function getRequestIpAddress(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const vercelForwardedFor = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();

  return forwardedFor || realIp || vercelForwardedFor || "";
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    playerCount?: number;
    sessionCount?: number;
    playerFirstName?: string;
    playerLastName?: string;
    playerAge?: string;
    secondPlayerFirstName?: string;
    secondPlayerLastName?: string;
    secondPlayerAge?: string;
    parentName?: string;
    parentEmail?: string;
    parentPhone?: string;
    paymentOption?: string;
    paymentMethod?: "card" | "zelle";
    waiverAgreement?: boolean;
    mediaConsent?: "yes" | "no";
    guardianSignature?: string;
    emergencyName?: string;
    emergencyPhone?: string;
    medicalNotes?: string;
    marketingOptIn?: boolean;
  } | null;
  const playerCount = payload?.playerCount === 2 ? 2 : 1;
  const sessionCount =
    payload?.paymentOption === "single_session" && payload.sessionCount && payload.sessionCount >= 1 && payload.sessionCount <= 6
      ? Math.floor(payload.sessionCount)
      : 1;

  if (
    !payload?.playerFirstName?.trim() ||
    !payload.playerLastName?.trim() ||
    !payload.playerAge?.trim() ||
    (playerCount === 2 &&
      (!payload.secondPlayerFirstName?.trim() ||
        !payload.secondPlayerLastName?.trim() ||
        !payload.secondPlayerAge?.trim())) ||
    !payload.parentName?.trim() ||
    !payload.parentEmail?.trim() ||
    !isValidEmail(payload.parentEmail) ||
    !payload.parentPhone?.trim() ||
    !payload.paymentOption ||
    !isDirectPaymentOption(payload.paymentOption) ||
    !payload.paymentMethod ||
    !["card", "zelle"].includes(payload.paymentMethod) ||
    !payload.emergencyName?.trim() ||
    !payload.emergencyPhone?.trim() ||
    !payload.medicalNotes?.trim() ||
    !payload.mediaConsent ||
    !payload.waiverAgreement ||
    !payload.guardianSignature?.trim()
  ) {
    return NextResponse.json(
      { error: "Complete all payment, parent, player, and waiver fields before continuing." },
      { status: 400 }
    );
  }

  try {
    const signedAt = new Date().toISOString();
    const record = await createDirectPaymentRecord({
      playerCount,
      sessionCount,
      playerFirstName: payload.playerFirstName,
      playerLastName: payload.playerLastName,
      playerAge: payload.playerAge,
      secondPlayerFirstName: payload.secondPlayerFirstName,
      secondPlayerLastName: payload.secondPlayerLastName,
      secondPlayerAge: payload.secondPlayerAge,
      parentName: payload.parentName,
      parentEmail: payload.parentEmail,
      parentPhone: payload.parentPhone,
      paymentOption: payload.paymentOption,
      paymentMethod: payload.paymentMethod,
      waiverSigned: true,
      typedSignature: payload.guardianSignature,
      signedAt,
      waiverVersion,
      mediaConsent: payload.mediaConsent === "yes" ? "Granted" : "Declined",
      emergencyName: payload.emergencyName,
      emergencyPhone: payload.emergencyPhone,
      medicalNotes: payload.medicalNotes,
      ipAddress: getRequestIpAddress(request)
    });
    if (payload.marketingOptIn) {
      const firstPlayerName = `${payload.playerFirstName.trim()} ${payload.playerLastName.trim()}`.trim();
      const secondPlayerName =
        playerCount === 2
          ? `${payload.secondPlayerFirstName?.trim() ?? ""} ${payload.secondPlayerLastName?.trim() ?? ""}`.trim()
          : "";

      await saveEmailSubscriberOptIn({
        parentName: record.parent_name,
        email: record.parent_email,
        phone: record.parent_phone,
        playerName: [firstPlayerName, secondPlayerName].filter(Boolean).join(" + "),
        playerAge: playerCount === 2 ? `${record.player_age} / ${record.second_player_age ?? ""}`.trim() : record.player_age,
        source: record.payment_method === "zelle" ? "direct_pay_zelle" : "direct_pay_card"
      });
    }

    if (payload.paymentMethod === "zelle") {
      const option = directPaymentOptions[payload.paymentOption];
      const firstPlayerName = `${payload.playerFirstName.trim()} ${payload.playerLastName.trim()}`.trim();
      const secondPlayerName =
        playerCount === 2
          ? `${payload.secondPlayerFirstName?.trim() ?? ""} ${payload.secondPlayerLastName?.trim() ?? ""}`.trim()
          : "";
      const playerName = [firstPlayerName, secondPlayerName].filter(Boolean).join(" + ");
      const memo =
        payload.paymentOption === "single_session"
          ? `${playerName} - Single Session - ${sessionCount} ${sessionCount === 1 ? "Session" : "Sessions"}`
          : `${playerName} - ${option.title}`;
      const emailResult = await sendDirectPaymentTransactionalEmails(record);

      console.info("[EST Direct Pay] Zelle direct payment emails processed", {
        directPaymentId: record.id,
        emailSent: emailResult.sent
      });

      return NextResponse.json({
        status: "zelle_pending",
        directPaymentId: record.id,
        zellePhone,
        memo,
        amountDue: record.amount_due,
        message: "Zelle payment must be confirmed manually."
      });
    }

    const session = await createStripeDirectPaymentCheckoutSession(record);
    await attachDirectPaymentStripeCheckoutSession(record.id, session.id);

    return NextResponse.json({
      status: "pending_card_payment",
      directPaymentId: record.id,
      checkoutUrl: session.url,
      sessionId: session.id
    });
  } catch (error) {
    console.error("[EST Direct Pay] Direct payment could not be started", {
      error: error instanceof Error ? error.message : String(error)
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Direct payment could not be started." },
      { status: 500 }
    );
  }
}

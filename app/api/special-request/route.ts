import { NextResponse } from "next/server";
import {
  sendSpecialRequestEmail,
  type SpecialRequestPayload
} from "@/lib/special-request-email";

export async function POST(request: Request) {
  const payload = (await request.json()) as SpecialRequestPayload;
  const required = [
    payload.parentName,
    payload.playerName,
    payload.playerAge,
    payload.phone,
    payload.email,
    payload.requestType
  ];

  if (required.some((value) => !String(value ?? "").trim())) {
    return NextResponse.json({ error: "Complete all required special request fields." }, { status: 400 });
  }

  try {
    const result = await sendSpecialRequestEmail(payload);

    console.info("[EST Special Request] Inquiry email sent", {
      to: "info@elitesoccertrainingcv.com",
      playerName: payload.playerName,
      requestType: payload.requestType,
      messageId: result.messageId
    });

    return NextResponse.json({ status: "sent" });
  } catch (error) {
    console.error("[EST Special Request] Inquiry email failed", {
      playerName: payload.playerName,
      requestType: payload.requestType,
      error: error instanceof Error ? error.message : String(error)
    });

    return NextResponse.json(
      {
        error: "Special request could not be sent. Please try again or contact Elite Soccer Training directly."
      },
      { status: 500 }
    );
  }
}

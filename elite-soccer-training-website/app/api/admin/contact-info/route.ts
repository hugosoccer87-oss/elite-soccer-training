import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-api";
import {
  updateBookingContactInfo,
  updateDirectPaymentContactInfo,
  updateEmailSubscriberContactInfo,
  updatePassPurchaseContactInfo,
  type ContactInfoInput
} from "@/lib/supabase-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RecordType = "booking" | "pass" | "direct_payment" | "email_subscriber";

function isRecordType(value: string | undefined): value is RecordType {
  return value === "booking" || value === "pass" || value === "direct_payment" || value === "email_subscriber";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export async function PATCH(request: Request) {
  const admin = await verifyAdminSession();

  if (!admin.authenticated) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const payload = (await request.json().catch(() => null)) as
    | ({
        recordType?: string;
        id?: string;
      } & ContactInfoInput)
    | null;

  if (!isRecordType(payload?.recordType)) {
    return NextResponse.json({ error: "Choose a valid record type." }, { status: 400 });
  }

  if (!payload?.id) {
    return NextResponse.json({ error: "Record ID is required." }, { status: 400 });
  }

  if (typeof payload.parentEmail === "string" && !isValidEmail(payload.parentEmail)) {
    return NextResponse.json({ error: "Enter a valid parent email address." }, { status: 400 });
  }

  if (payload.recordType !== "email_subscriber" && typeof payload.parentEmail === "string" && !payload.parentEmail.trim()) {
    return NextResponse.json({ error: "Parent email cannot be empty." }, { status: 400 });
  }

  try {
    const input: ContactInfoInput = {
      parentName: payload.parentName,
      parentEmail: payload.parentEmail,
      parentPhone: payload.parentPhone,
      playerName: payload.playerName,
      playerFirstName: payload.playerFirstName,
      playerLastName: payload.playerLastName,
      playerAge: payload.playerAge,
      secondPlayerFirstName: payload.secondPlayerFirstName,
      secondPlayerLastName: payload.secondPlayerLastName,
      secondPlayerAge: payload.secondPlayerAge
    };
    const record =
      payload.recordType === "booking"
        ? await updateBookingContactInfo(payload.id, input)
        : payload.recordType === "pass"
          ? await updatePassPurchaseContactInfo(payload.id, input)
          : payload.recordType === "direct_payment"
            ? await updateDirectPaymentContactInfo(payload.id, input)
            : await updateEmailSubscriberContactInfo(payload.id, input);

    if (!record) {
      return NextResponse.json({ error: "Record was not found." }, { status: 404 });
    }

    return NextResponse.json({
      status: "Updated",
      message: "Contact information updated successfully.",
      record
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Contact information could not be updated." },
      { status: 500 }
    );
  }
}

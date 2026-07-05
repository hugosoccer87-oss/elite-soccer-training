import { NextResponse } from "next/server";
import { finalizeConfirmedBooking } from "@/lib/booking-confirmation";
import { verifyAdminSession } from "@/lib/admin-api";
import {
  createManualAdminBooking,
  listAdminBookings,
  type ManualBookingInput
} from "@/lib/supabase-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await verifyAdminSession();

  if (!admin.authenticated) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  try {
    const bookings = await listAdminBookings();

    return NextResponse.json({ status: "Synced", bookings });
  } catch (error) {
    return NextResponse.json(
      { status: "Failed", error: error instanceof Error ? error.message : "Bookings could not be loaded." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const admin = await verifyAdminSession();

  if (!admin.authenticated) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const payload = (await request.json().catch(() => null)) as
    | (ManualBookingInput & {
        sendConfirmationEmail?: boolean;
        sendAdminAlert?: boolean;
      })
    | null;

  if (
    !payload?.sessionId ||
    !payload.playerName ||
    !payload.playerAge ||
    !payload.parentName ||
    !payload.parentEmail ||
    !payload.parentPhone ||
    !payload.paymentStatus ||
    !payload.paymentMethod
  ) {
    return NextResponse.json({ error: "Complete the manual booking form before saving." }, { status: 400 });
  }

  try {
    const created = await createManualAdminBooking({
      sessionId: payload.sessionId,
      playerName: payload.playerName,
      playerAge: payload.playerAge,
      parentName: payload.parentName,
      parentEmail: payload.parentEmail,
      parentPhone: payload.parentPhone,
      emergencyName: payload.emergencyName || "",
      emergencyPhone: payload.emergencyPhone || "",
      medicalNotes: payload.medicalNotes || "",
      paymentStatus: payload.paymentStatus,
      paymentMethod: payload.paymentMethod,
      amountPaid: Math.max(0, Math.round(Number(payload.amountPaid) || 0)),
      waiverStatus: payload.waiverStatus || "missing",
      internalNote: payload.internalNote || "",
      passPurchaseId: payload.passPurchaseId || "",
      overrideCapacity: Boolean(payload.overrideCapacity)
    });

    let calendarStatus = "Not attempted";
    let emailSent = false;

    if (created.booking.paymentStatus === "Paid") {
      const finalized = await finalizeConfirmedBooking(created.booking, {
        sendEmails: Boolean(payload.sendConfirmationEmail),
        sendAdminAlert: Boolean(payload.sendAdminAlert),
        adminAlertSource: "manual_admin_booking"
      });
      calendarStatus = finalized.calendarResult.status;
      emailSent = finalized.emailResult?.sent ?? false;
    }

    return NextResponse.json({
      status: "Saved",
      message:
        created.booking.paymentStatus === "Paid"
          ? payload.sendConfirmationEmail
            ? "Manual booking saved. Confirmation email and Google Calendar sync were attempted."
            : "Manual booking saved. Google Calendar sync was attempted."
          : "Manual booking saved as pending payment.",
      bookingId: created.booking.id,
      calendarStatus,
      emailSent
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Manual booking could not be saved." },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { confirmPaidBooking } from "@/lib/booking-confirmation";
import { verifyAdminSession } from "@/lib/admin-api";
import {
  cancelIncompleteBooking,
  deleteIncompleteBooking,
  getAdminBookingById,
  getBookingRecordForConfirmation,
  isAdminBookingConfirmed
} from "@/lib/supabase-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const admin = await verifyAdminSession();

  if (!admin.authenticated) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const { id } = await context.params;
  const payload = (await request.json().catch(() => null)) as {
    action?: "cancel_incomplete" | "mark_manually_paid";
    amountPaid?: number;
  } | null;

  if (!id) {
    return NextResponse.json({ error: "Booking ID is required." }, { status: 400 });
  }

  try {
    if (payload?.action === "cancel_incomplete") {
      const booking = await cancelIncompleteBooking(id);

      return NextResponse.json({
        status: "Updated",
        message: "Incomplete booking cancelled.",
        booking
      });
    }

    if (payload?.action === "mark_manually_paid") {
      const adminBooking = await getAdminBookingById(id);

      if (!adminBooking) {
        return NextResponse.json({ error: "Booking was not found." }, { status: 404 });
      }

      if (isAdminBookingConfirmed(adminBooking)) {
        return NextResponse.json({ error: "This booking is already confirmed." }, { status: 400 });
      }

      if (!adminBooking.waiver?.waiver_signed) {
        return NextResponse.json(
          { error: "This booking cannot be manually confirmed until a signed waiver is recorded." },
          { status: 400 }
        );
      }

      const amountPaid = Math.round(Number(payload.amountPaid) || 0);

      if (amountPaid <= 0) {
        return NextResponse.json({ error: "Enter the amount paid before manually confirming this booking." }, { status: 400 });
      }

      const booking = await getBookingRecordForConfirmation(id);
      const confirmation = await confirmPaidBooking(
        {
          ...booking,
          paymentStatus: "Paid"
        },
        {
          checkoutSessionId: adminBooking.stripe_checkout_session_id || undefined,
          amountPaid
        }
      );

      return NextResponse.json({
        status: "Confirmed",
        message: "Booking marked manually paid. Confirmation email and calendar sync were attempted.",
        booking: confirmation.booking,
        calendarStatus: confirmation.calendarResult.status,
        emailSent: confirmation.emailResult?.sent ?? false
      });
    }

    return NextResponse.json({ error: "Choose a valid booking action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Booking could not be updated." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const admin = await verifyAdminSession();

  if (!admin.authenticated) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ error: "Booking ID is required." }, { status: 400 });
  }

  try {
    await deleteIncompleteBooking(id);

    return NextResponse.json({
      status: "Deleted",
      message: "Incomplete booking deleted."
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Booking could not be deleted." },
      { status: 500 }
    );
  }
}

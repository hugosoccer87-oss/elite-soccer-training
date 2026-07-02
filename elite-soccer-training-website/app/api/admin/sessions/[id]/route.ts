import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-api";
import {
  deleteTrainingSession,
  issueLaunchPassMakeupCredit,
  listPaidBookingsForSession,
  updateCreditAdjustmentEmailStatus,
  updateTrainingSession
} from "@/lib/supabase-db";
import { normalizeTrainingFocusForStorage } from "@/lib/session-focus";
import { sendMakeupCreditEmail } from "@/lib/transactional-email";
import { syncTrainingSessionCalendarEvent } from "@/lib/google-calendar";

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
    status?: "open" | "closed" | "cancelled";
    capacity?: number;
    location?: string;
    title?: string;
    training_focus?: string | null;
  } | null;
  const updates: {
    status?: "open" | "closed" | "cancelled";
    capacity?: number;
    location?: string;
    title?: string;
    training_focus?: string | null;
  } = {};

  if (payload?.status && ["open", "closed", "cancelled"].includes(payload.status)) {
    updates.status = payload.status;
  }

  if (typeof payload?.capacity === "number") {
    updates.capacity = payload.capacity;
  }

  if (typeof payload?.location === "string") {
    updates.location = payload.location;
  }

  if (typeof payload?.title === "string") {
    updates.title = payload.title;
  }

  if (typeof payload?.training_focus === "string" || payload?.training_focus === null) {
    updates.training_focus = normalizeTrainingFocusForStorage(payload.training_focus);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid session updates were provided." }, { status: 400 });
  }

  try {
    const session = await updateTrainingSession(id, updates);
    const updatedSession = session[0];
    let calendarSync:
      | {
          status: string;
          eventId?: string;
          message?: string;
        }
      | undefined;

    if (updatedSession) {
      try {
        const result = await syncTrainingSessionCalendarEvent(updatedSession);
        calendarSync = {
          status: result.status,
          eventId: result.eventId,
          message: result.message
        };
      } catch (calendarError) {
        calendarSync = {
          status: "Failed",
          message: calendarError instanceof Error ? calendarError.message : "Google Calendar session sync failed."
        };
        console.error("[EST Calendar] Calendar event creation failed", {
          sessionId: updatedSession.id,
          reason: calendarSync.message
        });
      }
    }

    if (updates.status === "cancelled") {
      const paidBookings = await listPaidBookingsForSession(id);
      const launchPassBookings = paidBookings.filter(
        (booking) =>
          booking.payment_type === "launch_pass_credit" ||
          Boolean(booking.pass_purchase_id) ||
          Boolean(booking.credit_redemption_id)
      );
      const cardPaidBookings = paidBookings.filter(
        (booking) =>
          !(
            booking.payment_type === "launch_pass_credit" ||
            Boolean(booking.pass_purchase_id) ||
            Boolean(booking.credit_redemption_id)
          )
      );
      const returned: Array<{ playerName: string; parentEmail: string; emailSent: boolean }> = [];
      const skipped: Array<{ playerName: string; reason: string }> = [];

      for (const booking of launchPassBookings) {
        try {
          const issued = await issueLaunchPassMakeupCredit({
            bookingId: booking.id,
            createdBy: "system"
          });
          const emailResult = await sendMakeupCreditEmail({
            adjustment: issued.adjustment,
            booking: issued.booking,
            session: issued.session,
            pass: issued.pass
          });
          await updateCreditAdjustmentEmailStatus({
            adjustmentId: issued.adjustment.id,
            status: emailResult.sent ? "sent" : "failed",
            errorMessage: emailResult.message
          });
          returned.push({
            playerName: issued.booking.player_name,
            parentEmail: issued.booking.parent_email,
            emailSent: emailResult.sent
          });
        } catch (creditError) {
          skipped.push({
            playerName: booking.player_name,
            reason: creditError instanceof Error ? creditError.message : "Credit could not be returned."
          });
        }
      }

      const emailSentCount = returned.filter((item) => item.emailSent).length;
      const creditMessage =
        launchPassBookings.length === 0
          ? "Session cancelled. No Training credits needed to be returned."
          : `Session cancelled. ${returned.length} Training credit${returned.length === 1 ? "" : "s"} returned. ${emailSentCount} parent email${emailSentCount === 1 ? "" : "s"} sent.`;
      const cardNotice =
        cardPaidBookings.length > 0
          ? " This session has card-paid bookings. Refunds must be handled separately in Stripe or manually."
          : "";

      return NextResponse.json({
        status: "Updated",
        session: updatedSession,
        cancellationCredits: {
          returned,
          skipped,
          launchPassBookings: launchPassBookings.length,
          cardPaidBookings: cardPaidBookings.length
        },
        calendarSync,
        message: `${creditMessage}${cardNotice}`
      });
    }

    return NextResponse.json({ status: "Updated", session: updatedSession, calendarSync });
  } catch (error) {
    return NextResponse.json(
      { status: "Failed", error: error instanceof Error ? error.message : "Training session could not be updated." },
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

  try {
    await deleteTrainingSession(id);

    return NextResponse.json({ status: "Deleted" });
  } catch (error) {
    return NextResponse.json(
      { status: "Failed", error: error instanceof Error ? error.message : "Training session could not be deleted." },
      { status: 500 }
    );
  }
}

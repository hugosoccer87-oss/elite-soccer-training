import { type BookingRecord } from "@/lib/booking-data";
import { createBookingCalendarEvent } from "@/lib/google-calendar";
import {
  logEmailStatus,
  markBookingPaidAndSaveWaiver,
  saveCalendarEventRecord
} from "@/lib/supabase-db";
import { sendBookingTransactionalEmails } from "@/lib/transactional-email";

export async function confirmPaidBooking(
  booking: BookingRecord,
  payment: {
    checkoutSessionId?: string;
    paymentIntentId?: string;
    amountPaid?: number;
  } = {}
) {
  console.info("[EST Booking] Paid booking confirmation started", {
    bookingId: booking.id,
    programName: booking.programName,
    playerName: booking.playerName,
    sessionDateIso: booking.sessionDateIso,
    sessionDate: booking.sessionDate,
    sessionTime: booking.sessionTime,
    paymentStatus: booking.paymentStatus
  });

  await markBookingPaidAndSaveWaiver(booking, payment);

  const calendarResult = await createBookingCalendarEvent(booking);

  if (calendarResult.status !== "Created") {
    console.error("[EST Booking] Paid booking calendar confirmation failed", {
      bookingId: booking.id,
      calendarStatus: calendarResult.status,
      calendarMessage: calendarResult.message
    });
  }

  try {
    await saveCalendarEventRecord(booking.id, calendarResult.eventId);
  } catch (error) {
    console.error("[EST Calendar] Calendar event ID could not be saved", {
      bookingId: booking.id,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  const confirmedBooking: BookingRecord = {
    ...booking,
    calendarStatus: calendarResult.status,
    calendarMessage: calendarResult.message,
    calendarEventId: calendarResult.eventId,
    calendarEventUrl: calendarResult.eventUrl,
    paymentStatus: "Paid"
  };

  console.info("[EST Stripe] Booking confirmed", {
    bookingId: booking.id,
    calendarEventId: calendarResult.eventId,
    calendarStatus: calendarResult.status,
    calendarAlreadyExists: Boolean(calendarResult.alreadyExists)
  });

  const emailResult = calendarResult.alreadyExists
    ? null
    : await (async () => {
        console.info("[EST Stripe] Starting email notifications", {
          bookingId: booking.id
        });
        const result = await sendBookingTransactionalEmails(confirmedBooking);
        await Promise.allSettled([
          logEmailStatus({
            bookingId: booking.id,
            emailType: "customer",
            recipient: confirmedBooking.email,
            status: result.customerSent ? "sent" : "failed",
            errorMessage: result.customerSent ? undefined : result.message
          }),
          logEmailStatus({
            bookingId: booking.id,
            emailType: "admin",
            recipient: "info@elitesoccertrainingcv.com",
            status: result.adminSent ? "sent" : "failed",
            errorMessage: result.adminSent ? undefined : result.message
          })
        ]);
        console.info("[EST Stripe] Email notifications complete", {
          bookingId: booking.id,
          sent: result.sent,
          customerSent: result.customerSent,
          adminSent: result.adminSent,
          message: result.message
        });
        return result;
      })();

  if (calendarResult.alreadyExists) {
    console.info("[EST Stripe] Email notifications complete", {
      bookingId: booking.id,
      skipped: true,
      reason: "Booking calendar event already exists"
    });
  }

  return {
    booking: {
      ...confirmedBooking,
      notificationStatus: emailResult?.sent
        ? "Sent"
        : emailResult
          ? emailResult.message?.includes("email configuration is missing")
            ? "Email service not configured"
            : "Email delivery needs attention"
          : confirmedBooking.notificationStatus
    },
    calendarResult,
    emailResult
  };
}

import { type BookingRecord } from "@/lib/booking-data";
import { createBookingCalendarEvent } from "@/lib/google-calendar";
import { sendBookingTransactionalEmails } from "@/lib/transactional-email";

export async function confirmPaidBooking(booking: BookingRecord) {
  console.info("[EST Booking] Paid booking confirmation started", {
    bookingId: booking.id,
    programName: booking.programName,
    playerName: booking.playerName,
    sessionDateIso: booking.sessionDateIso,
    sessionDate: booking.sessionDate,
    sessionTime: booking.sessionTime,
    paymentStatus: booking.paymentStatus
  });

  const calendarResult = await createBookingCalendarEvent(booking);

  if (calendarResult.status !== "Created") {
    console.error("[EST Booking] Paid booking calendar confirmation failed", {
      bookingId: booking.id,
      calendarStatus: calendarResult.status,
      calendarMessage: calendarResult.message
    });

    return {
      booking: {
        ...booking,
        calendarStatus: calendarResult.status,
        calendarMessage: calendarResult.message
      },
      calendarResult,
      emailResult: null
    };
  }

  const confirmedBooking: BookingRecord = {
    ...booking,
    calendarStatus: calendarResult.status,
    calendarMessage: calendarResult.message,
    calendarEventId: calendarResult.eventId,
    calendarEventUrl: calendarResult.eventUrl
  };

  console.info("[EST Stripe] Booking confirmed", {
    bookingId: booking.id,
    calendarEventId: calendarResult.eventId,
    calendarAlreadyExists: Boolean(calendarResult.alreadyExists)
  });

  const emailResult = calendarResult.alreadyExists
    ? null
    : await (async () => {
        console.info("[EST Stripe] Starting email notifications", {
          bookingId: booking.id
        });
        const result = await sendBookingTransactionalEmails(confirmedBooking);
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
      notificationStatus: emailResult?.sent ? "Sent" : confirmedBooking.notificationStatus
    },
    calendarResult,
    emailResult
  };
}

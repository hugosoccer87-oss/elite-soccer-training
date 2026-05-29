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

  const emailResult = calendarResult.alreadyExists
    ? null
    : await sendBookingTransactionalEmails(confirmedBooking);

  return {
    booking: {
      ...confirmedBooking,
      notificationStatus: emailResult?.sent ? "Sent" : confirmedBooking.notificationStatus
    },
    calendarResult,
    emailResult
  };
}

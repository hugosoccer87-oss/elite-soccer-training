import { NextResponse } from "next/server";
import { type BookingRecord } from "@/lib/booking-data";
import { createBookingCalendarEvent } from "@/lib/google-calendar";
import { sendBookingTransactionalEmails } from "@/lib/transactional-email";

export async function POST(request: Request) {
  const booking = (await request.json()) as BookingRecord;

  if (!booking?.id || !booking?.email) {
    return NextResponse.json({ error: "Invalid booking payload" }, { status: 400 });
  }

  console.info("[EST Booking] Booking confirmation started", {
    bookingId: booking.id,
    programName: booking.programName,
    playerName: booking.playerName,
    sessionDateIso: booking.sessionDateIso,
    sessionDate: booking.sessionDate,
    sessionTime: booking.sessionTime
  });

  const calendarResult = await createBookingCalendarEvent(booking);

  if (calendarResult.status === "Unavailable") {
    console.warn("[EST Booking] Google Calendar availability prevented booking confirmation", {
      bookingId: booking.id,
      calendarStatus: calendarResult.status,
      calendarMessage: calendarResult.message
    });

    return NextResponse.json(
      {
        error: calendarResult.message ?? "That session is no longer available.",
        notificationStatus: "Ready",
        calendarStatus: calendarResult.status,
        calendarMessage: calendarResult.message
      },
      { status: 409 }
    );
  }

  if (calendarResult.status !== "Created") {
    console.error("[EST Booking] Google Calendar event creation failed", {
      bookingId: booking.id,
      calendarStatus: calendarResult.status,
      calendarMessage: calendarResult.message
    });

    return NextResponse.json(
      {
        error:
          calendarResult.message ??
          "Google Calendar event could not be created. The booking was not confirmed.",
        notificationStatus: "Ready",
        calendarStatus: calendarResult.status,
        calendarMessage: calendarResult.message
      },
      { status: 502 }
    );
  }

  const confirmedBooking: BookingRecord = {
    ...booking,
    calendarStatus: calendarResult.status,
    calendarMessage: calendarResult.message,
    calendarEventId: calendarResult.eventId,
    calendarEventUrl: calendarResult.eventUrl
  };
  const emailResult = await sendBookingTransactionalEmails(confirmedBooking);

  return NextResponse.json({
    notificationStatus: emailResult.sent ? "Sent" : "Email delivery needs attention",
    emailMessage: emailResult.message,
    calendarStatus: calendarResult.status,
    calendarMessage: calendarResult.message,
    calendarEventId: calendarResult.eventId,
    calendarEventUrl: calendarResult.eventUrl
  });
}

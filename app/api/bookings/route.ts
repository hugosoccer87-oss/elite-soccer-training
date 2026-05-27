import { NextResponse } from "next/server";
import { bookingNotificationEmail, type BookingRecord } from "@/lib/booking-data";
import { createBookingCalendarEvent } from "@/lib/google-calendar";

const resendEndpoint = "https://api.resend.com/emails";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function bookingDetailsText(booking: BookingRecord) {
  return [
    `Parent/Guardian Name: ${booking.parentName}`,
    `Player Name: ${booking.playerName}`,
    `Player Age: ${booking.playerAge}`,
    `Program Selected: ${booking.programName}`,
    `Session Date/Time: ${booking.sessionDate} at ${booking.sessionTime}`,
    `Number of Players: ${booking.players}`,
    `Notes: ${booking.notes || "None"}`,
    `Medical Notes/Injuries: ${booking.medicalNotes || "None"}`,
    `Emergency Contact: ${booking.emergencyName} - ${booking.emergencyPhone}`,
    `Payment Status: ${booking.paymentStatus}`,
    `Phone: ${booking.phone}`,
    `Email: ${booking.email}`,
    `Booking ID: ${booking.id}`
  ].join("\n");
}

function bookingDetailsHtml(booking: BookingRecord) {
  const rows = [
    ["Parent/Guardian Name", booking.parentName],
    ["Player Name", booking.playerName],
    ["Player Age", booking.playerAge],
    ["Program Selected", booking.programName],
    ["Session Date/Time", `${booking.sessionDate} at ${booking.sessionTime}`],
    ["Number of Players", booking.players],
    ["Notes", booking.notes || "None"],
    ["Medical Notes/Injuries", booking.medicalNotes || "None"],
    ["Emergency Contact", `${booking.emergencyName} - ${booking.emergencyPhone}`],
    ["Payment Status", booking.paymentStatus],
    ["Phone", booking.phone],
    ["Email", booking.email],
    ["Booking ID", booking.id]
  ];

  return `
    <div style="font-family:Arial,sans-serif;color:#06152b;line-height:1.5">
      <h1 style="margin:0 0 8px;font-size:24px">New Elite Soccer Training Booking</h1>
      <p style="margin:0 0 20px;color:#475569">A parent completed registration and payment.</p>
      <table style="border-collapse:collapse;width:100%;max-width:640px">
        ${rows
          .map(
            ([label, value]) => `
              <tr>
                <td style="border:1px solid #dbe4ef;padding:10px;font-weight:700;background:#f5f8fc">${escapeHtml(label)}</td>
                <td style="border:1px solid #dbe4ef;padding:10px">${escapeHtml(value)}</td>
              </tr>
            `
          )
          .join("")}
      </table>
    </div>
  `;
}

function parentConfirmationText(booking: BookingRecord) {
  return [
    `Hi ${booking.parentName},`,
    "",
    `Your Elite Soccer Training session is confirmed.`,
    "",
    `Program: ${booking.programName}`,
    `Player: ${booking.playerName}`,
    `Session: ${booking.sessionDate} at ${booking.sessionTime}`,
    `Players attending: ${booking.players}`,
    `Payment status: ${booking.paymentStatus}`,
    `Booking ID: ${booking.id}`,
    "",
    "Thank you for booking with Elite Soccer Training.",
    "Coach Hugo Chaparro"
  ].join("\n");
}

function parentConfirmationHtml(booking: BookingRecord) {
  return `
    <div style="font-family:Arial,sans-serif;color:#06152b;line-height:1.6">
      <p style="margin:0 0 8px;color:#1d7cff;font-weight:800;text-transform:uppercase">Elite Soccer Training</p>
      <h1 style="margin:0 0 12px;font-size:28px">Session Confirmed</h1>
      <p>Hi ${escapeHtml(booking.parentName)},</p>
      <p>Your ${escapeHtml(booking.programName)} session for ${escapeHtml(booking.playerName)} is confirmed.</p>
      <div style="margin:20px 0;padding:18px;border:1px solid #dbe4ef;background:#f5f8fc">
        <p style="margin:0"><strong>Session:</strong> ${escapeHtml(booking.sessionDate)} at ${escapeHtml(booking.sessionTime)}</p>
        <p style="margin:6px 0 0"><strong>Players attending:</strong> ${escapeHtml(booking.players)}</p>
        <p style="margin:6px 0 0"><strong>Payment status:</strong> ${escapeHtml(booking.paymentStatus)}</p>
        <p style="margin:6px 0 0"><strong>Booking ID:</strong> ${escapeHtml(booking.id)}</p>
      </div>
      <p>A reminder notification will be sent before training.</p>
      <p>Coach Hugo Chaparro<br />Elite Soccer Training</p>
    </div>
  `;
}

async function sendEmail({ to, subject, text, html }: { to: string; subject: string; text: string; html?: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EST_FROM_EMAIL ?? "Elite Soccer Training <onboarding@resend.dev>";

  if (!apiKey) {
    return false;
  }

  const response = await fetch(resendEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      text,
      html
    })
  });

  return response.ok;
}

export async function POST(request: Request) {
  const booking = (await request.json()) as BookingRecord;

  if (!booking?.id || !booking?.email) {
    return NextResponse.json({ error: "Invalid booking payload" }, { status: 400 });
  }

  const calendarResult = await createBookingCalendarEvent(booking);

  if (calendarResult.status === "Unavailable") {
    return NextResponse.json(
      {
        error: calendarResult.message ?? "That session is no longer available.",
        notificationStatus: "Ready",
        calendarStatus: calendarResult.status
      },
      { status: 409 }
    );
  }

  const ownerSent = await sendEmail({
    to: bookingNotificationEmail,
    subject: `New EST booking: ${booking.playerName} - ${booking.programName}`,
    text: bookingDetailsText(booking),
    html: bookingDetailsHtml(booking)
  });

  const parentSent = await sendEmail({
    to: booking.email,
    subject: "Elite Soccer Training session confirmed",
    text: parentConfirmationText(booking),
    html: parentConfirmationHtml(booking)
  });

  return NextResponse.json({
    notificationStatus: ownerSent && parentSent ? "Sent" : "Email service not configured",
    calendarStatus: calendarResult.status,
    calendarEventId: calendarResult.eventId,
    calendarEventUrl: calendarResult.eventUrl
  });
}

import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-api";
import { bookingNotificationEmail } from "@/lib/booking-data";
import { sendAdminTestEmail } from "@/lib/transactional-email";

export const runtime = "nodejs";

export async function POST() {
  const admin = await verifyAdminSession();

  if (!admin.authenticated) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  try {
    const result = await sendAdminTestEmail();

    return NextResponse.json({
      sent: true,
      to: bookingNotificationEmail,
      messageId: result.messageId
    });
  } catch (error) {
    return NextResponse.json(
      {
        sent: false,
        to: bookingNotificationEmail,
        error: error instanceof Error ? error.message : "Test email could not be sent."
      },
      { status: 500 }
    );
  }
}

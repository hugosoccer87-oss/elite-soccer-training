import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-api";
import { listCalendarBookingEvents } from "@/lib/google-calendar";

export const runtime = "nodejs";

export async function GET() {
  const admin = await verifyAdminSession();

  if (!admin.authenticated) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const result = await listCalendarBookingEvents();

  return NextResponse.json(result, { status: result.status === "Failed" ? 500 : 200 });
}

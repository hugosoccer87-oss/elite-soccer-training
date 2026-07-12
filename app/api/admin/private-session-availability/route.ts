import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-api";
import {
  createPrivateSessionAvailability,
  listAdminPrivateSessionAvailability,
  type PrivateSessionAvailabilityStatus
} from "@/lib/supabase-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statuses = new Set<PrivateSessionAvailabilityStatus>(["available", "booked", "closed", "cancelled"]);

export async function GET() {
  const admin = await verifyAdminSession();

  if (!admin.authenticated) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  try {
    const privateSessions = await listAdminPrivateSessionAvailability();

    return NextResponse.json({ status: "Synced", privateSessions });
  } catch (error) {
    return NextResponse.json(
      { status: "Failed", error: error instanceof Error ? error.message : "Private session availability could not be loaded." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const admin = await verifyAdminSession();

  if (!admin.authenticated) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const payload = (await request.json().catch(() => null)) as {
    date?: string;
    startTime?: string;
    endTime?: string;
    location?: string;
    sessionFocus?: string;
    notes?: string;
    status?: PrivateSessionAvailabilityStatus;
  } | null;

  if (!payload?.date || !payload.startTime) {
    return NextResponse.json({ error: "Date and start time are required." }, { status: 400 });
  }

  try {
    const privateSession = await createPrivateSessionAvailability({
      date: payload.date,
      startTime: payload.startTime,
      endTime: payload.endTime,
      location: payload.location,
      sessionFocus: payload.sessionFocus || "Private Session",
      notes: payload.notes,
      status: payload.status && statuses.has(payload.status) ? payload.status : "available"
    });

    return NextResponse.json({ status: "Created", privateSession });
  } catch (error) {
    return NextResponse.json(
      { status: "Failed", error: error instanceof Error ? error.message : "Private session availability could not be created." },
      { status: 500 }
    );
  }
}

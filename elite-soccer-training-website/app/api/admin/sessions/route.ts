import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-api";
import {
  createTrainingSession,
  listAdminTrainingSessions
} from "@/lib/supabase-db";
import { type TrainingGroupId, trainingGroups } from "@/lib/booking-data";
import { normalizeTrainingFocusForStorage } from "@/lib/session-focus";
import { syncTrainingSessionCalendarEvent } from "@/lib/google-calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isTrainingGroupId(value: string): value is TrainingGroupId {
  return trainingGroups.some((group) => group.id === value);
}

export async function GET() {
  const admin = await verifyAdminSession();

  if (!admin.authenticated) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  try {
    const sessions = await listAdminTrainingSessions();

    return NextResponse.json({ status: "Synced", sessions });
  } catch (error) {
    return NextResponse.json(
      { status: "Failed", error: error instanceof Error ? error.message : "Training sessions could not be loaded." },
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
    trainingGroup?: string;
    date?: string;
    time?: string;
    endTime?: string;
    trainingFocus?: string | null;
    capacity?: number;
    location?: string;
    status?: "open" | "closed" | "cancelled";
  } | null;

  if (!payload?.trainingGroup || !isTrainingGroupId(payload.trainingGroup) || !payload.date || !payload.time) {
    return NextResponse.json({ error: "Training group, date, and start time are required." }, { status: 400 });
  }

  try {
    const session = await createTrainingSession({
      trainingGroup: payload.trainingGroup,
      date: payload.date,
      time: payload.time,
      endTime: payload.endTime,
      trainingFocus: normalizeTrainingFocusForStorage(payload.trainingFocus) ?? undefined,
      capacity: payload.capacity,
      location: payload.location,
      status: payload.status && ["open", "closed", "cancelled"].includes(payload.status) ? payload.status : "open"
    });
    const createdSession = session[0];
    let calendarSync:
      | {
          status: string;
          eventId?: string;
          message?: string;
        }
      | undefined;

    if (createdSession) {
      try {
        const result = await syncTrainingSessionCalendarEvent(createdSession);
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
          sessionId: createdSession.id,
          reason: calendarSync.message
        });
      }
    }

    return NextResponse.json({ status: "Created", session: createdSession, calendarSync });
  } catch (error) {
    return NextResponse.json(
      { status: "Failed", error: error instanceof Error ? error.message : "Training session could not be created." },
      { status: 500 }
    );
  }
}

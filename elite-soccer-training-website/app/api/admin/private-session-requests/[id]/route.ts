import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-api";
import { syncPrivateSessionCalendarEvent } from "@/lib/google-calendar";
import {
  schedulePrivateSessionRequest,
  updatePrivateSessionRequest,
  type PrivateSessionRequestStatus
} from "@/lib/supabase-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statuses = new Set<PrivateSessionRequestStatus>(["new", "contacted", "scheduled", "completed", "cancelled"]);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdminSession();

  if (!admin.authenticated) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const { id } = await context.params;
  const payload = (await request.json().catch(() => null)) as {
    status?: PrivateSessionRequestStatus;
    date?: string;
    startTime?: string;
    endTime?: string;
    location?: string;
  } | null;

  if (!id) {
    return NextResponse.json({ error: "Private session request ID is required." }, { status: 400 });
  }

  try {
    let updated = null;

    if (payload?.date && payload.startTime) {
      updated = await schedulePrivateSessionRequest({
        id,
        date: payload.date,
        startTime: payload.startTime,
        endTime: payload.endTime,
        location: payload.location
      });

      if (updated) {
        try {
          const calendar = await syncPrivateSessionCalendarEvent(updated);
          updated = await updatePrivateSessionRequest(id, {
            google_calendar_event_id: calendar.eventId ?? updated.google_calendar_event_id ?? null,
            calendar_status: calendar.status,
            calendar_message: calendar.message ?? (calendar.eventId ? "Google Calendar synced." : null)
          });
        } catch (calendarError) {
          updated = await updatePrivateSessionRequest(id, {
            calendar_status: "Failed",
            calendar_message: calendarError instanceof Error ? calendarError.message : "Google Calendar sync failed."
          });
        }
      }
    } else if (payload?.status && statuses.has(payload.status)) {
      updated = await updatePrivateSessionRequest(id, { status: payload.status });
    } else {
      return NextResponse.json({ error: "Choose a valid status or schedule date/time." }, { status: 400 });
    }

    return NextResponse.json({ status: "Updated", request: updated });
  } catch (error) {
    return NextResponse.json(
      { status: "Failed", error: error instanceof Error ? error.message : "Private session request could not be updated." },
      { status: 500 }
    );
  }
}

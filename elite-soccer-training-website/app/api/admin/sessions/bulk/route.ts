import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-api";
import { type TrainingGroupId, trainingGroups, slotCapacity } from "@/lib/booking-data";
import { createTrainingSession, listTrainingSessions, type TrainingSessionRow } from "@/lib/supabase-db";
import { syncTrainingSessionCalendarEvent } from "@/lib/google-calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BulkSessionInput = {
  trainingGroup?: string;
  date?: string;
  time?: string;
  endTime?: string;
  trainingFocus?: string | null;
  capacity?: number;
  location?: string;
  status?: "open" | "closed" | "cancelled";
};

function isTrainingGroupId(value: string): value is TrainingGroupId {
  return trainingGroups.some((group) => group.id === value);
}

function formatDateOnly(value: string, timeZone = "America/Los_Angeles") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  })
    .formatToParts(new Date(value))
    .reduce<Record<string, string>>((current, part) => {
      if (part.type !== "literal") {
        current[part.type] = part.value;
      }

      return current;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatTimeInput(value: string, timeZone = "America/Los_Angeles") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  })
    .formatToParts(new Date(value))
    .reduce<Record<string, string>>((current, part) => {
      if (part.type !== "literal") {
        current[part.type] = part.value;
      }

      return current;
    }, {});

  return `${parts.hour ?? "00"}:${parts.minute ?? "00"}`;
}

function existingSessionKey(session: {
  training_group: string;
  start_datetime: string;
  end_datetime: string;
  timezone?: string | null;
}) {
  const timeZone = session.timezone || "America/Los_Angeles";

  return [
    session.training_group,
    formatDateOnly(session.start_datetime, timeZone),
    formatTimeInput(session.start_datetime, timeZone),
    formatTimeInput(session.end_datetime, timeZone)
  ].join("|");
}

function proposedSessionKey(session: Required<Pick<BulkSessionInput, "trainingGroup" | "date" | "time" | "endTime">>) {
  return [session.trainingGroup, session.date, session.time, session.endTime].join("|");
}

export async function POST(request: Request) {
  const admin = await verifyAdminSession();

  if (!admin.authenticated) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const payload = (await request.json().catch(() => null)) as { sessions?: BulkSessionInput[] } | null;
  const requestedSessions = payload?.sessions ?? [];

  if (!Array.isArray(requestedSessions) || requestedSessions.length === 0) {
    return NextResponse.json({ error: "Choose at least one session to create." }, { status: 400 });
  }

  if (requestedSessions.length > 250) {
    return NextResponse.json({ error: "Bulk creation is limited to 250 sessions at a time." }, { status: 400 });
  }

  try {
    const existingSessions = await listTrainingSessions();
    const existingKeys = new Set(existingSessions.map(existingSessionKey));
    const requestedKeys = new Set<string>();
    const created: TrainingSessionRow[] = [];
    const skipped: Array<BulkSessionInput & { reason: string }> = [];

    for (const session of requestedSessions) {
      const trainingGroup = session.trainingGroup;
      const date = session.date;
      const time = session.time;
      const endTime = session.endTime;

      if (!trainingGroup || !isTrainingGroupId(trainingGroup) || !date || !time || !endTime) {
        skipped.push({ ...session, reason: "Missing required session details." });
        continue;
      }

      if (endTime <= time) {
        skipped.push({ ...session, reason: "End time must be after start time." });
        continue;
      }

      const key = proposedSessionKey({ trainingGroup, date, time, endTime });

      if (requestedKeys.has(key)) {
        skipped.push({ ...session, reason: "Duplicate in this bulk request." });
        continue;
      }

      requestedKeys.add(key);

      if (existingKeys.has(key)) {
        skipped.push({ ...session, reason: "Already exists." });
        continue;
      }

      const rows = await createTrainingSession({
        trainingGroup,
        date,
        time,
        endTime,
        trainingFocus: session.trainingFocus ?? undefined,
        capacity: Math.min(slotCapacity, Math.max(1, Number(session.capacity) || slotCapacity)),
        location: session.location,
        status: session.status || "open"
      });
      const createdSession = rows[0];

      if (createdSession) {
        created.push(createdSession);
        existingKeys.add(key);
      }
    }
    const calendarSyncResults = await Promise.allSettled(
      created.map(async (session) => {
        const result = await syncTrainingSessionCalendarEvent(session);

        return {
          sessionId: session.id,
          status: result.status,
          eventId: result.eventId,
          message: result.message
        };
      })
    );
    const calendarSync = calendarSyncResults.map((result, index) =>
      result.status === "fulfilled"
        ? result.value
        : {
            sessionId: created[index]?.id,
            status: "Failed",
            message: result.reason instanceof Error ? result.reason.message : "Google Calendar session sync failed."
          }
    );

    return NextResponse.json({
      status: "Created",
      createdCount: created.length,
      skippedCount: skipped.length,
      created,
      skipped,
      calendarSync
    });
  } catch (error) {
    return NextResponse.json(
      { status: "Failed", error: error instanceof Error ? error.message : "Bulk sessions could not be created." },
      { status: 500 }
    );
  }
}

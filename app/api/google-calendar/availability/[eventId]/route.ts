import { NextResponse } from "next/server";
import {
  deleteCalendarAvailabilitySlot,
  updateCalendarAvailabilitySlot
} from "@/lib/google-calendar";

type RouteContext = {
  params: Promise<{
    eventId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { eventId } = await context.params;
  const updates = await request.json();
  const result = await updateCalendarAvailabilitySlot(eventId, updates);

  return NextResponse.json(result, { status: result.status === "Failed" ? 500 : 200 });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { eventId } = await context.params;
  const result = await deleteCalendarAvailabilitySlot(eventId);

  return NextResponse.json(result, { status: result.status === "Failed" ? 500 : 200 });
}

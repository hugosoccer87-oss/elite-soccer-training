import { NextResponse } from "next/server";
import {
  createCalendarAvailabilitySlot,
  listCalendarAvailabilitySlots
} from "@/lib/google-calendar";
import { type TrainingSlot } from "@/lib/booking-data";

export async function GET() {
  const result = await listCalendarAvailabilitySlots();

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const slot = (await request.json()) as TrainingSlot;

  if (!slot?.id || !slot?.dateIso || !slot?.time) {
    return NextResponse.json({ error: "Invalid availability slot." }, { status: 400 });
  }

  const result = await createCalendarAvailabilitySlot(slot);

  return NextResponse.json(result, { status: result.status === "Failed" ? 500 : 200 });
}

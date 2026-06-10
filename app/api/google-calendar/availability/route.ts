import { NextResponse } from "next/server";
import {
  createCalendarAvailabilitySlot,
  listCalendarAvailabilitySlots
} from "@/lib/google-calendar";
import { type TrainingSlot } from "@/lib/booking-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache"
};

export async function GET() {
  const result = await listCalendarAvailabilitySlots();

  return NextResponse.json(result, {
    headers: noStoreHeaders
  });
}

export async function POST(request: Request) {
  const slot = (await request.json()) as TrainingSlot;

  if (!slot?.id || !slot?.dateIso || !slot?.time) {
    return NextResponse.json({ error: "Invalid availability slot." }, { status: 400 });
  }

  const result = await createCalendarAvailabilitySlot(slot);

  return NextResponse.json(result, {
    status: result.status === "Failed" ? 500 : 200,
    headers: noStoreHeaders
  });
}

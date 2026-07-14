import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-api";
import {
  deletePrivateSessionAvailability,
  updatePrivateSessionAvailability,
  type PrivateSessionAvailabilityStatus,
  type PrivateSessionVisibility
} from "@/lib/supabase-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statuses = new Set<PrivateSessionAvailabilityStatus>(["available", "booked", "closed", "cancelled"]);
const visibilities = new Set<PrivateSessionVisibility>(["public", "private_link", "hidden"]);

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdminSession();

  if (!admin.authenticated) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const { id } = await context.params;
  const payload = (await request.json().catch(() => null)) as {
    date?: string;
    startTime?: string;
    endTime?: string;
    location?: string;
    sessionFocus?: string;
    notes?: string | null;
    status?: PrivateSessionAvailabilityStatus;
    visibility?: PrivateSessionVisibility;
  } | null;

  if (!id) {
    return NextResponse.json({ error: "Private session availability ID is required." }, { status: 400 });
  }

  try {
    const privateSession = await updatePrivateSessionAvailability(id, {
      date: payload?.date,
      startTime: payload?.startTime,
      endTime: payload?.endTime,
      location: payload?.location,
      session_focus: payload?.sessionFocus,
      notes: payload?.notes,
      status: payload?.status && statuses.has(payload.status) ? payload.status : undefined,
      visibility: payload?.visibility && visibilities.has(payload.visibility) ? payload.visibility : undefined
    });

    return NextResponse.json({ status: "Updated", privateSession });
  } catch (error) {
    return NextResponse.json(
      { status: "Failed", error: error instanceof Error ? error.message : "Private session availability could not be updated." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdminSession();

  if (!admin.authenticated) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const { id } = await context.params;

  try {
    await deletePrivateSessionAvailability(id);

    return NextResponse.json({ status: "Deleted" });
  } catch (error) {
    return NextResponse.json(
      { status: "Failed", error: error instanceof Error ? error.message : "Private session availability could not be deleted." },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-api";
import { deleteTrainingSession, updateTrainingSession } from "@/lib/supabase-db";
import { normalizeTrainingFocusForStorage } from "@/lib/session-focus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const admin = await verifyAdminSession();

  if (!admin.authenticated) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const { id } = await context.params;
  const payload = (await request.json().catch(() => null)) as {
    status?: "open" | "closed" | "cancelled";
    capacity?: number;
    location?: string;
    title?: string;
    training_focus?: string | null;
  } | null;
  const updates: {
    status?: "open" | "closed" | "cancelled";
    capacity?: number;
    location?: string;
    title?: string;
    training_focus?: string | null;
  } = {};

  if (payload?.status && ["open", "closed", "cancelled"].includes(payload.status)) {
    updates.status = payload.status;
  }

  if (typeof payload?.capacity === "number") {
    updates.capacity = payload.capacity;
  }

  if (typeof payload?.location === "string") {
    updates.location = payload.location;
  }

  if (typeof payload?.title === "string") {
    updates.title = payload.title;
  }

  if (typeof payload?.training_focus === "string" || payload?.training_focus === null) {
    updates.training_focus = normalizeTrainingFocusForStorage(payload.training_focus);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid session updates were provided." }, { status: 400 });
  }

  try {
    const session = await updateTrainingSession(id, updates);

    return NextResponse.json({ status: "Updated", session: session[0] });
  } catch (error) {
    return NextResponse.json(
      { status: "Failed", error: error instanceof Error ? error.message : "Training session could not be updated." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const admin = await verifyAdminSession();

  if (!admin.authenticated) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const { id } = await context.params;

  try {
    await deleteTrainingSession(id);

    return NextResponse.json({ status: "Deleted" });
  } catch (error) {
    return NextResponse.json(
      { status: "Failed", error: error instanceof Error ? error.message : "Training session could not be deleted." },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-api";
import { deleteEmailSubscriber, updateEmailSubscriberStatus } from "@/lib/supabase-db";

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
  const payload = (await request.json().catch(() => null)) as { unsubscribed?: boolean } | null;

  if (typeof payload?.unsubscribed !== "boolean") {
    return NextResponse.json({ error: "Choose a valid subscriber status." }, { status: 400 });
  }

  try {
    const subscriber = await updateEmailSubscriberStatus(id, payload.unsubscribed);

    if (!subscriber) {
      return NextResponse.json({ error: "Subscriber was not found." }, { status: 404 });
    }

    return NextResponse.json({ status: "Updated", subscriber });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Subscriber could not be updated." },
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
    await deleteEmailSubscriber(id);

    return NextResponse.json({ status: "Deleted" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Subscriber could not be removed." },
      { status: 500 }
    );
  }
}

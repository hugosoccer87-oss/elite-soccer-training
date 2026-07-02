import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-api";
import { listAdminEmailSubscribers } from "@/lib/supabase-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await verifyAdminSession();

  if (!admin.authenticated) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  try {
    const subscribers = await listAdminEmailSubscribers();

    return NextResponse.json({ status: "Synced", subscribers });
  } catch (error) {
    return NextResponse.json(
      { status: "Failed", error: error instanceof Error ? error.message : "Email subscribers could not be loaded." },
      { status: 500 }
    );
  }
}

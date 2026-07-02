import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-api";
import { listAdminPrivateSessionRequests } from "@/lib/supabase-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await verifyAdminSession();

  if (!admin.authenticated) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  try {
    const requests = await listAdminPrivateSessionRequests();

    return NextResponse.json({ status: "Synced", requests });
  } catch (error) {
    return NextResponse.json(
      { status: "Failed", error: error instanceof Error ? error.message : "Private session requests could not be loaded." },
      { status: 500 }
    );
  }
}

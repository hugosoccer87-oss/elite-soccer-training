import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-api";
import { listAdminPassPurchases } from "@/lib/supabase-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await verifyAdminSession();

  if (!admin.authenticated) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  try {
    const passes = await listAdminPassPurchases();

    return NextResponse.json({ status: "Synced", passes });
  } catch (error) {
    return NextResponse.json(
      { status: "Failed", error: error instanceof Error ? error.message : "Training Packages could not be loaded." },
      { status: 500 }
    );
  }
}

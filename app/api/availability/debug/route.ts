import { NextResponse } from "next/server";
import { getServerAvailabilityDebug } from "@/lib/public-availability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStoreHeaders = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
  Pragma: "no-cache"
};

export async function GET() {
  const result = await getServerAvailabilityDebug();

  return NextResponse.json(result, {
    headers: noStoreHeaders
  });
}

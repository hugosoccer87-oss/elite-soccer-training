import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-api";
import { updateDirectPaymentStatus, type DirectPaymentStatus } from "@/lib/supabase-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function isDirectPaymentStatus(value: string): value is DirectPaymentStatus {
  return ["pending_card_payment", "zelle_pending", "paid", "cancelled"].includes(value);
}

export async function PATCH(request: Request, context: RouteContext) {
  const admin = await verifyAdminSession();

  if (!admin.authenticated) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const { id } = await context.params;
  const payload = (await request.json().catch(() => null)) as { status?: string } | null;

  if (!payload?.status || !isDirectPaymentStatus(payload.status)) {
    return NextResponse.json({ error: "Choose a valid direct payment status." }, { status: 400 });
  }

  try {
    const directPayment = await updateDirectPaymentStatus(id, payload.status);

    if (!directPayment) {
      return NextResponse.json({ error: "Direct payment record was not found." }, { status: 404 });
    }

    return NextResponse.json({ status: "Updated", directPayment });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Direct payment could not be updated." },
      { status: 500 }
    );
  }
}

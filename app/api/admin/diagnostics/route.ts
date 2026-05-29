import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { adminSessionCookie, getAdminSessionValue } from "@/lib/admin-auth";
import { getLastPaymentVerificationResult } from "@/lib/stripe-diagnostics";
import { getStripeKeyMode, hasStripeWebhookSecret } from "@/lib/stripe";

export async function GET() {
  const expectedSession = getAdminSessionValue();

  if (!expectedSession) {
    return NextResponse.json(
      { error: "ADMIN_PASSCODE is missing in Vercel Environment Variables." },
      { status: 500 }
    );
  }

  const cookieStore = await cookies();
  const currentSession = cookieStore.get(adminSessionCookie)?.value;

  if (currentSession !== expectedSession) {
    return NextResponse.json({ error: "Admin access required." }, { status: 401 });
  }

  return NextResponse.json({
    stripeKeyMode: getStripeKeyMode(),
    webhookSecretExists: hasStripeWebhookSecret(),
    lastPaymentVerificationResult: getLastPaymentVerificationResult()
  });
}

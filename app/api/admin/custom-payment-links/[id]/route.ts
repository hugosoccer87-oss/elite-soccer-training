import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-api";
import {
  getCustomPaymentLinkById,
  updateCustomPaymentLink,
  type CustomPaymentLinkStatus
} from "@/lib/supabase-db";
import { sendCustomPaymentLinkInviteEmail } from "@/lib/transactional-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://www.elitesoccertrainingcv.com").replace(/\/$/, "");
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdminSession();

  if (!admin.authenticated) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const { id } = await context.params;
  const payload = (await request.json().catch(() => null)) as {
    action?: "mark_sent" | "cancel" | "resend";
  } | null;
  const details = await getCustomPaymentLinkById(id);

  if (!details) {
    return NextResponse.json({ error: "Custom payment link was not found." }, { status: 404 });
  }

  if (payload?.action === "cancel") {
    if (["paid", "partially_scheduled", "fully_scheduled"].includes(details.link.status)) {
      return NextResponse.json({ error: "Paid payment links cannot be cancelled from this action." }, { status: 400 });
    }

    const link = await updateCustomPaymentLink({ id, status: "cancelled" });

    return NextResponse.json({ status: "cancelled", link });
  }

  if (payload?.action === "mark_sent") {
    const nextStatus: CustomPaymentLinkStatus =
      details.link.status === "draft" || details.link.status === "viewed" ? "sent" : details.link.status;
    const link = await updateCustomPaymentLink({ id, status: nextStatus });

    return NextResponse.json({ status: "sent", link });
  }

  if (payload?.action === "resend") {
    const paymentUrl = `${siteUrl()}/custom-payment/${details.link.token}`;
    const emailResult = await sendCustomPaymentLinkInviteEmail(details.link, paymentUrl);
    const link = await updateCustomPaymentLink({
      id,
      status: details.link.status === "draft" || details.link.status === "viewed" ? "sent" : details.link.status
    });

    return NextResponse.json({
      status: emailResult.sent ? "sent" : "email_failed",
      link,
      paymentUrl,
      emailSent: emailResult.sent,
      emailMessage: emailResult.message
    });
  }

  return NextResponse.json({ error: "Choose a valid payment link action." }, { status: 400 });
}

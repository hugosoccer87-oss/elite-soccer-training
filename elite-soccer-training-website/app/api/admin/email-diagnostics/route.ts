import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin-api";
import { getEmailEnvironmentDiagnostics } from "@/lib/transactional-email";

export const runtime = "nodejs";

function yesNo(value: boolean) {
  return value ? "yes" : "no";
}

export async function GET() {
  const admin = await verifyAdminSession();

  if (!admin.authenticated) {
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const diagnostics = getEmailEnvironmentDiagnostics();

  return NextResponse.json({
    emailProvider: diagnostics.provider,
    smtpHostConfigured: yesNo(diagnostics.smtpHostConfigured),
    smtpPortConfigured: yesNo(diagnostics.smtpPortConfigured),
    smtpUserConfigured: yesNo(diagnostics.smtpUserConfigured),
    smtpPassConfigured: yesNo(diagnostics.smtpPassConfigured),
    emailFromConfigured: yesNo(diagnostics.emailFromConfigured),
    adminRecipientConfigured: yesNo(diagnostics.adminRecipientConfigured),
    adminNotificationRecipient: diagnostics.adminNotificationRecipient,
    lastEmailAttempt: diagnostics.lastEmailAttempt
      ? {
          checkedAt: diagnostics.lastEmailAttempt.checkedAt,
          bookingId: diagnostics.lastEmailAttempt.bookingId,
          customerRecipient: diagnostics.lastEmailAttempt.customerRecipient,
          customerStatus: diagnostics.lastEmailAttempt.customerStatus,
          adminStatus: diagnostics.lastEmailAttempt.adminStatus,
          message: diagnostics.lastEmailAttempt.message
        }
      : null
  });
}

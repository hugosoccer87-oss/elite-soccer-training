import {
  bookingArrivalInstructions,
  business,
  coachHugoConfirmationNote,
  refundCancellationReminder
} from "@/lib/site-data";
import { bookingNotificationEmail, type BookingRecord } from "@/lib/booking-data";
import { formatCurrencyFromCents, getSessionTotalCents, sessionPriceLabel } from "@/lib/pricing";

type NodemailerModule = {
  default?: {
    createTransport: (options: SmtpTransportOptions) => SmtpTransport;
  };
  createTransport?: (options: SmtpTransportOptions) => SmtpTransport;
};

type SmtpTransportOptions = {
  host: string;
  port: number;
  secure: boolean;
  requireTLS?: boolean;
  auth: {
    user: string;
    pass: string;
  };
  tls?: {
    minVersion?: string;
    rejectUnauthorized?: boolean;
  };
};

type SmtpTransport = {
  sendMail: (message: EmailMessage) => Promise<{ messageId?: string }>;
};

type EmailMessage = {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
};

type EmailResult = {
  sent: boolean;
  customerSent: boolean;
  adminSent: boolean;
  message?: string;
};

type EmailAttemptStatus = {
  checkedAt: string;
  bookingId?: string;
  smtpConfigured: boolean;
  emailFromConfigured: boolean;
  adminNotificationRecipient: string;
  customerRecipient?: string;
  customerStatus: "not_attempted" | "sent" | "failed";
  adminStatus: "not_attempted" | "sent" | "failed";
  message?: string;
};

type EmailDiagnosticsStore = {
  lastEmailAttempt: EmailAttemptStatus | null;
};

const globalEmailDiagnostics = globalThis as typeof globalThis & {
  __estEmailDiagnostics?: EmailDiagnosticsStore;
};

const emailDiagnosticsStore =
  globalEmailDiagnostics.__estEmailDiagnostics ??
  (globalEmailDiagnostics.__estEmailDiagnostics = {
    lastEmailAttempt: null
  });

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getSmtpConfig() {
  const rawPort = process.env.SMTP_PORT;
  const port = Number(rawPort || "465");

  return {
    host: process.env.SMTP_HOST,
    rawPort,
    port: Number.isFinite(port) ? port : 465,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.EMAIL_FROM
  };
}

export function getSmtpEnvironmentStatus() {
  const config = getSmtpConfig();

  return {
    smtpHostExists: Boolean(config.host),
    smtpPortExists: Boolean(config.rawPort),
    smtpUserExists: Boolean(config.user),
    smtpPassExists: Boolean(config.pass),
    emailFromExists: Boolean(config.from)
  };
}

export function isSmtpConfigured() {
  const status = getSmtpEnvironmentStatus();

  return (
    status.smtpHostExists &&
    status.smtpPortExists &&
    status.smtpUserExists &&
    status.smtpPassExists &&
    status.emailFromExists
  );
}

export function getEmailDiagnostics() {
  return {
    smtpConfigured: isSmtpConfigured(),
    emailFromConfigured: Boolean(process.env.EMAIL_FROM),
    adminNotificationRecipient: bookingNotificationEmail,
    lastEmailAttempt: emailDiagnosticsStore.lastEmailAttempt
  };
}

function setLastEmailAttempt(status: Omit<EmailAttemptStatus, "checkedAt">) {
  emailDiagnosticsStore.lastEmailAttempt = {
    checkedAt: new Date().toISOString(),
    ...status
  };
}

function logSmtpEnvironment() {
  const status = getSmtpEnvironmentStatus();

  console.info("[EST Email] SMTP environment check", {
    "SMTP_HOST exists": status.smtpHostExists ? "yes" : "no",
    "SMTP_PORT exists": status.smtpPortExists ? "yes" : "no",
    "SMTP_USER exists": status.smtpUserExists ? "yes" : "no",
    "SMTP_PASS exists": status.smtpPassExists ? "yes" : "no",
    "EMAIL_FROM exists": status.emailFromExists ? "yes" : "no",
    "SMTP secure": getSmtpConfig().port === 465 ? "true" : "false"
  });
}

function validateSmtpConfig() {
  const config = getSmtpConfig();
  const missing = [
    ["SMTP_HOST", config.host],
    ["SMTP_PORT", config.rawPort],
    ["SMTP_USER", config.user],
    ["SMTP_PASS", config.pass],
    ["EMAIL_FROM", config.from]
  ].filter(([, value]) => !value);

  return {
    config,
    missing: missing.map(([key]) => key)
  };
}

async function loadNodemailer() {
  const dynamicImport = new Function("specifier", "return import(specifier)") as (
    specifier: string
  ) => Promise<NodemailerModule>;
  const nodemailer = await dynamicImport("nodemailer");
  const createTransport = nodemailer.default?.createTransport ?? nodemailer.createTransport;

  if (!createTransport) {
    throw new Error("Nodemailer createTransport is unavailable.");
  }

  return createTransport;
}

async function createTransport() {
  const { config, missing } = validateSmtpConfig();

  if (missing.length > 0) {
    throw new Error(`Missing SMTP environment variables: ${missing.join(", ")}`);
  }

  const createNodemailerTransport = await loadNodemailer();
  const secure = config.port === 465;

  return createNodemailerTransport({
    host: config.host as string,
    port: config.port,
    secure,
    requireTLS: !secure,
    auth: {
      user: config.user as string,
      pass: config.pass as string
    },
    tls: {
      minVersion: "TLSv1.2",
      rejectUnauthorized: true
    }
  });
}

function detailsRows(rows: Array<[string, string]>) {
  return rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="border:1px solid #dbe4ef;padding:11px 12px;font-weight:800;background:#f5f8fc;color:#06152b">${escapeHtml(label)}</td>
          <td style="border:1px solid #dbe4ef;padding:11px 12px;color:#334155">${escapeHtml(value)}</td>
        </tr>
      `
    )
    .join("");
}

function formatWaiverAcceptedAt(booking: BookingRecord) {
  if (!booking.waiverAcceptedAt) {
    return "Not recorded";
  }

  return new Date(booking.waiverAcceptedAt).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Los_Angeles"
  });
}

function brandedEmailShell({ title, intro, body }: { title: string; intro: string; body: string }) {
  return `
    <!doctype html>
    <html>
      <body style="margin:0;background:#eef4fb;padding:28px;font-family:Arial,sans-serif;color:#06152b">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #d9e2ee;border-radius:10px;overflow:hidden">
          <tr>
            <td style="background:#06152b;padding:26px 28px;color:#ffffff">
              <p style="margin:0 0 8px;color:#1783ff;font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.02em">Elite Soccer Training</p>
              <h1 style="margin:0;font-size:28px;line-height:1.15">${escapeHtml(title)}</h1>
              <p style="margin:12px 0 0;color:#dbeafe;line-height:1.6">${escapeHtml(intro)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px">
              ${body}
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

function customerEmail(booking: BookingRecord): EmailMessage {
  const rows: Array<[string, string]> = [
    ["Date / Time", `${booking.sessionDate} at ${booking.sessionTime}`],
    ["Program", booking.programName],
    ["Player", booking.playerName],
    ["Player Count", booking.players],
    ["Payment", `${booking.players} x ${sessionPriceLabel} = ${formatCurrencyFromCents(getSessionTotalCents(booking.players))}`],
    ["Location", business.location],
    ["Waiver", `${booking.waiverAccepted ? "Accepted electronically" : "Not recorded"}${booking.waiverAcceptedAt ? ` on ${formatWaiverAcceptedAt(booking)}` : ""}`],
    ["Media Consent", booking.mediaConsent || "Not recorded"],
    ["Booking ID", booking.id]
  ];
  const text = [
    "Elite Soccer Training booking confirmed",
    "",
    `Hi ${booking.parentName},`,
    "",
    `Your session is confirmed for ${booking.sessionDate} at ${booking.sessionTime}.`,
    `Program: ${booking.programName}`,
    `Player count: ${booking.players}`,
    `Payment: ${booking.players} x ${sessionPriceLabel} = ${formatCurrencyFromCents(getSessionTotalCents(booking.players))}`,
    `Location: ${business.location}`,
    `Waiver: ${booking.waiverAccepted ? "Accepted electronically" : "Not recorded"}`,
    `Media consent: ${booking.mediaConsent || "Not recorded"}`,
    "",
    ...bookingArrivalInstructions,
    "",
    refundCancellationReminder,
    "",
    coachHugoConfirmationNote,
    "",
    "— Coach Hugo",
    "",
    `Questions? Email ${business.email} or call ${business.phone}.`,
    "",
    `Booking ID: ${booking.id}`
  ].join("\n");
  const html = brandedEmailShell({
    title: "Booking Confirmed",
    intro: "Your small group soccer training session is confirmed.",
    body: `
      <p style="margin:0 0 18px;color:#334155;line-height:1.7">Hi ${escapeHtml(booking.parentName)}, your Elite Soccer Training session is confirmed. We look forward to training with ${escapeHtml(booking.playerName)}.</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:18px 0">
        ${detailsRows(rows)}
      </table>
      <div style="margin-top:22px;border-left:4px solid #1783ff;background:#eef6ff;padding:16px;color:#334155;line-height:1.6">
        <strong style="color:#06152b">Before the session</strong><br />
        ${bookingArrivalInstructions.map((item) => `<p style="margin:10px 0 0">${escapeHtml(item)}</p>`).join("")}
      </div>
      <div style="margin-top:22px;border-left:4px solid #1783ff;background:#f5f8fc;padding:16px;color:#334155;line-height:1.6">
        <strong style="color:#06152b">Refund and cancellation reminder</strong><br />
        <p style="margin:10px 0 0">${escapeHtml(refundCancellationReminder)}</p>
      </div>
      <div style="margin-top:22px;border-left:4px solid #06152b;background:#ffffff;padding:16px;color:#334155;line-height:1.7">
        <p style="margin:0">${escapeHtml(coachHugoConfirmationNote)}</p>
        <p style="margin:14px 0 0;font-weight:800;color:#06152b">— Coach Hugo</p>
      </div>
      <div style="margin-top:22px;border-left:4px solid #1783ff;background:#f5f8fc;padding:16px;color:#334155;line-height:1.6">
        <strong style="color:#06152b">Contact</strong><br />
        Email: ${escapeHtml(business.email)}<br />
        Phone: ${escapeHtml(business.phone)}<br />
        Instagram: ${escapeHtml(business.instagramHandle)}
      </div>
    `
  });

  return {
    from: process.env.EMAIL_FROM as string,
    to: booking.email,
    replyTo: business.email,
    subject: "Elite Soccer Training booking confirmed",
    text,
    html
  };
}

function adminEmail(booking: BookingRecord): EmailMessage {
  const rows: Array<[string, string]> = [
    ["Booking ID", booking.id],
    ["Calendar Event ID", booking.calendarEventId || "Not returned"],
    ["Parent/Guardian", booking.parentName],
    ["Customer Email", booking.email],
    ["Customer Phone", booking.phone],
    ["Player", booking.playerName],
    ["Player Age", booking.playerAge],
    ["Program", booking.programName],
    ["Date / Time", `${booking.sessionDate} at ${booking.sessionTime}`],
    ["Number of Players", booking.players],
    ["Payment Amount", `${booking.players} x ${sessionPriceLabel} = ${formatCurrencyFromCents(getSessionTotalCents(booking.players))}`],
    ["Notes", booking.notes || "None"],
    ["Medical Notes/Injuries", booking.medicalNotes || "None"],
    ["Emergency Contact", `${booking.emergencyName} - ${booking.emergencyPhone}`],
    ["Payment Status", booking.paymentStatus],
    ["Waiver Accepted", booking.waiverAccepted ? "Yes" : "Not recorded"],
    ["Waiver Accepted At", formatWaiverAcceptedAt(booking)],
    ["Waiver Version", booking.waiverVersion || "Not recorded"],
    ["Media Consent", booking.mediaConsent || "Not recorded"],
    ["Digital Signature", booking.guardianSignature || "Not recorded"]
  ];
  const text = rows.map(([label, value]) => `${label}: ${value}`).join("\n");
  const html = brandedEmailShell({
    title: "New Booking Received",
    intro: "A parent completed booking and a Google Calendar event was created.",
    body: `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">
        ${detailsRows(rows)}
      </table>
    `
  });

  return {
    from: process.env.EMAIL_FROM as string,
    to: bookingNotificationEmail,
    replyTo: booking.email,
    subject: `New EST booking: ${booking.playerName} - ${booking.programName}`,
    text,
    html
  };
}

export async function sendBookingTransactionalEmails(booking: BookingRecord): Promise<EmailResult> {
  const customer = customerEmail(booking);
  const admin = adminEmail(booking);
  const baseAttempt = {
    bookingId: booking.id,
    smtpConfigured: isSmtpConfigured(),
    emailFromConfigured: Boolean(process.env.EMAIL_FROM),
    adminNotificationRecipient: bookingNotificationEmail,
    customerRecipient: customer.to
  };

  logSmtpEnvironment();
  console.info("[EST Email] Preparing customer confirmation email", {
    bookingId: booking.id
  });
  console.info("[EST Email] Customer email recipient:", {
    bookingId: booking.id,
    to: customer.to
  });
  console.info("[EST Email] Preparing admin notification email", {
    bookingId: booking.id
  });
  console.info("[EST Email] Admin email recipient:", {
    bookingId: booking.id,
    to: admin.to
  });

  try {
    const transport = await createTransport();

    const [customerResult, adminResult] = await Promise.allSettled([
      transport.sendMail(customer),
      transport.sendMail(admin)
    ]);
    const customerSent = customerResult.status === "fulfilled";
    const adminSent = adminResult.status === "fulfilled";

    if (customerSent) {
      console.info("[EST Email] Customer confirmation sent", {
        to: customer.to,
        bookingId: booking.id,
        messageId: customerResult.value.messageId
      });
    } else {
      console.error("[EST Email] Customer confirmation failed", {
        to: customer.to,
        bookingId: booking.id,
        error: customerResult.reason instanceof Error ? customerResult.reason.message : String(customerResult.reason)
      });
    }

    if (adminSent) {
      console.info("[EST Email] Admin notification sent", {
        to: admin.to,
        bookingId: booking.id,
        messageId: adminResult.value.messageId
      });
    } else {
      console.error("[EST Email] Admin notification failed", {
        to: admin.to,
        bookingId: booking.id,
        error: adminResult.reason instanceof Error ? adminResult.reason.message : String(adminResult.reason)
      });
    }

    setLastEmailAttempt({
      ...baseAttempt,
      customerStatus: customerSent ? "sent" : "failed",
      adminStatus: adminSent ? "sent" : "failed",
      message: customerSent && adminSent ? undefined : "One or more transactional emails failed to send."
    });

    return {
      sent: customerSent && adminSent,
      customerSent,
      adminSent,
      message: customerSent && adminSent ? undefined : "One or more transactional emails failed to send."
    };
  } catch (error) {
    console.error("[EST Email] Customer confirmation failed", {
      to: customer.to,
      bookingId: booking.id,
      error: error instanceof Error ? error.message : String(error)
    });
    console.error("[EST Email] Admin notification failed", {
      to: admin.to,
      bookingId: booking.id,
      error: error instanceof Error ? error.message : String(error)
    });

    setLastEmailAttempt({
      ...baseAttempt,
      customerStatus: "failed",
      adminStatus: "failed",
      message: error instanceof Error ? error.message : "Transactional email failed to send."
    });

    return {
      sent: false,
      customerSent: false,
      adminSent: false,
      message: error instanceof Error ? error.message : "Transactional email failed to send."
    };
  }
}

import {
  bookingArrivalInstructions,
  business,
  coachHugoConfirmationNote,
  refundCancellationReminder
} from "@/lib/site-data";
import { bookingNotificationEmail, type BookingRecord } from "@/lib/booking-data";
import {
  formatCurrencyFromCents,
  getDirectPaymentOption,
  getLaunchPassOption,
  getSessionTotalCents,
  sessionPriceLabel
} from "@/lib/pricing";
import type { BookingRow, CreditAdjustmentRow, DirectPaymentRow, PassPurchaseRow, TrainingSessionRow } from "@/lib/supabase-db";
import { buildSignedWaiverPdf, signedWaiverPdfFileName } from "@/lib/waiver-pdf";

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
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
  }>;
};

type EmailResult = {
  sent: boolean;
  customerSent: boolean;
  adminSent: boolean;
  message?: string;
};

type PassEmailResult = {
  sent: boolean;
  customerSent: boolean;
  adminSent: boolean;
  message?: string;
};

type CustomerOnlyEmailResult = {
  sent: boolean;
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

export const emailProviderName = "Nodemailer SMTP";

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

export function getEmailEnvironmentDiagnostics() {
  const status = getSmtpEnvironmentStatus();

  return {
    provider: emailProviderName,
    smtpHostConfigured: status.smtpHostExists,
    smtpPortConfigured: status.smtpPortExists,
    smtpUserConfigured: status.smtpUserExists,
    smtpPassConfigured: status.smtpPassExists,
    emailFromConfigured: status.emailFromExists,
    adminRecipientConfigured: Boolean(bookingNotificationEmail),
    adminNotificationRecipient: bookingNotificationEmail,
    lastEmailAttempt: emailDiagnosticsStore.lastEmailAttempt
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
    provider: emailProviderName,
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

  console.info(`[EST Email] Email provider: ${emailProviderName}`);
  console.info(`[EST Email] SMTP_HOST configured: ${status.smtpHostExists ? "yes" : "no"}`);
  console.info(`[EST Email] SMTP_PORT configured: ${status.smtpPortExists ? "yes" : "no"}`);
  console.info(`[EST Email] SMTP_USER configured: ${status.smtpUserExists ? "yes" : "no"}`);
  console.info(`[EST Email] SMTP_PASS configured: ${status.smtpPassExists ? "yes" : "no"}`);
  console.info(`[EST Email] EMAIL_FROM configured: ${status.emailFromExists ? "yes" : "no"}`);
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

function bookingPaymentText(booking: BookingRecord) {
  if (booking.paymentType === "launch_pass_credit") {
    return "Paid using Launch Pass credit.";
  }

  return `${booking.players} x ${sessionPriceLabel} = ${formatCurrencyFromCents(getSessionTotalCents(booking.players))}`;
}

function bookingPaymentStatusText(booking: BookingRecord) {
  return booking.paymentType === "launch_pass_credit" ? "Paid using Launch Pass credit" : "Payment confirmed";
}

function brandedEmailShell({ title, intro, body }: { title: string; intro: string; body: string }) {
  return `
    <!doctype html>
    <html>
      <body style="margin:0;background:#eef4fb;padding:28px;font-family:Arial,sans-serif;color:#06152b">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #d9e2ee;border-radius:10px;overflow:hidden">
          <tr>
            <td style="background:#06152b;padding:26px 28px;color:#ffffff">
              <p style="margin:0 0 8px;color:#1783ff;font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.02em">Elite Soccer Training CV</p>
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
    ["Payment Status", bookingPaymentStatusText(booking)],
    ["Payment", bookingPaymentText(booking)],
    ["Location", business.location],
    ["Waiver", `${booking.waiverAccepted ? "Accepted electronically" : "Not recorded"}${booking.waiverAcceptedAt ? ` on ${formatWaiverAcceptedAt(booking)}` : ""}`],
    ["Media Consent", booking.mediaConsent || "Not recorded"],
    ["Booking ID", booking.id]
  ];
  const text = [
    "Elite Soccer Training CV booking confirmed",
    "",
    `Hi ${booking.parentName},`,
    "",
    `Your session is confirmed for ${booking.sessionDate} at ${booking.sessionTime}.`,
    `Program: ${booking.programName}`,
    `Player count: ${booking.players}`,
    `Payment status: ${bookingPaymentStatusText(booking)}`,
    `Payment: ${bookingPaymentText(booking)}`,
    `Location: ${business.location}`,
    `Waiver: ${booking.waiverAccepted ? "Accepted electronically" : "Not recorded"}`,
    "Your waiver has been signed and recorded for this session.",
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
      <p style="margin:0 0 18px;color:#334155;line-height:1.7">Hi ${escapeHtml(booking.parentName)}, your Elite Soccer Training CV session is confirmed. We look forward to training with ${escapeHtml(booking.playerName)}.</p>
      <p style="margin:0 0 18px;color:#334155;line-height:1.7">Your waiver has been signed and recorded for this session.</p>
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
    subject: "Elite Soccer Training CV booking confirmed",
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
    ["Location", business.location],
    ["Number of Players", booking.players],
    ["Payment Type", booking.paymentType === "launch_pass_credit" ? "Launch Pass credit" : "Single Session"],
    ["Payment Amount", bookingPaymentText(booking)],
    ["Remaining Launch Pass Credits", typeof booking.remainingCreditsAfter === "number" ? String(booking.remainingCreditsAfter) : "Not applicable"],
    ["Notes", booking.notes || "None"],
    ["Medical Notes/Injuries", booking.medicalNotes || "None"],
    ["Emergency Contact", `${booking.emergencyName} - ${booking.emergencyPhone}`],
    ["Payment Status", booking.paymentStatus],
    ["Waiver Signed", booking.waiverAccepted ? "Yes" : "Not recorded"],
    ["Typed Waiver Signature", booking.guardianSignature || "Not recorded"],
    ["Signed Timestamp", formatWaiverAcceptedAt(booking)],
    ["IP Address", booking.ipAddress || "Not collected"],
    ["Waiver Version", booking.waiverVersion || "Not recorded"],
    ["Media Consent", booking.mediaConsent || "Not recorded"],
    ["Waiver Record", "Signed waiver details are included in this email and the admin booking record."]
  ];
  const text = rows.map(([label, value]) => `${label}: ${value}`).join("\n");
  const html = brandedEmailShell({
    title: "New Paid Booking",
    intro: "A parent completed payment for a training session.",
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
    subject: `New paid EST booking: ${booking.playerName} - ${booking.programName}`,
    text,
    html
  };
}

function launchPassCustomerEmail(pass: PassPurchaseRow): EmailMessage {
  const option = getLaunchPassOption(pass.pass_type);
  const bookingUrl = `${(process.env.NEXT_PUBLIC_SITE_URL || "https://www.elitesoccertrainingcv.com").replace(/\/$/, "")}/booking`;
  const selectedSessionCount = pass.selected_session_ids?.length ?? 0;
  const rows: Array<[string, string]> = [
    ["Launch Pass", option.title],
    ["Player", pass.player_name],
    ["Training Group", pass.training_group === "future-elite" ? "Future Elite" : "Elite Performance"],
    ["Credits", `${pass.total_credits} session credits`],
    ["Remaining Credits", String(pass.remaining_credits)],
    ["Sessions Selected at Purchase", selectedSessionCount > 0 ? String(selectedSessionCount) : "None"],
    ["Expiration", "June 30, 2026"],
    ["Amount Paid", formatCurrencyFromCents(pass.amount_paid || option.amountCents)]
  ];
  const text = [
    "Elite Soccer Training CV Launch Pass Confirmation",
    "",
    `Hi ${pass.parent_name},`,
    "",
    selectedSessionCount > 0
      ? "Your Launch Pass has been purchased. Selected sessions will be confirmed by email."
      : "Your Launch Pass has been purchased. You can now book sessions using your pass credits.",
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    `Book sessions: ${bookingUrl}`,
    "",
    `Questions? Email ${business.email} or call ${business.phone}.`
  ].join("\n");
  const html = brandedEmailShell({
    title: "Launch Pass Confirmed",
    intro: "Your Launch Pass has been purchased. You can now book sessions using your pass credits.",
    body: `
      <p style="margin:0 0 18px;color:#334155;line-height:1.7">Hi ${escapeHtml(pass.parent_name)}, your Elite Soccer Training CV ${escapeHtml(option.title)} is active for ${escapeHtml(pass.player_name)}.</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:18px 0">
        ${detailsRows(rows)}
      </table>
      <div style="margin-top:22px;border-left:4px solid #1783ff;background:#eef6ff;padding:16px;color:#334155;line-height:1.6">
        <strong style="color:#06152b">Next step</strong><br />
        <p style="margin:10px 0 0">${selectedSessionCount > 0 ? "Any remaining credits can be used later from the booking page." : "Visit the booking page and choose \"Use Existing Launch Pass Credits\" to reserve sessions with this pass."}</p>
        <p style="margin:10px 0 0"><a href="${escapeHtml(bookingUrl)}" style="color:#1783ff;font-weight:800">Book sessions</a></p>
      </div>
    `
  });

  return {
    from: process.env.EMAIL_FROM as string,
    to: pass.parent_email,
    replyTo: business.email,
    subject: "Elite Soccer Training CV Launch Pass Confirmation",
    text,
    html
  };
}

function launchPassAdminEmail(pass: PassPurchaseRow): EmailMessage {
  const option = getLaunchPassOption(pass.pass_type);
  const selectedSessionCount = pass.selected_session_ids?.length ?? 0;
  const rows: Array<[string, string]> = [
    ["Pass Purchase ID", pass.id],
    ["Parent/Guardian", pass.parent_name],
    ["Parent Email", pass.parent_email],
    ["Parent Phone", pass.parent_phone],
    ["Player", pass.player_name],
    ["Player Age", pass.player_age],
    ["Training Group", pass.training_group === "future-elite" ? "Future Elite" : "Elite Performance"],
    ["Pass Type", option.title],
    ["Credits", `${pass.total_credits} total / ${pass.remaining_credits} remaining`],
    ["Sessions Selected at Purchase", selectedSessionCount > 0 ? `${selectedSessionCount} selected` : "None"],
    ["Selected Session IDs", selectedSessionCount > 0 ? (pass.selected_session_ids ?? []).join(", ") : "None"],
    ["Expiration", "June 30, 2026"],
    ["Amount Paid", formatCurrencyFromCents(pass.amount_paid || option.amountCents)],
    ["Stripe Checkout Session", pass.stripe_checkout_session_id || "Not recorded"],
    ["Stripe Payment Intent", pass.stripe_payment_intent_id || "Not recorded"]
  ];

  return {
    from: process.env.EMAIL_FROM as string,
    to: bookingNotificationEmail,
    replyTo: pass.parent_email,
    subject: `New EST CV Launch Pass: ${pass.player_name} - ${option.title}`,
    text: rows.map(([label, value]) => `${label}: ${value}`).join("\n"),
    html: brandedEmailShell({
      title: "New Launch Pass Purchase",
      intro: "A parent purchased an Elite Soccer Training CV Launch Pass.",
      body: `
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">
          ${detailsRows(rows)}
        </table>
      `
    })
  };
}

function formatDirectPaymentTimestamp(value: string) {
  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Los_Angeles"
  });
}

function formatSessionDate(value: string, timeZone = "America/Los_Angeles") {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

function formatSessionTime(value: string, timeZone = "America/Los_Angeles") {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function makeupCreditCustomerEmail(input: {
  adjustment: CreditAdjustmentRow;
  booking: BookingRow;
  session: TrainingSessionRow;
  pass?: PassPurchaseRow | null;
}): EmailMessage {
  const sessionDate = formatSessionDate(input.session.start_datetime, input.session.timezone);
  const sessionTime = formatSessionTime(input.session.start_datetime, input.session.timezone);
  const remainingCredits = input.pass?.remaining_credits ?? null;
  const text = [
    "EST CV Session Credit Returned",
    "",
    `Hi ${input.booking.parent_name},`,
    "",
    `The EST CV session scheduled for ${sessionDate} at ${sessionTime} has been cancelled.`,
    "",
    `Because ${input.booking.player_name} used a Launch Pass credit for this session, we have added 1 credit back to their Launch Pass.`,
    "",
    `Updated remaining credits: ${remainingCredits ?? "Updated"}`,
    "",
    "This credit can be used toward a future available EST CV training session.",
    "",
    "Thank you for your understanding.",
    "",
    "Coach Hugo",
    "Elite Soccer Training CV"
  ].join("\n");
  const html = brandedEmailShell({
    title: "Session Credit Returned",
    intro: "A training credit has been returned to your Launch Pass.",
    body: `
      <p style="margin:0 0 18px;color:#334155;line-height:1.7">Hi ${escapeHtml(input.booking.parent_name)},</p>
      <p style="margin:0 0 18px;color:#334155;line-height:1.7">The EST CV session scheduled for <strong style="color:#06152b">${escapeHtml(sessionDate)}</strong> at <strong style="color:#06152b">${escapeHtml(sessionTime)}</strong> has been cancelled.</p>
      <p style="margin:0 0 18px;color:#334155;line-height:1.7">Because ${escapeHtml(input.booking.player_name)} used a Launch Pass credit for this session, we have added <strong style="color:#06152b">1 credit</strong> back to their Launch Pass.</p>
      <p style="margin:0 0 18px;color:#334155;line-height:1.7"><strong style="color:#06152b">Updated remaining credits:</strong> ${escapeHtml(String(remainingCredits ?? "Updated"))}</p>
      <p style="margin:0 0 18px;color:#334155;line-height:1.7">This credit can be used toward a future available EST CV training session.</p>
      <p style="margin:24px 0 0;color:#334155;line-height:1.7">Thank you for your understanding.<br />Coach Hugo<br />Elite Soccer Training CV</p>
    `
  });

  return {
    from: process.env.EMAIL_FROM as string,
    to: input.booking.parent_email,
    replyTo: business.email,
    subject: "EST CV Session Credit Returned",
    text,
    html
  };
}

function manualCreditCustomerEmail(input: {
  adjustment: CreditAdjustmentRow;
  pass: PassPurchaseRow;
}): EmailMessage {
  const reason = input.adjustment.reason || "Makeup credit";
  const text = [
    "EST CV Training Credit Added",
    "",
    `Hi ${input.pass.parent_name},`,
    "",
    `A training credit has been added to ${input.pass.player_name}'s EST CV Launch Pass.`,
    "",
    `Credit added: ${input.adjustment.credit_amount}`,
    `Reason: ${reason}`,
    `Updated remaining credits: ${input.pass.remaining_credits}`,
    "",
    "You can use this credit toward a future available EST CV training session.",
    "",
    "Thank you,",
    "Coach Hugo",
    "Elite Soccer Training CV"
  ].join("\n");
  const html = brandedEmailShell({
    title: "Training Credit Added",
    intro: "A training credit has been added to your EST CV Launch Pass.",
    body: `
      <p style="margin:0 0 18px;color:#334155;line-height:1.7">Hi ${escapeHtml(input.pass.parent_name)},</p>
      <p style="margin:0 0 18px;color:#334155;line-height:1.7">A training credit has been added to ${escapeHtml(input.pass.player_name)}'s EST CV Launch Pass.</p>
      <p style="margin:0 0 8px;color:#334155;line-height:1.7"><strong style="color:#06152b">Credit added:</strong> ${input.adjustment.credit_amount}</p>
      <p style="margin:0 0 8px;color:#334155;line-height:1.7"><strong style="color:#06152b">Reason:</strong> ${escapeHtml(reason)}</p>
      <p style="margin:0 0 18px;color:#334155;line-height:1.7"><strong style="color:#06152b">Updated remaining credits:</strong> ${input.pass.remaining_credits}</p>
      <p style="margin:0 0 18px;color:#334155;line-height:1.7">You can use this credit toward a future available EST CV training session.</p>
      <p style="margin:24px 0 0;color:#334155;line-height:1.7">Thank you,<br />Coach Hugo<br />Elite Soccer Training CV</p>
    `
  });

  return {
    from: process.env.EMAIL_FROM as string,
    to: input.pass.parent_email,
    replyTo: business.email,
    subject: "EST CV Training Credit Added",
    text,
    html
  };
}

function directPaymentPlayerNames(record: DirectPaymentRow) {
  const firstPlayerName = `${record.player_first_name} ${record.player_last_name}`.trim();
  const secondPlayerName =
    record.player_count === 2
      ? `${record.second_player_first_name ?? ""} ${record.second_player_last_name ?? ""}`.trim()
      : "";

  return [firstPlayerName, secondPlayerName].filter(Boolean).join(" + ");
}

function directPaymentPlayerAges(record: DirectPaymentRow) {
  const ages = [record.player_age];

  if (record.player_count === 2 && record.second_player_age) {
    ages.push(record.second_player_age);
  }

  return ages.join(" / ");
}

function directPaymentSessionCount(record: DirectPaymentRow) {
  return record.payment_option === "single_session" ? Math.min(6, Math.max(1, Number(record.session_count) || 1)) : 1;
}

function directPaymentZelleMemo(record: DirectPaymentRow) {
  const option = getDirectPaymentOption(record.payment_option);
  const playerNames = directPaymentPlayerNames(record);

  if (record.payment_option === "single_session") {
    const sessions = directPaymentSessionCount(record);

    return `${playerNames} - Single Session - ${sessions} ${sessions === 1 ? "Session" : "Sessions"}`;
  }

  return `${playerNames} - ${option.title}`;
}

function directPaymentCommonRows(record: DirectPaymentRow, paymentStatus: string) {
  const option = getDirectPaymentOption(record.payment_option);
  const sessions = directPaymentSessionCount(record);
  const rows: Array<[string, string]> = [
    ["Parent/Guardian Name", record.parent_name],
    ["Parent Email", record.parent_email],
    ["Parent Phone", record.parent_phone],
    ["Player Name(s)", directPaymentPlayerNames(record)],
    ["Player Age(s)", directPaymentPlayerAges(record)],
    ["Payment Option", option.title],
    ["Number of Players", String(record.player_count || 1)]
  ];

  if (record.payment_option === "single_session") {
    rows.push(["Number of Sessions", String(sessions)]);
  }

  rows.push(
    ["Total Amount", formatCurrencyFromCents(record.status === "paid" ? record.amount_paid || record.amount_due : record.amount_due)],
    ["Payment Method", record.payment_method === "card" ? "Card" : "Zelle"],
    ["Payment Status", paymentStatus],
    ["Emergency Contact Name", record.emergency_name],
    ["Emergency Contact Phone", record.emergency_phone],
    ["Medical Conditions / Allergies / Notes", record.medical_notes || "None"],
    ["Media Consent", record.media_consent],
    ["Waiver Submitted", record.waiver_signed ? "Yes, signed and recorded" : "Not recorded"],
    ["Waiver Signature Name", record.typed_signature],
    ["Submission Timestamp", formatDirectPaymentTimestamp(record.created_at)],
    ["Signed Timestamp", formatDirectPaymentTimestamp(record.signed_at)],
    ["Direct Payment ID", record.id]
  );

  return rows;
}

function directPaymentCustomerEmail(record: DirectPaymentRow): EmailMessage {
  const isCardPaid = record.payment_method === "card" && record.status === "paid";
  const paymentStatus = isCardPaid ? "Card Paid" : "Zelle Pending";
  const totalLabel = isCardPaid ? "Total Amount Paid" : "Total Amount Owed";
  const rows = directPaymentCommonRows(record, paymentStatus).map(([label, value]) =>
    label === "Total Amount" ? [totalLabel, value] as [string, string] : [label, value] as [string, string]
  );
  const zelleMemo = directPaymentZelleMemo(record);
  const subject = isCardPaid ? "EST CV Payment Confirmation" : "EST CV Zelle Payment Instructions";
  const text = [
    isCardPaid ? "EST CV Payment Confirmation" : "EST CV Zelle Payment Instructions",
    "",
    `Hi ${record.parent_name},`,
    "",
    isCardPaid
      ? "Your card payment and signed waiver have been recorded for Elite Soccer Training CV."
      : "Your waiver has been recorded. Your Zelle payment is pending manual confirmation.",
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    ...(record.payment_method === "zelle"
      ? [
          "",
          "Zelle instructions:",
          "Send Zelle payment to: 3236848024",
          `Memo: ${zelleMemo}`
        ]
      : []),
    "",
    `Questions? Email ${business.email} or call ${business.phone}.`
  ].join("\n");
  const html = brandedEmailShell({
    title: isCardPaid ? "Payment Confirmed" : "Zelle Payment Instructions",
    intro: isCardPaid
      ? "Your payment and waiver have been recorded."
      : "Your waiver has been recorded. Please complete Zelle payment using the instructions below.",
    body: `
      <p style="margin:0 0 18px;color:#334155;line-height:1.7">Hi ${escapeHtml(record.parent_name)}, ${
        isCardPaid
          ? "your card payment and waiver are complete."
          : "your waiver has been submitted and your Zelle payment is pending manual confirmation."
      }</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:18px 0">
        ${detailsRows(rows)}
      </table>
      ${
        record.payment_method === "zelle"
          ? `
            <div style="margin-top:22px;border-left:4px solid #1783ff;background:#eef6ff;padding:16px;color:#334155;line-height:1.6">
              <strong style="color:#06152b">Zelle instructions</strong><br />
              Send Zelle payment to: <strong style="color:#06152b">3236848024</strong><br />
              Memo: <strong style="color:#06152b">${escapeHtml(zelleMemo)}</strong>
            </div>
          `
          : ""
      }
      <div style="margin-top:22px;border-left:4px solid #1783ff;background:#f5f8fc;padding:16px;color:#334155;line-height:1.6">
        <strong style="color:#06152b">Contact</strong><br />
        Email: ${escapeHtml(business.email)}<br />
        Phone: ${escapeHtml(business.phone)}
      </div>
    `
  });

  return {
    from: process.env.EMAIL_FROM as string,
    to: record.parent_email,
    replyTo: business.email,
    subject,
    text,
    html
  };
}

function directPaymentAdminEmail(record: DirectPaymentRow): EmailMessage {
  const isCardPaid = record.payment_method === "card" && record.status === "paid";
  const paymentStatus = isCardPaid ? "Card Paid" : "Zelle Pending";
  const rows = directPaymentCommonRows(record, paymentStatus);
  const subject = isCardPaid ? "New EST CV Direct Payment - Card Paid" : "New EST CV Direct Payment - Zelle Pending";

  return {
    from: process.env.EMAIL_FROM as string,
    to: bookingNotificationEmail,
    replyTo: record.parent_email,
    subject,
    text: rows.map(([label, value]) => `${label}: ${value}`).join("\n"),
    html: brandedEmailShell({
      title: isCardPaid ? "New Direct Payment - Card Paid" : "New Direct Payment - Zelle Pending",
      intro: "A parent submitted the EST CV direct payment and waiver form.",
      body: `
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">
          ${detailsRows(rows)}
        </table>
      `
    })
  };
}

function buildAdminWaiverAttachment(booking: BookingRecord): EmailMessage["attachments"] {
  try {
    console.info("[EST Waiver] Building signed waiver PDF", {
      bookingId: booking.id,
      playerName: booking.playerName
    });
    const pdf = buildSignedWaiverPdf(booking);

    console.info("[EST Waiver] Signed waiver PDF built successfully", {
      bookingId: booking.id,
      bytes: pdf.byteLength
    });
    console.info("[EST Waiver] Waiver PDF attached to admin email", {
      bookingId: booking.id,
      filename: signedWaiverPdfFileName(booking)
    });

    return [
      {
        filename: signedWaiverPdfFileName(booking),
        content: pdf,
        contentType: "application/pdf"
      }
    ];
  } catch (error) {
    console.error("[EST Waiver] Waiver PDF generation failed", {
      bookingId: booking.id,
      error: error instanceof Error ? error.message : String(error)
    });
    console.error("[EST Waiver] Waiver PDF attachment failed", {
      bookingId: booking.id,
      reason: "PDF could not be generated."
    });

    return undefined;
  }
}

export async function sendAdminTestEmail() {
  try {
    logSmtpEnvironment();

    const transport = await createTransport();
    const now = new Date().toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "America/Los_Angeles"
    });
    const message: EmailMessage = {
      from: process.env.EMAIL_FROM as string,
      to: bookingNotificationEmail,
      subject: "Elite Soccer Training CV test email",
      text: [
        "Elite Soccer Training CV test email",
        "",
        `Sent at: ${now}`,
        "If you received this, SMTP email sending is working."
      ].join("\n"),
      html: brandedEmailShell({
        title: "Test Email",
        intro: "SMTP email sending is working for Elite Soccer Training CV.",
        body: `
          <p style="margin:0;color:#334155;line-height:1.7">This is a test email from the protected admin email test route.</p>
          <p style="margin:16px 0 0;color:#334155;line-height:1.7"><strong>Sent at:</strong> ${escapeHtml(now)}</p>
        `
      })
    };

    console.info("[EST Email] Preparing admin notification email", {
      testEmail: true
    });
    console.info("[EST Email] Admin recipient:", {
      to: bookingNotificationEmail,
      testEmail: true
    });

    const result = await transport.sendMail(message);

    setLastEmailAttempt({
      smtpConfigured: isSmtpConfigured(),
      emailFromConfigured: Boolean(process.env.EMAIL_FROM),
      adminNotificationRecipient: bookingNotificationEmail,
      adminStatus: "sent",
      customerStatus: "not_attempted",
      message: "Admin test email sent successfully."
    });

    console.info("[EST Email] Admin email sent successfully", {
      to: bookingNotificationEmail,
      messageId: result.messageId,
      testEmail: true
    });

    return result;
  } catch (error) {
    setLastEmailAttempt({
      smtpConfigured: isSmtpConfigured(),
      emailFromConfigured: Boolean(process.env.EMAIL_FROM),
      adminNotificationRecipient: bookingNotificationEmail,
      adminStatus: "failed",
      customerStatus: "not_attempted",
      message: error instanceof Error ? error.message : "Admin test email failed."
    });

    console.error("[EST Email] Admin email failed:", {
      to: bookingNotificationEmail,
      error: error instanceof Error ? error.message : String(error),
      testEmail: true
    });

    throw error;
  }
}

export async function sendBookingTransactionalEmails(booking: BookingRecord): Promise<EmailResult> {
  const customer = customerEmail(booking);
  const admin = adminEmail(booking);
  admin.attachments = buildAdminWaiverAttachment(booking);
  const baseAttempt = {
    bookingId: booking.id,
    smtpConfigured: isSmtpConfigured(),
    emailFromConfigured: Boolean(process.env.EMAIL_FROM),
    adminNotificationRecipient: bookingNotificationEmail,
    customerRecipient: customer.to
  };

  logSmtpEnvironment();

  if (!isSmtpConfigured()) {
    const message = "Booking confirmed, but confirmation emails were not sent because email configuration is missing.";

    console.warn(`[EST Email] ${message}`, {
      bookingId: booking.id
    });
    setLastEmailAttempt({
      ...baseAttempt,
      customerStatus: "failed",
      adminStatus: "failed",
      message
    });

    return {
      sent: false,
      customerSent: false,
      adminSent: false,
      message
    };
  }

  console.info("[EST Email] Preparing customer confirmation email", {
    bookingId: booking.id
  });
  console.info("[EST Email] Customer recipient:", {
    bookingId: booking.id,
    to: customer.to
  });
  console.info("[EST Email] Preparing admin notification email", {
    bookingId: booking.id
  });
  console.info("[EST Email] Admin recipient:", {
    bookingId: booking.id,
    to: admin.to
  });

  try {
    const transport = await createTransport();

    const [customerResult, firstAdminResult] = await Promise.allSettled([
      transport.sendMail(customer),
      transport.sendMail(admin)
    ]);
    const customerSent = customerResult.status === "fulfilled";
    let adminResult = firstAdminResult;
    let adminSent = firstAdminResult.status === "fulfilled";

    if (!adminSent && admin.attachments?.length) {
      const attachmentError =
        firstAdminResult.status === "rejected" ? firstAdminResult.reason : "Admin email failed with attachment.";
      console.error("[EST Waiver] Waiver PDF attachment failed", {
        bookingId: booking.id,
        error: attachmentError instanceof Error ? attachmentError.message : String(attachmentError)
      });

      const fallbackAdmin = {
        ...admin,
        attachments: undefined
      };
      adminResult = await Promise.resolve(transport.sendMail(fallbackAdmin)).then(
        (value) => ({ status: "fulfilled" as const, value }),
        (reason) => ({ status: "rejected" as const, reason })
      );
      adminSent = adminResult.status === "fulfilled";
    }

    if (customerSent) {
      console.info("[EST Email] Customer email sent successfully", {
        to: customer.to,
        bookingId: booking.id,
        messageId: customerResult.value.messageId
      });
    } else {
      console.error("[EST Email] Customer email failed:", {
        to: customer.to,
        bookingId: booking.id,
        error: customerResult.reason instanceof Error ? customerResult.reason.message : String(customerResult.reason)
      });
    }

    if (adminResult.status === "fulfilled") {
      console.info("[EST Email] Admin email sent successfully", {
        to: admin.to,
        bookingId: booking.id,
        messageId: adminResult.value.messageId
      });
    } else {
      console.error("[EST Email] Admin email failed:", {
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
    console.error("[EST Email] Customer email failed:", {
      to: customer.to,
      bookingId: booking.id,
      error: error instanceof Error ? error.message : String(error)
    });
    console.error("[EST Email] Admin email failed:", {
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

export async function sendLaunchPassTransactionalEmails(pass: PassPurchaseRow): Promise<PassEmailResult> {
  const customer = launchPassCustomerEmail(pass);
  const admin = launchPassAdminEmail(pass);
  const baseAttempt = {
    bookingId: pass.id,
    smtpConfigured: isSmtpConfigured(),
    emailFromConfigured: Boolean(process.env.EMAIL_FROM),
    adminNotificationRecipient: bookingNotificationEmail,
    customerRecipient: customer.to
  };

  logSmtpEnvironment();

  if (!isSmtpConfigured()) {
    const message = "Launch Pass confirmed, but emails were not sent because email configuration is missing.";

    console.warn(`[EST Email] ${message}`, {
      passPurchaseId: pass.id
    });
    setLastEmailAttempt({
      ...baseAttempt,
      customerStatus: "failed",
      adminStatus: "failed",
      message
    });

    return {
      sent: false,
      customerSent: false,
      adminSent: false,
      message
    };
  }

  console.info("[EST Email] Preparing customer confirmation email", {
    passPurchaseId: pass.id,
    type: "launch_pass"
  });
  console.info("[EST Email] Customer recipient:", {
    passPurchaseId: pass.id,
    to: customer.to
  });
  console.info("[EST Email] Preparing admin notification email", {
    passPurchaseId: pass.id,
    type: "launch_pass"
  });
  console.info("[EST Email] Admin recipient:", {
    passPurchaseId: pass.id,
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
      console.info("[EST Email] Customer email sent successfully", {
        to: customer.to,
        passPurchaseId: pass.id,
        messageId: customerResult.value.messageId
      });
    } else {
      console.error("[EST Email] Customer email failed:", {
        to: customer.to,
        passPurchaseId: pass.id,
        error: customerResult.reason instanceof Error ? customerResult.reason.message : String(customerResult.reason)
      });
    }

    if (adminSent) {
      console.info("[EST Email] Admin email sent successfully", {
        to: admin.to,
        passPurchaseId: pass.id,
        messageId: adminResult.value.messageId
      });
    } else {
      console.error("[EST Email] Admin email failed:", {
        to: admin.to,
        passPurchaseId: pass.id,
        error: adminResult.reason instanceof Error ? adminResult.reason.message : String(adminResult.reason)
      });
    }

    setLastEmailAttempt({
      ...baseAttempt,
      customerStatus: customerSent ? "sent" : "failed",
      adminStatus: adminSent ? "sent" : "failed",
      message: customerSent && adminSent ? undefined : "One or more Launch Pass emails failed to send."
    });

    return {
      sent: customerSent && adminSent,
      customerSent,
      adminSent,
      message: customerSent && adminSent ? undefined : "One or more Launch Pass emails failed to send."
    };
  } catch (error) {
    setLastEmailAttempt({
      ...baseAttempt,
      customerStatus: "failed",
      adminStatus: "failed",
      message: error instanceof Error ? error.message : "Launch Pass email failed to send."
    });

    console.error("[EST Email] Customer email failed:", {
      to: customer.to,
      passPurchaseId: pass.id,
      error: error instanceof Error ? error.message : String(error)
    });
    console.error("[EST Email] Admin email failed:", {
      to: admin.to,
      passPurchaseId: pass.id,
      error: error instanceof Error ? error.message : String(error)
    });

    return {
      sent: false,
      customerSent: false,
      adminSent: false,
      message: error instanceof Error ? error.message : "Launch Pass email failed to send."
    };
  }
}

export async function sendMakeupCreditEmail(input: {
  adjustment: CreditAdjustmentRow;
  booking: BookingRow;
  session: TrainingSessionRow;
  pass?: PassPurchaseRow | null;
}): Promise<CustomerOnlyEmailResult> {
  const customer = makeupCreditCustomerEmail(input);
  const baseAttempt = {
    bookingId: input.booking.id,
    smtpConfigured: isSmtpConfigured(),
    emailFromConfigured: Boolean(process.env.EMAIL_FROM),
    adminNotificationRecipient: bookingNotificationEmail,
    customerRecipient: customer.to
  };

  logSmtpEnvironment();

  if (!isSmtpConfigured()) {
    const message = "Makeup credit was added, but parent email was not sent because email configuration is missing.";

    console.warn(`[EST Email] ${message}`, {
      bookingId: input.booking.id,
      creditAdjustmentId: input.adjustment.id
    });
    setLastEmailAttempt({
      ...baseAttempt,
      customerStatus: "failed",
      adminStatus: "not_attempted",
      message
    });

    return {
      sent: false,
      message
    };
  }

  console.info("[EST Email] Preparing customer confirmation email", {
    bookingId: input.booking.id,
    creditAdjustmentId: input.adjustment.id,
    type: "makeup_credit"
  });
  console.info("[EST Email] Customer recipient:", {
    bookingId: input.booking.id,
    to: customer.to
  });

  try {
    const transport = await createTransport();
    const result = await transport.sendMail(customer);

    console.info("[EST Email] Customer email sent successfully", {
      to: customer.to,
      bookingId: input.booking.id,
      creditAdjustmentId: input.adjustment.id,
      messageId: result.messageId
    });
    setLastEmailAttempt({
      ...baseAttempt,
      customerStatus: "sent",
      adminStatus: "not_attempted"
    });

    return {
      sent: true
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Makeup credit email failed to send.";

    console.error("[EST Email] Customer email failed:", {
      to: customer.to,
      bookingId: input.booking.id,
      creditAdjustmentId: input.adjustment.id,
      error: message
    });
    setLastEmailAttempt({
      ...baseAttempt,
      customerStatus: "failed",
      adminStatus: "not_attempted",
      message
    });

    return {
      sent: false,
      message
    };
  }
}

export async function sendManualCreditEmail(input: {
  adjustment: CreditAdjustmentRow;
  pass: PassPurchaseRow;
}): Promise<CustomerOnlyEmailResult> {
  const customer = manualCreditCustomerEmail(input);
  const baseAttempt = {
    bookingId: input.adjustment.id,
    smtpConfigured: isSmtpConfigured(),
    emailFromConfigured: Boolean(process.env.EMAIL_FROM),
    adminNotificationRecipient: bookingNotificationEmail,
    customerRecipient: customer.to
  };

  logSmtpEnvironment();

  if (!isSmtpConfigured()) {
    const message = "Manual credit was added, but parent email was not sent because email configuration is missing.";

    console.warn(`[EST Email] ${message}`, {
      passPurchaseId: input.pass.id,
      creditAdjustmentId: input.adjustment.id
    });
    setLastEmailAttempt({
      ...baseAttempt,
      customerStatus: "failed",
      adminStatus: "not_attempted",
      message
    });

    return {
      sent: false,
      message
    };
  }

  console.info("[EST Email] Preparing customer confirmation email", {
    passPurchaseId: input.pass.id,
    creditAdjustmentId: input.adjustment.id,
    type: "manual_credit"
  });
  console.info("[EST Email] Customer recipient:", {
    passPurchaseId: input.pass.id,
    to: customer.to
  });

  try {
    const transport = await createTransport();
    const result = await transport.sendMail(customer);

    console.info("[EST Email] Customer email sent successfully", {
      to: customer.to,
      passPurchaseId: input.pass.id,
      creditAdjustmentId: input.adjustment.id,
      messageId: result.messageId
    });
    setLastEmailAttempt({
      ...baseAttempt,
      customerStatus: "sent",
      adminStatus: "not_attempted"
    });

    return {
      sent: true
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Manual credit email failed to send.";

    console.error("[EST Email] Customer email failed:", {
      to: customer.to,
      passPurchaseId: input.pass.id,
      creditAdjustmentId: input.adjustment.id,
      error: message
    });
    setLastEmailAttempt({
      ...baseAttempt,
      customerStatus: "failed",
      adminStatus: "not_attempted",
      message
    });

    return {
      sent: false,
      message
    };
  }
}

export async function sendDirectPaymentTransactionalEmails(record: DirectPaymentRow): Promise<EmailResult> {
  const customer = directPaymentCustomerEmail(record);
  const admin = directPaymentAdminEmail(record);
  const baseAttempt = {
    bookingId: record.id,
    smtpConfigured: isSmtpConfigured(),
    emailFromConfigured: Boolean(process.env.EMAIL_FROM),
    adminNotificationRecipient: bookingNotificationEmail,
    customerRecipient: customer.to
  };

  logSmtpEnvironment();

  if (!isSmtpConfigured()) {
    const message = "Direct payment recorded, but emails were not sent because email configuration is missing.";

    console.warn(`[EST Email] ${message}`, {
      directPaymentId: record.id
    });
    setLastEmailAttempt({
      ...baseAttempt,
      customerStatus: "failed",
      adminStatus: "failed",
      message
    });

    return {
      sent: false,
      customerSent: false,
      adminSent: false,
      message
    };
  }

  console.info("[EST Email] Preparing customer confirmation email", {
    directPaymentId: record.id,
    type: "direct_payment"
  });
  console.info("[EST Email] Customer recipient:", {
    directPaymentId: record.id,
    to: customer.to
  });
  console.info("[EST Email] Preparing admin notification email", {
    directPaymentId: record.id,
    type: "direct_payment"
  });
  console.info("[EST Email] Admin recipient:", {
    directPaymentId: record.id,
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
      console.info("[EST Email] Customer email sent successfully", {
        to: customer.to,
        directPaymentId: record.id,
        messageId: customerResult.value.messageId
      });
    } else {
      console.error("[EST Email] Customer email failed:", {
        to: customer.to,
        directPaymentId: record.id,
        error: customerResult.reason instanceof Error ? customerResult.reason.message : String(customerResult.reason)
      });
    }

    if (adminSent) {
      console.info("[EST Email] Admin email sent successfully", {
        to: admin.to,
        directPaymentId: record.id,
        messageId: adminResult.value.messageId
      });
    } else {
      console.error("[EST Email] Admin email failed:", {
        to: admin.to,
        directPaymentId: record.id,
        error: adminResult.reason instanceof Error ? adminResult.reason.message : String(adminResult.reason)
      });
    }

    setLastEmailAttempt({
      ...baseAttempt,
      customerStatus: customerSent ? "sent" : "failed",
      adminStatus: adminSent ? "sent" : "failed",
      message: customerSent && adminSent ? undefined : "One or more direct payment emails failed to send."
    });

    return {
      sent: customerSent && adminSent,
      customerSent,
      adminSent,
      message: customerSent && adminSent ? undefined : "One or more direct payment emails failed to send."
    };
  } catch (error) {
    setLastEmailAttempt({
      ...baseAttempt,
      customerStatus: "failed",
      adminStatus: "failed",
      message: error instanceof Error ? error.message : "Direct payment email failed to send."
    });

    console.error("[EST Email] Customer email failed:", {
      to: customer.to,
      directPaymentId: record.id,
      error: error instanceof Error ? error.message : String(error)
    });
    console.error("[EST Email] Admin email failed:", {
      to: admin.to,
      directPaymentId: record.id,
      error: error instanceof Error ? error.message : String(error)
    });

    return {
      sent: false,
      customerSent: false,
      adminSent: false,
      message: error instanceof Error ? error.message : "Direct payment email failed to send."
    };
  }
}

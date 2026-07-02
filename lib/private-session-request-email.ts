import { business } from "@/lib/site-data";
import type { PrivateSessionRequestRow } from "@/lib/supabase-db";

const privateRequestRecipient = "info@elitesoccertrainingcv.com";

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
  sendMail: (message: {
    from: string;
    to: string;
    replyTo?: string;
    subject: string;
    text: string;
    html: string;
  }) => Promise<{ messageId?: string }>;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
  const rawPort = process.env.SMTP_PORT;
  const port = Number(rawPort || "465");
  const missing = [
    ["SMTP_HOST", process.env.SMTP_HOST],
    ["SMTP_PORT", rawPort],
    ["SMTP_USER", process.env.SMTP_USER],
    ["SMTP_PASS", process.env.SMTP_PASS],
    ["EMAIL_FROM", process.env.EMAIL_FROM]
  ].filter(([, value]) => !value);

  if (missing.length > 0) {
    throw new Error(`Missing SMTP environment variables: ${missing.map(([key]) => key).join(", ")}`);
  }

  const createNodemailerTransport = await loadNodemailer();
  const secure = port === 465;

  return createNodemailerTransport({
    host: process.env.SMTP_HOST as string,
    port: Number.isFinite(port) ? port : 465,
    secure,
    requireTLS: !secure,
    auth: {
      user: process.env.SMTP_USER as string,
      pass: process.env.SMTP_PASS as string
    },
    tls: {
      minVersion: "TLSv1.2",
      rejectUnauthorized: true
    }
  });
}

function requestRows(request: PrivateSessionRequestRow) {
  return [
    ["Player Name", request.player_name],
    ["Player Age", request.player_age],
    ["Parent/Guardian Name", request.parent_name],
    ["Parent Email", request.parent_email],
    ["Parent Phone", request.parent_phone],
    ["Preferred Dates/Times", request.preferred_times],
    ["Focus Areas", request.focus_areas.length > 0 ? request.focus_areas.join(", ") : "Not selected"],
    ["Notes", request.notes || "None"],
    ["Request Status", request.status],
    ["Submitted", new Date(request.created_at).toLocaleString("en-US", { timeZone: request.timezone || "America/Los_Angeles" })]
  ] as Array<[string, string]>;
}

function detailsTable(rows: Array<[string, string]>) {
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

export async function sendPrivateSessionRequestEmails(request: PrivateSessionRequestRow) {
  const transport = await createTransport();
  const rows = requestRows(request);
  const adminText = rows.map(([label, value]) => `${label}: ${value}`).join("\n");
  const adminHtml = `
    <!doctype html>
    <html>
      <body style="margin:0;background:#eef4fb;padding:28px;font-family:Arial,sans-serif;color:#06152b">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #d9e2ee;border-radius:10px;overflow:hidden">
          <tr>
            <td style="background:#06152b;padding:26px 28px;color:#ffffff">
              <p style="margin:0 0 8px;color:#1783ff;font-size:13px;font-weight:900;text-transform:uppercase">Elite Soccer Training CV</p>
              <h1 style="margin:0;font-size:28px;line-height:1.15">Private 1-on-1 Session Request</h1>
              <p style="margin:12px 0 0;color:#dbeafe;line-height:1.6">A family submitted a private session inquiry from the website.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">
                ${detailsTable(rows)}
              </table>
              <p style="margin:22px 0 0;color:#64748b;font-size:13px">Manage this request in the EST CV admin dashboard.</p>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  const parentText = [
    `Hi ${request.parent_name},`,
    "",
    "Thank you. We received your private session request and will contact you to confirm availability.",
    "",
    `Player: ${request.player_name}`,
    `Preferred dates/times: ${request.preferred_times}`,
    `Focus areas: ${request.focus_areas.length > 0 ? request.focus_areas.join(", ") : "Not selected"}`,
    "",
    "Coach Hugo",
    business.name
  ].join("\n");
  const parentHtml = `
    <!doctype html>
    <html>
      <body style="margin:0;background:#eef4fb;padding:28px;font-family:Arial,sans-serif;color:#06152b">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #d9e2ee;border-radius:10px;overflow:hidden">
          <tr>
            <td style="background:#06152b;padding:26px 28px;color:#ffffff">
              <p style="margin:0 0 8px;color:#1783ff;font-size:13px;font-weight:900;text-transform:uppercase">Elite Soccer Training CV</p>
              <h1 style="margin:0;font-size:28px;line-height:1.15">Private Session Request Received</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px">
              <p style="margin:0 0 16px;color:#334155;line-height:1.7">Hi ${escapeHtml(request.parent_name)},</p>
              <p style="margin:0 0 18px;color:#334155;line-height:1.7">Thank you. We received your private session request and will contact you to confirm availability.</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">
                ${detailsTable([
                  ["Player", request.player_name],
                  ["Preferred Dates/Times", request.preferred_times],
                  ["Focus Areas", request.focus_areas.length > 0 ? request.focus_areas.join(", ") : "Not selected"]
                ])}
              </table>
              <p style="margin:22px 0 0;color:#334155;line-height:1.7">Coach Hugo<br />${escapeHtml(business.name)}</p>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  const [parentResult, adminResult] = await Promise.allSettled([
    transport.sendMail({
      from: process.env.EMAIL_FROM as string,
      to: request.parent_email,
      replyTo: privateRequestRecipient,
      subject: "EST CV Private Session Request Received",
      text: parentText,
      html: parentHtml
    }),
    transport.sendMail({
      from: process.env.EMAIL_FROM as string,
      to: privateRequestRecipient,
      replyTo: request.parent_email,
      subject: `New EST CV Private 1-on-1 Request - ${request.player_name}`,
      text: adminText,
      html: adminHtml
    })
  ]);

  return {
    parentSent: parentResult.status === "fulfilled",
    adminSent: adminResult.status === "fulfilled",
    parentError: parentResult.status === "rejected" ? String(parentResult.reason) : undefined,
    adminError: adminResult.status === "rejected" ? String(adminResult.reason) : undefined
  };
}

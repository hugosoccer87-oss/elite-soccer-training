import { business } from "@/lib/site-data";

export const specialRequestRecipient = "info@elitesoccertrainingcv.com";

export type SpecialRequestPayload = {
  parentName: string;
  playerName: string;
  playerAge: string;
  phone: string;
  email: string;
  requestType: string;
  notes: string;
};

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

function rows(payload: SpecialRequestPayload) {
  return [
    ["Parent/Guardian Name", payload.parentName],
    ["Player Name", payload.playerName],
    ["Player Age", payload.playerAge],
    ["Phone", payload.phone],
    ["Email", payload.email],
    ["Type of Request", payload.requestType],
    ["Notes/Details", payload.notes || "None"]
  ] as Array<[string, string]>;
}

export async function sendSpecialRequestEmail(payload: SpecialRequestPayload) {
  const transport = await createTransport();
  const details = rows(payload);
  const text = details.map(([label, value]) => `${label}: ${value}`).join("\n");
  const html = `
    <!doctype html>
    <html>
      <body style="margin:0;background:#eef4fb;padding:28px;font-family:Arial,sans-serif;color:#06152b">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #d9e2ee;border-radius:10px;overflow:hidden">
          <tr>
            <td style="background:#06152b;padding:26px 28px;color:#ffffff">
              <p style="margin:0 0 8px;color:#1783ff;font-size:13px;font-weight:900;text-transform:uppercase">Elite Soccer Training</p>
              <h1 style="margin:0;font-size:28px;line-height:1.15">Special Training Request</h1>
              <p style="margin:12px 0 0;color:#dbeafe;line-height:1.6">A family submitted a custom training inquiry from the website.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">
                ${details
                  .map(
                    ([label, value]) => `
                      <tr>
                        <td style="border:1px solid #dbe4ef;padding:11px 12px;font-weight:800;background:#f5f8fc;color:#06152b">${escapeHtml(label)}</td>
                        <td style="border:1px solid #dbe4ef;padding:11px 12px;color:#334155">${escapeHtml(value)}</td>
                      </tr>
                    `
                  )
                  .join("")}
              </table>
              <p style="margin:22px 0 0;color:#64748b;font-size:13px">Website: ${escapeHtml(business.name)}</p>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  return transport.sendMail({
    from: process.env.EMAIL_FROM as string,
    to: specialRequestRecipient,
    replyTo: payload.email,
    subject: `Special EST request: ${payload.playerName} - ${payload.requestType}`,
    text,
    html
  });
}

import { exchangeGoogleCodeForTokens } from "@/lib/google-calendar";

function setupPage(refreshToken?: string) {
  const tokenBlock = refreshToken
    ? `<pre style="white-space:pre-wrap;border:1px solid #d9e2ee;border-radius:8px;padding:16px;background:#f5f8fc">${refreshToken}</pre>`
    : `<p style="color:#b91c1c;font-weight:700">Google did not return a refresh token. Visit <code>/api/google-calendar/auth</code> again and approve access when prompted.</p>`;

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>Google Calendar Connected</title>
      </head>
      <body style="margin:0;background:#eef4fb;color:#06152b;font-family:Arial,sans-serif">
        <main style="max-width:760px;margin:60px auto;padding:32px;border:1px solid #d9e2ee;border-radius:10px;background:white">
          <p style="margin:0 0 8px;color:#1783ff;font-size:13px;font-weight:900;text-transform:uppercase">Elite Soccer Training CV</p>
          <h1 style="margin:0 0 16px;font-size:32px">Google Calendar setup</h1>
          <p style="line-height:1.6;color:#475569">Add this refresh token to Vercel as <strong>GOOGLE_REFRESH_TOKEN</strong>, then redeploy the site. The existing <strong>GOOGLE_CLIENT_ID</strong> and <strong>GOOGLE_CLIENT_SECRET</strong> variables stay in place.</p>
          ${tokenBlock}
          <p style="line-height:1.6;color:#475569">Bookings will be created on your primary Google Calendar.</p>
        </main>
      </body>
    </html>
  `;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return new Response("Missing Google OAuth code.", { status: 400 });
  }

  try {
    const tokens = await exchangeGoogleCodeForTokens(code, request);

    return new Response(setupPage(tokens.refresh_token), {
      headers: {
        "Content-Type": "text/html; charset=utf-8"
      }
    });
  } catch {
    return new Response("Google Calendar authorization failed.", { status: 500 });
  }
}

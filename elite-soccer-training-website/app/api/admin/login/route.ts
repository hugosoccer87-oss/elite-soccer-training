import { NextResponse } from "next/server";
import { adminSessionCookie, getAdminSessionValue, validateAdminPasscode } from "@/lib/admin-auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { passcode?: string };
  const passcode = typeof body.passcode === "string" ? body.passcode : "";
  const validation = validateAdminPasscode(passcode);

  if (!validation.configured) {
    return NextResponse.json(
      { error: "ADMIN_PASSCODE is missing in Vercel Environment Variables." },
      { status: 500 }
    );
  }

  if (!validation.valid) {
    return NextResponse.json({ error: "Enter the correct owner passcode." }, { status: 401 });
  }

  const sessionValue = getAdminSessionValue();

  if (!sessionValue) {
    return NextResponse.json(
      { error: "ADMIN_PASSCODE is missing in Vercel Environment Variables." },
      { status: 500 }
    );
  }

  const response = NextResponse.json({ authenticated: true });
  response.cookies.set(adminSessionCookie, sessionValue, {
    httpOnly: true,
    maxAge: 60 * 60 * 8,
    path: "/",
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production"
  });

  return response;
}

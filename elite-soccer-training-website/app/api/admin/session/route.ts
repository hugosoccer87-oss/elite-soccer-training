import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { adminSessionCookie, getAdminPasscode, getAdminSessionValue } from "@/lib/admin-auth";

export async function GET() {
  if (!getAdminPasscode()) {
    return NextResponse.json(
      { authenticated: false, error: "ADMIN_PASSCODE is missing in Vercel Environment Variables." },
      { status: 500 }
    );
  }

  const expectedSession = getAdminSessionValue();
  const cookieStore = await cookies();
  const currentSession = cookieStore.get(adminSessionCookie)?.value;

  return NextResponse.json({
    authenticated: Boolean(expectedSession && currentSession === expectedSession)
  });
}

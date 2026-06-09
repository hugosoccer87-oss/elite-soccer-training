import { cookies } from "next/headers";
import { adminSessionCookie, getAdminPasscode, getAdminSessionValue } from "@/lib/admin-auth";

export async function verifyAdminSession() {
  if (!getAdminPasscode()) {
    return {
      authenticated: false,
      status: 500,
      error: "ADMIN_PASSCODE is missing in Vercel Environment Variables."
    };
  }

  const expectedSession = getAdminSessionValue();
  const cookieStore = await cookies();
  const currentSession = cookieStore.get(adminSessionCookie)?.value;
  const authenticated = Boolean(expectedSession && currentSession === expectedSession);

  return {
    authenticated,
    status: authenticated ? 200 : 401,
    error: authenticated ? "" : "Admin access required."
  };
}

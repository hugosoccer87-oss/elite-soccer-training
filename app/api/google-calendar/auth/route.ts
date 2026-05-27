import { NextResponse } from "next/server";
import { getGoogleCalendarAuthUrl } from "@/lib/google-calendar";

export async function GET(request: Request) {
  const authUrl = getGoogleCalendarAuthUrl(request);

  if (!authUrl) {
    return NextResponse.json(
      { error: "GOOGLE_CLIENT_ID is required before connecting Google Calendar." },
      { status: 500 }
    );
  }

  return NextResponse.redirect(authUrl);
}

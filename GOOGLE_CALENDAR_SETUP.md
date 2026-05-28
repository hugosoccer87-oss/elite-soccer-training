# Google Calendar setup

The site includes Google Calendar API routes for Elite Soccer Training bookings and admin availability.

## Required Vercel environment variables

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`

Optional:

- `GOOGLE_CALENDAR_TIME_ZONE` defaults to `America/Los_Angeles`
- `GOOGLE_REDIRECT_URI` defaults to `https://your-domain.com/api/google-calendar/callback`

## One-time connection steps

1. Enable the Google Calendar API in your Google Cloud project.
2. In Google Cloud OAuth settings, add this authorized redirect URI:
   `https://your-domain.com/api/google-calendar/callback`
3. Deploy the site with `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
4. Visit:
   `https://your-domain.com/api/google-calendar/auth`
5. Approve Calendar access.
6. Copy the refresh token shown on the callback page.
7. Add it to Vercel as `GOOGLE_REFRESH_TOKEN`.
8. Redeploy.

After that, admin-created availability can sync to Google Calendar, full sessions are hidden from booking, and confirmed bookings create 60-minute events on your primary Google Calendar.

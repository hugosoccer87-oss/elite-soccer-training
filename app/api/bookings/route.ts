import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "Bookings are confirmed through Stripe Checkout after successful payment."
    },
    { status: 410 }
  );
}

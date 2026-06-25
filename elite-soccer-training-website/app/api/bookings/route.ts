import { NextResponse } from "next/server";

export async function POST() {
  console.warn("[EST Stripe] Blocking unpaid confirmation");

  return NextResponse.json(
    {
      error: "Bookings are confirmed through Stripe Checkout after successful payment."
    },
    { status: 410 }
  );
}

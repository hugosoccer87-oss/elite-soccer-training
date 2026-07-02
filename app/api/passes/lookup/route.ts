import { NextResponse } from "next/server";
import { trainingGroups } from "@/lib/booking-data";
import { getLaunchPassOption } from "@/lib/pricing";
import { findActiveLaunchPasses } from "@/lib/supabase-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    parentEmail?: string;
    playerName?: string;
  } | null;

  if (!payload?.parentEmail?.trim() || !payload.playerName?.trim()) {
    return NextResponse.json({ error: "Enter the parent email and player name tied to the Training Package." }, { status: 400 });
  }

  try {
    const passes = await findActiveLaunchPasses({
      parentEmail: payload.parentEmail,
      playerName: payload.playerName
    });

    return NextResponse.json({
      passes: passes.map((pass) => {
        const option = getLaunchPassOption(pass.pass_type);
        const group = trainingGroups.find((item) => item.id === pass.training_group);

        return {
          id: pass.id,
          parentName: pass.parent_name,
          parentEmail: pass.parent_email,
          parentPhone: pass.parent_phone,
          playerName: pass.player_name,
          playerAge: pass.player_age,
          trainingGroup: pass.training_group,
          trainingGroupLabel: group ? `${group.name}: ${group.ages}` : pass.training_group,
          passType: pass.pass_type,
          passTitle: option.title,
          totalCredits: pass.total_credits,
          remainingCredits: pass.remaining_credits,
          expiresAt: pass.expires_at
        };
      })
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Training credits could not be checked."
      },
      { status: 500 }
    );
  }
}

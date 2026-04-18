import { NextRequest, NextResponse } from "next/server";
import { apiError, requireUser } from "@/lib/api-auth";
import { saveCheckInAdmin } from "@/lib/server-store";
import type { CheckIn } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const body = (await request.json()) as { checkIn?: CheckIn };

    if (!body.checkIn) {
      return NextResponse.json({ error: "checkIn is required." }, { status: 400 });
    }

    const checkIn = await saveCheckInAdmin(user.uid, body.checkIn);
    return NextResponse.json({ checkIn });
  } catch (error) {
    return apiError(error);
  }
}

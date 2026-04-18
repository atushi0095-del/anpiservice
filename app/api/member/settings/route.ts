import { NextRequest, NextResponse } from "next/server";
import { apiError, requireUser } from "@/lib/api-auth";
import { saveSettingsAdmin } from "@/lib/server-store";
import type { NotificationSettings } from "@/lib/types";

export const runtime = "nodejs";

export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const body = (await request.json()) as { settings?: NotificationSettings };

    if (!body.settings) {
      return NextResponse.json({ error: "settings is required." }, { status: 400 });
    }

    await saveSettingsAdmin(user.uid, body.settings);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { apiError, requireUser } from "@/lib/api-auth";
import { loadFamilyDashboardAdmin } from "@/lib/server-store";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const targets = await loadFamilyDashboardAdmin(user.uid);
    return NextResponse.json({ targets });
  } catch (error) {
    return apiError(error);
  }
}

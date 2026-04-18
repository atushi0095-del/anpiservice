import { NextRequest, NextResponse } from "next/server";
import { apiError, requireUser } from "@/lib/api-auth";
import { loadMemberDashboardAdmin } from "@/lib/server-store";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const dashboard = await loadMemberDashboardAdmin({ uid: user.uid, email: user.email });
    return NextResponse.json(dashboard);
  } catch (error) {
    return apiError(error);
  }
}

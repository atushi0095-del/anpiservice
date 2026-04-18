import { NextRequest, NextResponse } from "next/server";
import { apiError, requireUser } from "@/lib/api-auth";
import { deactivateFamilyContactAdmin } from "@/lib/server-store";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser(request);
    const { id } = await context.params;
    const link = await deactivateFamilyContactAdmin(user.uid, decodeURIComponent(id));
    return NextResponse.json({ link });
  } catch (error) {
    return apiError(error);
  }
}

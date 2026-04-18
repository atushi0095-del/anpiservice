import { NextRequest, NextResponse } from "next/server";
import { apiError, requireUser } from "@/lib/api-auth";
import { addFamilyContactAdmin } from "@/lib/server-store";

export const runtime = "nodejs";

function isValidEmailAddress(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const body = (await request.json()) as { familyName?: string; familyEmail?: string };
    const familyName = body.familyName?.trim();
    const familyEmail = body.familyEmail?.trim();

    if (!familyName || !familyEmail || !isValidEmailAddress(familyEmail)) {
      return NextResponse.json({ error: "家族の名前とメールアドレスを確認してください。" }, { status: 400 });
    }

    const link = await addFamilyContactAdmin(user.uid, familyName, familyEmail);
    return NextResponse.json({ link });
  } catch (error) {
    return apiError(error);
  }
}

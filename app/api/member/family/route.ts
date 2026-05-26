import { NextRequest, NextResponse } from "next/server";
import { apiError, requireUser } from "@/lib/api-auth";
import { addFamilyContactAdmin } from "@/lib/server-store";
import type { ConnectionType } from "@/lib/types";

export const runtime = "nodejs";

function isValidEmailAddress(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const body = (await request.json()) as {
      familyName?: string;
      familyEmail?: string;
      connectionType?: ConnectionType;
    };
    const familyName = body.familyName?.trim();
    const familyEmail = body.familyEmail?.trim();
    const connectionType = body.connectionType === "friend" ? "friend" : "family";
    const normalizedFamilyEmail = familyEmail?.toLowerCase();
    const normalizedOwnEmail = user.email?.trim().toLowerCase();

    if (!familyName || !familyEmail || !isValidEmailAddress(familyEmail)) {
      return NextResponse.json({ error: "名前とメールアドレスを正しく入力してください。" }, { status: 400 });
    }

    if (familyName.length > 40 || familyEmail.length > 120) {
      return NextResponse.json({ error: "名前またはメールアドレスが長すぎます。" }, { status: 400 });
    }

    if (normalizedOwnEmail && normalizedOwnEmail === normalizedFamilyEmail) {
      return NextResponse.json({ error: "自分自身を招待することはできません。" }, { status: 400 });
    }

    const link = await addFamilyContactAdmin(user.uid, familyName, familyEmail, connectionType);
    return NextResponse.json({ link });
  } catch (error) {
    return apiError(error);
  }
}

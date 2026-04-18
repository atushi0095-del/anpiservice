import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebase-admin";

export async function requireUser(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";

  if (!idToken) {
    throw new Error("ログインが必要です。");
  }

  return getAdminAuth().verifyIdToken(idToken);
}

export function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : "処理に失敗しました。";
  const status = message.includes("ログインが必要") ? 401 : 500;
  return NextResponse.json({ error: message }, { status });
}

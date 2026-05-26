import { NextRequest, NextResponse } from "next/server";
import { toAppErrorMessage } from "@/lib/auth-errors";
import { getAdminAuth } from "@/lib/firebase-admin";

export async function requireUser(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";

  if (!idToken) {
    throw new Error("AUTH_REQUIRED");
  }

  return getAdminAuth().verifyIdToken(idToken);
}

export function apiError(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : "";
  const status = rawMessage === "AUTH_REQUIRED" ? 401 : 500;
  const message = rawMessage === "AUTH_REQUIRED" ? "ログインが必要です。" : toAppErrorMessage(error);
  return NextResponse.json({ error: message }, { status });
}

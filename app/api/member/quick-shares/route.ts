import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { apiError, requireUser } from "@/lib/api-auth";
import type { QuickShare, ShareMode, ShareStatus, WatchLink } from "@/lib/types";

export const runtime = "nodejs";

type QuickShareBody = {
  recipientIds?: string[];
  connectionIds?: string[];
  shareMode?: ShareMode;
  status?: ShareStatus;
  message?: string;
  locationText?: string;
  mapUrl?: string;
  durationMinutes?: number;
};

function isShareMode(value: unknown): value is ShareMode {
  return value === "status" || value === "location";
}

function isShareStatus(value: unknown): value is ShareStatus {
  return value === "safe" || value === "need_help" || value === "unavailable";
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const body = (await request.json()) as QuickShareBody;
    const recipientIds = Array.isArray(body.recipientIds) ? body.recipientIds.filter(Boolean) : [];
    const connectionIds = Array.isArray(body.connectionIds) ? body.connectionIds.filter(Boolean) : [];
    const shareMode: ShareMode = isShareMode(body.shareMode) ? body.shareMode : "status";
    const durationMinutes = Math.min(720, Math.max(15, Number(body.durationMinutes) || 60));
    const message = (body.message || "").trim();
    const locationText = body.locationText?.trim();
    const mapUrl = body.mapUrl?.trim();
    const status = isShareStatus(body.status) ? body.status : undefined;

    if (!recipientIds.length) {
      return NextResponse.json({ error: "共有先を1人以上選んでください。" }, { status: 400 });
    }

    if (!message) {
      return NextResponse.json({ error: "共有する内容を入力してください。" }, { status: 400 });
    }

    if (shareMode === "location" && !locationText && !mapUrl) {
      return NextResponse.json({ error: "位置共有には現在地の取得が必要です。" }, { status: 400 });
    }

    const db = getAdminDb();
    const linksSnap = await db.collection("watchLinks").where("memberId", "==", user.uid).where("active", "==", true).get();
    const links = linksSnap.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<WatchLink, "id">) }));
    const allowedLinks = links.filter((link) => recipientIds.includes(link.familyId));

    if (!allowedLinks.length) {
      return NextResponse.json({ error: "共有できる相手が見つかりませんでした。" }, { status: 400 });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000).toISOString();
    const senderSnap = await db.collection("users").doc(user.uid).get();
    const senderName = senderSnap.data()?.displayName || user.email?.split("@")[0] || "利用者";
    const shares: QuickShare[] = [];

    await Promise.all(
      allowedLinks.map(async (link) => {
        if (connectionIds.length && !connectionIds.includes(link.id)) {
          return;
        }

        const shareRef = db.collection("quickShares").doc();
        const share: QuickShare = {
          id: shareRef.id,
          senderId: user.uid,
          senderName,
          recipientId: link.familyId,
          recipientName: link.familyName,
          connectionId: link.id,
          connectionType: link.connectionType || "family",
          shareMode,
          status,
          message,
          locationText,
          mapUrl,
          durationMinutes,
          createdAt: now.toISOString(),
          expiresAt
        };
        await shareRef.set(share);
        shares.push(share);
      })
    );

    return NextResponse.json({ shares });
  } catch (error) {
    return apiError(error);
  }
}

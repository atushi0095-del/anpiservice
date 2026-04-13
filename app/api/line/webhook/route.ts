import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { replyLineMessage, verifyLineSignature } from "@/lib/line-server";

export const runtime = "nodejs";

type LineWebhookBody = {
  events?: Array<{
    type: string;
    replyToken?: string;
    source?: {
      userId?: string;
    };
    message?: {
      type?: string;
      text?: string;
    };
  }>;
};

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature") || "";

  if (!verifyLineSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const body = JSON.parse(rawBody) as LineWebhookBody;
  const events = body.events || [];

  await Promise.all(events.map((event) => handleLineEvent(event)));
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "line-webhook" });
}

async function handleLineEvent(event: NonNullable<LineWebhookBody["events"]>[number]) {
  if (event.type !== "message" || event.message?.type !== "text") {
    return;
  }

  const text = event.message.text?.trim().toUpperCase() || "";
  const userId = event.source?.userId;

  if (!event.replyToken) {
    return;
  }

  if (!userId || !/^ANPI-\d{6}$/.test(text)) {
    await replyLineMessage(event.replyToken, "あんぴノートの連携コードを送ってください。例: ANPI-123456");
    return;
  }

  const db = getAdminDb();
  const linksSnapshot = await db
    .collection("watchLinks")
    .where("lineLinkCode", "==", text)
    .where("active", "==", true)
    .limit(1)
    .get();

  if (linksSnapshot.empty) {
    await replyLineMessage(event.replyToken, "連携コードが見つかりません。アプリに表示されているコードを確認してください。");
    return;
  }

  const linkDoc = linksSnapshot.docs[0];
  const link = linkDoc.data();
  await linkDoc.ref.update({
    lineUserId: userId,
    lineLinked: true,
    lineLinkedAt: new Date().toISOString()
  });

  await db.collection("notificationLogs").add({
    memberId: link.memberId,
    watchLinkId: linkDoc.id,
    recipientName: link.familyName,
    channel: "line",
    kind: "family_alert",
    status: "sent",
    message: "LINE連携が完了しました。",
    createdAt: FieldValue.serverTimestamp()
  });

  await replyLineMessage(event.replyToken, "あんぴノートのLINE連携が完了しました。未チェックイン時はこちらへ通知します。");
}

import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { replyLineMessage, verifyLineSignature } from "@/lib/line-server";

export const runtime = "nodejs";

const inviteCodePattern = /^ANPI-[A-Z0-9]{6,12}$/;

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

  if (!userId || !inviteCodePattern.test(text)) {
    await replyLineMessage(event.replyToken, "いまここ安否ノートの連携コードを送ってください。例: ANPI-A1B2C3D4");
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
    await replyLineMessage(event.replyToken, "連携コードが見つかりません。アプリに表示されているコードをもう一度送ってください。");
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

  await replyLineMessage(event.replyToken, "いまここ安否ノートのLINE連携が完了しました。必要な時はこちらへ通知します。");
}

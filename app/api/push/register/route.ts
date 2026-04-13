import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

type RegisterPushBody = {
  lineLinkCode?: string;
  pushToken?: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as RegisterPushBody;
  const lineLinkCode = body.lineLinkCode?.trim().toUpperCase();
  const pushToken = body.pushToken?.trim();

  if (!lineLinkCode || !/^ANPI-\d{6}$/.test(lineLinkCode)) {
    return NextResponse.json({ error: "Valid lineLinkCode is required." }, { status: 400 });
  }

  if (!pushToken) {
    return NextResponse.json({ error: "pushToken is required." }, { status: 400 });
  }

  const db = getAdminDb();
  const linksSnapshot = await db
    .collection("watchLinks")
    .where("lineLinkCode", "==", lineLinkCode)
    .where("active", "==", true)
    .limit(1)
    .get();

  if (linksSnapshot.empty) {
    return NextResponse.json({ error: "Watch link was not found." }, { status: 404 });
  }

  const linkDoc = linksSnapshot.docs[0];
  const link = linkDoc.data();
  await linkDoc.ref.update({
    pushToken,
    pushEnabled: true,
    pushLinkedAt: new Date().toISOString(),
    preferredChannel: "push"
  });

  await db.collection("notificationLogs").add({
    memberId: link.memberId,
    watchLinkId: linkDoc.id,
    recipientName: link.familyName,
    channel: "push",
    kind: "family_alert",
    status: "sent",
    message: "アプリ通知の登録が完了しました。",
    createdAt: FieldValue.serverTimestamp()
  });

  return NextResponse.json({
    ok: true,
    watchLinkId: linkDoc.id
  });
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "push-register" });
}

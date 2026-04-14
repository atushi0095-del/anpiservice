import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

type RegisterPushBody = {
  lineLinkCode?: string;
  userId?: string;
  pushToken?: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as RegisterPushBody;
  const lineLinkCode = body.lineLinkCode?.trim().toUpperCase();
  const userId = body.userId?.trim();
  const pushToken = body.pushToken?.trim();

  if (!pushToken) {
    return NextResponse.json({ error: "pushToken is required." }, { status: 400 });
  }

  const db = getAdminDb();

  if (userId) {
    const authHeader = request.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
    const decoded = idToken ? await getAdminAuth().verifyIdToken(idToken) : null;

    if (decoded?.uid !== userId) {
      return NextResponse.json({ error: "本人ログインが必要です。" }, { status: 401 });
    }

    await db.collection("users").doc(userId).set(
      {
        pushToken,
        pushEnabled: true,
        pushLinkedAt: new Date().toISOString()
      },
      { merge: true }
    );

    await db.collection("notificationLogs").add({
      memberId: userId,
      recipientName: "本人",
      channel: "push",
      kind: "self_reminder",
      status: "sent",
      message: "本人用アプリ通知の登録が完了しました。",
      createdAt: FieldValue.serverTimestamp()
    });

    return NextResponse.json({
      ok: true,
      userId
    });
  }

  if (!lineLinkCode || !/^ANPI-\d{6}$/.test(lineLinkCode)) {
    return NextResponse.json({ error: "Valid lineLinkCode or userId is required." }, { status: 400 });
  }

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

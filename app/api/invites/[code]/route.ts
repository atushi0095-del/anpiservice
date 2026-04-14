import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ code: string }>;
};

type WatchLinkRecord = {
  memberId: string;
  familyId: string;
  familyName: string;
  familyEmail: string;
  lineLinkCode: string;
  inviteStatus?: "pending" | "accepted";
  active: boolean;
  createdAt: string;
};

function normalizeCode(value: string) {
  return decodeURIComponent(value).trim().toUpperCase();
}

async function findInvite(code: string) {
  const db = getAdminDb();
  const snapshot = await db.collection("watchLinks").where("lineLinkCode", "==", code).limit(1).get();
  return snapshot.docs[0];
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { code: rawCode } = await context.params;
  const code = normalizeCode(rawCode);
  const inviteDoc = await findInvite(code);

  if (!inviteDoc) {
    return NextResponse.json({ error: "招待が見つかりません。" }, { status: 404 });
  }

  const invite = inviteDoc.data() as WatchLinkRecord;
  const memberDoc = await getAdminDb().collection("users").doc(invite.memberId).get();
  const member = memberDoc.data();

  return NextResponse.json({
    code,
    familyName: invite.familyName,
    familyEmail: invite.familyEmail,
    inviteStatus: invite.inviteStatus || (invite.active ? "accepted" : "pending"),
    member: {
      id: invite.memberId,
      displayName: member?.displayName || "利用者",
      email: member?.email || ""
    }
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { code: rawCode } = await context.params;
  const code = normalizeCode(rawCode);
  const authHeader = request.headers.get("authorization");
  const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";

  if (!idToken) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  const decoded = await getAdminAuth().verifyIdToken(idToken);
  const db = getAdminDb();
  const inviteDoc = await findInvite(code);

  if (!inviteDoc) {
    return NextResponse.json({ error: "招待が見つかりません。" }, { status: 404 });
  }

  const invite = inviteDoc.data() as WatchLinkRecord;
  const now = new Date().toISOString();
  const familyEmail = decoded.email || invite.familyEmail;
  const familyName = decoded.name || invite.familyName || familyEmail.split("@")[0] || "家族";
  const acceptedLinkId = `${invite.memberId}_${decoded.uid}`;

  await db.collection("users").doc(decoded.uid).set(
    {
      id: decoded.uid,
      displayName: familyName,
      email: familyEmail,
      role: "family",
      createdAt: now
    },
    { merge: true }
  );

  await db.collection("watchLinks").doc(acceptedLinkId).set(
    {
      ...invite,
      familyId: decoded.uid,
      familyName,
      familyEmail,
      inviteStatus: "accepted",
      acceptedAt: now,
      active: true,
      preferredChannel: "push"
    },
    { merge: true }
  );

  if (inviteDoc.id !== acceptedLinkId) {
    await inviteDoc.ref.set(
      {
        inviteStatus: "accepted",
        acceptedAt: now,
        acceptedFamilyId: decoded.uid,
        active: false
      },
      { merge: true }
    );
  }

  await db.collection("notificationLogs").add({
    memberId: invite.memberId,
    watchLinkId: acceptedLinkId,
    recipientName: familyName,
    channel: "email",
    kind: "family_alert",
    status: "sent",
    message: "家族が見守り招待を承認しました。",
    createdAt: FieldValue.serverTimestamp()
  });

  return NextResponse.json({
    ok: true,
    watchLinkId: acceptedLinkId,
    lineLinkCode: invite.lineLinkCode
  });
}

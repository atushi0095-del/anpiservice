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

type NotificationSettingsRecord = {
  userId: string;
  frequencyDays: 1 | 2 | 3;
  graceHours: number;
  reminderChannel: "app" | "email";
  familyChannel: "push" | "line" | "email";
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
  try {
    const { code: rawCode } = await context.params;
    const code = normalizeCode(rawCode);
    const authHeader = request.headers.get("authorization");
    const idToken = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";

    if (!idToken) {
      return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
    }

    const decoded = await getAdminAuth().verifyIdToken(idToken);
    const body = (await request.json().catch(() => ({}))) as { mutualWatch?: boolean };
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
    const acceptedLinkRef = db.collection("watchLinks").doc(acceptedLinkId);
    const existingAcceptedLink = await acceptedLinkRef.get();

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

    await acceptedLinkRef.set(
      {
        ...invite,
        familyId: decoded.uid,
        familyName,
        familyEmail,
        inviteStatus: "accepted",
        acceptedAt: now,
        active: true,
        preferredChannel: "push",
      },
      { merge: true }
    );

    if (body.mutualWatch) {
      const reverseLinkRef = db.collection("watchLinks").doc(`${decoded.uid}_${invite.memberId}`);
      const reverseLink = await reverseLinkRef.get();
      const reverseCode = reverseLink.exists
        ? (reverseLink.data()?.lineLinkCode as string | undefined) || `ANPI-${Math.floor(100000 + Math.random() * 900000)}`
        : `ANPI-${Math.floor(100000 + Math.random() * 900000)}`;
      const memberDoc = await db.collection("users").doc(invite.memberId).get();
      const member = memberDoc.data();
      const existingFamilyUser = await db.collection("users").doc(decoded.uid).get();
      const existingFamily = existingFamilyUser.data();
      const reverseData = reverseLink.data();
      const reversePayload: Record<string, unknown> = {
        memberId: decoded.uid,
        familyId: invite.memberId,
        familyName: member?.displayName || "見守り相手",
        familyEmail: member?.email || "",
        lineLinkCode: reverseCode,
        inviteStatus: "accepted",
        acceptedAt: now,
        lineLinked: false,
        pushEnabled: reverseData?.pushEnabled || false,
        preferredChannel: "push",
        active: true,
        createdAt: reverseData?.createdAt || now
      };

      if (reverseData?.pushToken) {
        reversePayload.pushToken = reverseData.pushToken;
      }

      await reverseLinkRef.set(reversePayload, { merge: true });

      const settingsRef = db.collection("notificationSettings").doc(decoded.uid);
      const settingsSnap = await settingsRef.get();
      if (!settingsSnap.exists) {
        const settings: NotificationSettingsRecord = {
          userId: decoded.uid,
          frequencyDays: 1,
          graceHours: 6,
          reminderChannel: "email",
          familyChannel: "push"
        };
        await settingsRef.set(settings);
      }

      const latestCheckInSnap = await db.collection("checkIns").where("memberId", "==", decoded.uid).limit(1).get();
      if (latestCheckInSnap.empty) {
        await db.collection("checkIns").add({
          id: `checkin-${Date.now()}`,
          memberId: decoded.uid,
          checkedAt: now,
          nextDueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          status: "safe"
        });
      }

      await db.collection("users").doc(decoded.uid).set(
        {
          displayName: existingFamily?.displayName || familyName,
          email: familyEmail,
          role: existingFamily?.role || "family"
        },
        { merge: true }
      );
    }

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

    if (!existingAcceptedLink.exists) {
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
    }

    return NextResponse.json({
      ok: true,
      watchLinkId: acceptedLinkId,
      lineLinkCode: invite.lineLinkCode
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "招待の承認に失敗しました。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

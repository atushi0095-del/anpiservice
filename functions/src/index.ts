import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { createHmac, timingSafeEqual } from "node:crypto";

initializeApp();

type NotificationSettings = {
  userId: string;
  frequencyDays: 1 | 2 | 3;
  graceHours: number;
  reminderChannel: "app" | "email";
  familyChannel: "line" | "email";
};

type WatchLink = {
  memberId: string;
  familyId: string;
  familyName: string;
  familyEmail: string;
  lineLinkCode: string;
  lineUserId?: string;
  lineLinked: boolean;
  lineLinkedAt?: string;
  active: boolean;
};

type CheckIn = {
  memberId: string;
  checkedAt: Timestamp;
  nextDueAt: Timestamp;
  status: "safe";
};

const HOUR_MS = 60 * 60 * 1000;

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

export const lineWebhook = onRequest(
  {
    region: "asia-northeast1",
    secrets: ["LINE_CHANNEL_SECRET", "LINE_CHANNEL_ACCESS_TOKEN"]
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    if (!verifyLineSignature(req.rawBody, req.header("x-line-signature") || "")) {
      res.status(401).send("Invalid signature");
      return;
    }

    const body = req.body as LineWebhookBody;
    const events = body.events || [];

    await Promise.all(events.map((event) => handleLineEvent(event)));
    res.status(200).send("OK");
  }
);

export const evaluateSafetyNotifications = onSchedule(
  {
    schedule: "every 30 minutes",
    region: "asia-northeast1",
    timeZone: "Asia/Tokyo"
  },
  async () => {
    const db = getFirestore();
    const now = Timestamp.now();
    const dueSnapshot = await db.collection("checkIns").where("nextDueAt", "<=", now).get();

    for (const checkInDoc of dueSnapshot.docs) {
      const checkIn = checkInDoc.data() as CheckIn;
      const settingsDoc = await db.collection("notificationSettings").doc(checkIn.memberId).get();

      if (!settingsDoc.exists) {
        logger.warn("Missing notification settings", { memberId: checkIn.memberId });
        continue;
      }

      const settings = settingsDoc.data() as NotificationSettings;
      await queueSelfReminder(db, checkIn.memberId, settings);

      const alertAtMs = checkIn.nextDueAt.toMillis() + settings.graceHours * HOUR_MS;
      if (Date.now() < alertAtMs) {
        continue;
      }

      const linksSnapshot = await db
        .collection("watchLinks")
        .where("memberId", "==", checkIn.memberId)
        .where("active", "==", true)
        .get();

      for (const linkDoc of linksSnapshot.docs) {
        const link = linkDoc.data() as WatchLink;
        await sendFamilyAlert(db, linkDoc.id, checkIn.memberId, link);
      }
    }
  }
);

async function queueSelfReminder(db: FirebaseFirestore.Firestore, memberId: string, settings: NotificationSettings) {
  const dedupeId = `${memberId}_self_${new Date().toISOString().slice(0, 10)}`;
  const logRef = db.collection("notificationLogs").doc(dedupeId);
  const existing = await logRef.get();

  if (existing.exists) {
    return;
  }

  await logRef.set({
    memberId,
    recipientName: "本人",
    channel: settings.reminderChannel,
    kind: "self_reminder",
    status: "queued",
    message: "本日の安否確認がまだ完了していません。",
    createdAt: Timestamp.now()
  });
}

async function sendFamilyAlert(
  db: FirebaseFirestore.Firestore,
  watchLinkId: string,
  memberId: string,
  link: WatchLink
) {
  const dedupeId = `${memberId}_${link.familyId}_${new Date().toISOString().slice(0, 10)}`;
  const logRef = db.collection("notificationLogs").doc(dedupeId);
  const existing = await logRef.get();

  if (existing.exists) {
    return;
  }

  if (link.lineLinked && link.lineUserId) {
    const result = await pushLineMessage(link.lineUserId, "見守り中の方の安否確認がまだ完了していません。必要に応じて直接ご確認ください。");
    await logRef.set({
      memberId,
      watchLinkId,
      recipientName: link.familyName,
      channel: "line",
      kind: "family_alert",
      status: result.ok ? "sent" : "failed",
      message: result.ok ? "LINE通知を送信しました。" : result.error,
      createdAt: Timestamp.now()
    });
    return;
  }

  await logRef.set({
    memberId,
    watchLinkId,
    recipientName: link.familyName,
    channel: "email",
    kind: "family_alert",
    status: "fallback",
    message: `${link.familyEmail} へのメール代替通知をキューに登録しました。`,
    createdAt: Timestamp.now()
  });
}

async function pushLineMessage(lineUserId: string, text: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!token) {
    return { ok: false, error: "LINE_CHANNEL_ACCESS_TOKEN is not configured." };
  }

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [{ type: "text", text }]
    })
  });

  if (!response.ok) {
    return { ok: false, error: `LINE push failed with ${response.status}.` };
  }

  return { ok: true };
}

function verifyLineSignature(rawBody: Buffer, signature: string): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET;

  if (!secret || !signature) {
    return false;
  }

  const digest = createHmac("sha256", secret).update(rawBody).digest("base64");
  const expected = Buffer.from(digest);
  const actual = Buffer.from(signature);

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

async function handleLineEvent(event: NonNullable<LineWebhookBody["events"]>[number]) {
  if (event.type !== "message" || event.message?.type !== "text") {
    return;
  }

  const text = event.message.text?.trim().toUpperCase() || "";
  const userId = event.source?.userId;

  if (!userId || !event.replyToken || !/^ANPI-\d{6}$/.test(text)) {
    if (event.replyToken) {
      await replyLineMessage(event.replyToken, "あんぴノートの連携コードを送ってください。例: ANPI-123456");
    }
    return;
  }

  const db = getFirestore();
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
  await linkDoc.ref.update({
    lineUserId: userId,
    lineLinked: true,
    lineLinkedAt: new Date().toISOString()
  });

  const link = linkDoc.data() as WatchLink;
  await db.collection("notificationLogs").add({
    memberId: link.memberId,
    watchLinkId: linkDoc.id,
    recipientName: link.familyName,
    channel: "line",
    kind: "family_alert",
    status: "sent",
    message: "LINE連携が完了しました。",
    createdAt: Timestamp.now()
  });

  await replyLineMessage(event.replyToken, "あんぴノートのLINE連携が完了しました。未チェックイン時はこちらへ通知します。");
}

async function replyLineMessage(replyToken: string, text: string) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!token) {
    logger.warn("LINE_CHANNEL_ACCESS_TOKEN is not configured.");
    return;
  }

  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text }]
    })
  });

  if (!response.ok) {
    logger.warn("LINE reply failed", { status: response.status });
  }
}

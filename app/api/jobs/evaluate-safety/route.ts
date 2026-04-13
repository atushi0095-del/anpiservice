import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, getAdminMessaging } from "@/lib/firebase-admin";
import { pushLineMessage } from "@/lib/line-server";

export const runtime = "nodejs";

type NotificationSettings = {
  userId: string;
  graceHours: number;
  reminderChannel: "app" | "email";
  familyChannel: "push" | "line" | "email";
};

type CheckIn = {
  memberId: string;
  nextDueAt: Timestamp | string;
};

type WatchLink = {
  memberId: string;
  familyId: string;
  familyName: string;
  familyEmail: string;
  lineUserId?: string;
  lineLinked?: boolean;
  pushToken?: string;
  pushEnabled?: boolean;
  preferredChannel?: "push" | "line" | "email";
  active: boolean;
};

type SendResult = {
  channel: "push" | "line" | "email";
  status: "sent" | "failed" | "fallback";
  message: string;
};

const HOUR_MS = 60 * 60 * 1000;
const FAMILY_ALERT_TEXT = "見守り中の方の安否確認がまだ完了していません。必要に応じて直接ご確認ください。";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (secret && authHeader !== `Bearer ${secret}` && !request.headers.get("x-vercel-cron")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await evaluateSafetyNotifications();
  return NextResponse.json(result);
}

async function evaluateSafetyNotifications() {
  const db = getAdminDb();
  const now = new Date();
  const dueSnapshot = await db.collection("checkIns").where("nextDueAt", "<=", now.toISOString()).get();
  let selfReminders = 0;
  let familyAlerts = 0;

  for (const checkInDoc of dueSnapshot.docs) {
    const checkIn = checkInDoc.data() as CheckIn;
    const settingsDoc = await db.collection("notificationSettings").doc(checkIn.memberId).get();

    if (!settingsDoc.exists) {
      continue;
    }

    const settings = settingsDoc.data() as NotificationSettings;
    const reminded = await queueSelfReminder(checkIn.memberId, settings);
    if (reminded) {
      selfReminders += 1;
    }

    const dueAtMs = typeof checkIn.nextDueAt === "string" ? new Date(checkIn.nextDueAt).getTime() : checkIn.nextDueAt.toMillis();
    const alertAtMs = dueAtMs + settings.graceHours * HOUR_MS;
    if (Date.now() < alertAtMs) {
      continue;
    }

    const linksSnapshot = await db
      .collection("watchLinks")
      .where("memberId", "==", checkIn.memberId)
      .where("active", "==", true)
      .get();

    for (const linkDoc of linksSnapshot.docs) {
      const sent = await sendFamilyAlert(checkIn.memberId, linkDoc.id, linkDoc.data() as WatchLink);
      if (sent) {
        familyAlerts += 1;
      }
    }
  }

  return { ok: true, selfReminders, familyAlerts };
}

async function queueSelfReminder(memberId: string, settings: NotificationSettings) {
  const db = getAdminDb();
  const dedupeId = `${memberId}_self_${new Date().toISOString().slice(0, 10)}`;
  const logRef = db.collection("notificationLogs").doc(dedupeId);
  const existing = await logRef.get();

  if (existing.exists) {
    return false;
  }

  await logRef.set({
    memberId,
    recipientName: "本人",
    channel: settings.reminderChannel,
    kind: "self_reminder",
    status: "queued",
    message: "本日の安否確認がまだ完了していません。",
    createdAt: FieldValue.serverTimestamp()
  });
  return true;
}

async function sendFamilyAlert(memberId: string, watchLinkId: string, link: WatchLink) {
  const db = getAdminDb();
  const dedupeId = `${memberId}_${link.familyId}_${new Date().toISOString().slice(0, 10)}`;
  const logRef = db.collection("notificationLogs").doc(dedupeId);
  const existing = await logRef.get();

  if (existing.exists) {
    return false;
  }

  const result = await sendBestAvailableChannel(link);
  await logRef.set({
    memberId,
    watchLinkId,
    recipientName: link.familyName,
    channel: result.channel,
    kind: "family_alert",
    status: result.status,
    message: result.message,
    createdAt: FieldValue.serverTimestamp()
  });
  return true;
}

async function sendBestAvailableChannel(link: WatchLink): Promise<SendResult> {
  const pushResult = await tryPushNotification(link);
  if (pushResult.status === "sent") {
    return pushResult;
  }

  if (link.lineLinked && link.lineUserId) {
    const result = await pushLineMessage(link.lineUserId, FAMILY_ALERT_TEXT);
    return {
      channel: "line",
      status: result.ok ? "sent" : "failed",
      message: result.ok ? "LINE通知を送信しました。" : result.error
    };
  }

  return {
    channel: "email",
    status: "fallback",
    message: `${link.familyEmail} へのメール代替通知をキューに登録しました。`
  };
}

async function tryPushNotification(link: WatchLink): Promise<SendResult> {
  if (!link.pushEnabled || !link.pushToken) {
    return {
      channel: "push",
      status: "fallback",
      message: "アプリ通知が未登録のため、次の通知手段へ切り替えました。"
    };
  }

  try {
    await getAdminMessaging().send({
      token: link.pushToken,
      notification: {
        title: "あんぴノート",
        body: FAMILY_ALERT_TEXT
      },
      data: {
        type: "family_alert",
        memberId: link.memberId
      },
      android: {
        priority: "high"
      }
    });

    return {
      channel: "push",
      status: "sent",
      message: "アプリ通知を送信しました。"
    };
  } catch (error) {
    return {
      channel: "push",
      status: "failed",
      message: error instanceof Error ? error.message : "アプリ通知の送信に失敗しました。"
    };
  }
}

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

type UserProfile = {
  id: string;
  displayName: string;
  email: string;
  pushToken?: string;
  pushEnabled?: boolean;
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
const SELF_REMINDER_TEXT = "安否確認の時間です。アプリを開いて「無事です」を押してください。";
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
    const reminded = await queueSelfReminder(checkIn.memberId);
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

  const monthlyReviewReminders = await evaluateMonthlyReviewReminders();
  return { ok: true, selfReminders, familyAlerts, monthlyReviewReminders };
}

const MONTHLY_REVIEW_DAYS = 30;
const MONTHLY_REVIEW_TEXT = "今月の防災備え確認をしましょう。あんぴノートを開いて「備え確認を完了にする」を押してください。";

async function evaluateMonthlyReviewReminders(): Promise<number> {
  const db = getAdminDb();
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() - MONTHLY_REVIEW_DAYS);

  const notesSnapshot = await db.collection("disasterNotes").get();
  let count = 0;

  for (const noteDoc of notesSnapshot.docs) {
    const noteData = noteDoc.data() as { lastReviewedAt?: string; notificationSettings?: { monthlyReview?: boolean; syncEnabled?: boolean } };
    if (!noteData.notificationSettings?.monthlyReview) continue;

    const lastReviewed = noteData.lastReviewedAt ? new Date(noteData.lastReviewedAt) : new Date(0);
    if (lastReviewed >= thresholdDate) continue;

    const uid = noteDoc.id;
    const dedupeId = `${uid}_monthly_review_${new Date().toISOString().slice(0, 7)}`;
    const logRef = db.collection("notificationLogs").doc(dedupeId);
    if ((await logRef.get()).exists) continue;

    const userDoc = await db.collection("users").doc(uid).get();
    const user = userDoc.data() as UserProfile | undefined;

    if (user?.pushEnabled && user.pushToken) {
      try {
        await getAdminMessaging().send({
          token: user.pushToken,
          notification: { title: "あんぴノート", body: MONTHLY_REVIEW_TEXT },
          data: { type: "monthly_review", openPath: "/" },
          android: { priority: "normal", notification: { channelId: "anpi_reminders" } }
        });
        await logRef.set({ memberId: uid, recipientName: "本人", channel: "push", kind: "monthly_review", status: "sent", message: MONTHLY_REVIEW_TEXT, createdAt: FieldValue.serverTimestamp() });
        count += 1;
      } catch {
        // サイレントフェイル
      }
    }
  }

  return count;
}

async function queueSelfReminder(memberId: string) {
  const db = getAdminDb();
  const dedupeId = `${memberId}_self_${new Date().toISOString().slice(0, 10)}`;
  const logRef = db.collection("notificationLogs").doc(dedupeId);
  const existing = await logRef.get();

  if (existing.exists) {
    return false;
  }

  const userDoc = await db.collection("users").doc(memberId).get();
  const user = userDoc.data() as UserProfile | undefined;
  const result = await sendSelfReminder(user);

  await logRef.set({
    memberId,
    recipientName: "本人",
    channel: result.channel,
    kind: "self_reminder",
    status: result.status,
    message: result.message,
    createdAt: FieldValue.serverTimestamp()
  });
  return true;
}

async function sendSelfReminder(user: UserProfile | undefined): Promise<SendResult> {
  if (user?.pushEnabled && user.pushToken) {
    try {
      await getAdminMessaging().send({
        token: user.pushToken,
        notification: {
          title: "あんぴノート",
          body: SELF_REMINDER_TEXT
        },
        data: {
          type: "self_reminder",
          openPath: "/#checkin"
        },
        android: {
          priority: "high",
          notification: {
            channelId: "anpi_reminders",
            defaultSound: true,
            defaultVibrateTimings: true
          }
        }
      });

      return {
        channel: "push",
        status: "sent",
        message: "本人へアプリ通知を送信しました。"
      };
    } catch (error) {
      return {
        channel: "push",
        status: "failed",
        message: error instanceof Error ? error.message : "本人へのアプリ通知に失敗しました。"
      };
    }
  }

  return {
    channel: "email",
    status: "fallback",
    message: "本人用アプリ通知が未登録のため、メール代替通知をキューに登録しました。"
  };
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
        memberId: link.memberId,
        openPath: "/"
      },
      android: {
        priority: "high",
        notification: {
          channelId: "anpi_alerts",
          defaultSound: true,
          defaultVibrateTimings: true
        }
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

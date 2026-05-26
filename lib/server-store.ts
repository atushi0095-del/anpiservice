import { randomBytes } from "node:crypto";
import { getAdminDb } from "@/lib/firebase-admin";
import { createCheckIn } from "@/lib/safety";
import type {
  CheckIn,
  ConnectionType,
  FamilyWatchTarget,
  NotificationLog,
  NotificationSettings,
  QuickShare,
  UserProfile,
  WatchLink
} from "@/lib/types";

export type MemberDashboardData = {
  profile: UserProfile;
  settings: NotificationSettings;
  latestCheckIn: CheckIn;
  watchLinks: WatchLink[];
  incomingShares: QuickShare[];
  logs: NotificationLog[];
};

const defaultSettings = (userId: string): NotificationSettings => ({
  userId,
  frequencyDays: 1,
  graceHours: 6,
  reminderChannel: "email",
  familyChannel: "push"
});

const ALLOWED_FREQUENCY_DAYS = new Set([1, 2, 3]);
const ALLOWED_REMINDER_CHANNELS = new Set(["app", "email"]);
const ALLOWED_FAMILY_CHANNELS = new Set(["push", "line", "email"]);

function dateString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }

  return new Date().toISOString();
}

function byNewestDate<T>(field: keyof T) {
  return (left: T, right: T) => new Date(dateString(right[field])).getTime() - new Date(dateString(left[field])).getTime();
}

function createLineLinkCode(): string {
  return `ANPI-${randomBytes(5).toString("hex").toUpperCase()}`;
}

function normalizeLog(id: string, data: Omit<NotificationLog, "id">): NotificationLog {
  return {
    id,
    ...data,
    createdAt: dateString(data.createdAt)
  };
}

function normalizeQuickShare(id: string, data: Omit<QuickShare, "id">): QuickShare {
  return {
    id,
    ...data,
    createdAt: dateString(data.createdAt),
    expiresAt: dateString(data.expiresAt),
    viewedAt: data.viewedAt ? dateString(data.viewedAt) : undefined
  };
}

function isShareActive(share: QuickShare) {
  return new Date(share.expiresAt).getTime() > Date.now();
}

function isIsoDateString(value: unknown) {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

function sanitizeProfile(profile: UserProfile): UserProfile {
  return {
    id: profile.id,
    displayName: profile.displayName,
    email: profile.email,
    role: profile.role,
    createdAt: profile.createdAt
  };
}

function sanitizeWatchLink(link: WatchLink): WatchLink {
  return {
    id: link.id,
    memberId: link.memberId,
    familyId: link.familyId,
    familyName: link.familyName,
    familyEmail: link.familyEmail,
    connectionType: link.connectionType,
    lineLinkCode: link.lineLinkCode,
    inviteStatus: link.inviteStatus,
    acceptedAt: link.acceptedAt,
    acceptedFamilyId: link.acceptedFamilyId,
    lineLinked: link.lineLinked,
    lineLinkedAt: link.lineLinkedAt,
    pushEnabled: link.pushEnabled,
    pushLinkedAt: link.pushLinkedAt,
    preferredChannel: link.preferredChannel,
    active: link.active,
    createdAt: link.createdAt
  };
}

function ensureValidSettings(userId: string, settings: NotificationSettings) {
  if (settings.userId !== userId) {
    throw new Error("設定の保存対象が正しくありません。");
  }

  if (!ALLOWED_FREQUENCY_DAYS.has(settings.frequencyDays)) {
    throw new Error("確認頻度は 1日・2日・3日のいずれかを選んでください。");
  }

  if (!Number.isInteger(settings.graceHours) || settings.graceHours < 1 || settings.graceHours > 24) {
    throw new Error("猶予時間は1時間から24時間の間で設定してください。");
  }

  if (!ALLOWED_REMINDER_CHANNELS.has(settings.reminderChannel)) {
    throw new Error("本人向け通知方法が正しくありません。");
  }

  if (!ALLOWED_FAMILY_CHANNELS.has(settings.familyChannel)) {
    throw new Error("共有相手への通知方法が正しくありません。");
  }
}

function ensureValidCheckIn(userId: string, checkIn: CheckIn) {
  if (checkIn.memberId !== userId) {
    throw new Error("チェックインの保存対象が正しくありません。");
  }

  if (checkIn.status !== "safe") {
    throw new Error("現在保存できる安否状態は「無事」のみです。");
  }

  if (!isIsoDateString(checkIn.checkedAt) || !isIsoDateString(checkIn.nextDueAt)) {
    throw new Error("チェックイン日時が正しくありません。");
  }

  const checkedAt = new Date(checkIn.checkedAt).getTime();
  const nextDueAt = new Date(checkIn.nextDueAt).getTime();
  if (nextDueAt < checkedAt || nextDueAt - checkedAt > 1000 * 60 * 60 * 24 * 7) {
    throw new Error("次回確認日時が不正です。");
  }
}

export async function loadMemberDashboardAdmin(user: { uid: string; email?: string | null }): Promise<MemberDashboardData> {
  const db = getAdminDb();
  const now = new Date().toISOString();
  const userRef = db.collection("users").doc(user.uid);
  const settingsRef = db.collection("notificationSettings").doc(user.uid);

  const [userSnap, settingsSnap, checkInsSnap, linksSnap, logsSnap, sharesSnap] = await Promise.all([
    userRef.get(),
    settingsRef.get(),
    db.collection("checkIns").where("memberId", "==", user.uid).limit(20).get(),
    db.collection("watchLinks").where("memberId", "==", user.uid).get(),
    db.collection("notificationLogs").where("memberId", "==", user.uid).limit(20).get(),
    db.collection("quickShares").where("recipientId", "==", user.uid).limit(40).get()
  ]);

  const profile: UserProfile = userSnap.exists
    ? (userSnap.data() as UserProfile)
    : {
        id: user.uid,
        displayName: user.email?.split("@")[0] || "利用者",
        email: user.email || "",
        role: "member",
        createdAt: now
      };
  const settings = settingsSnap.exists ? (settingsSnap.data() as NotificationSettings) : defaultSettings(user.uid);
  const latestCheckIn = checkInsSnap.docs
    .map((item) => item.data() as CheckIn)
    .sort(byNewestDate<CheckIn>("checkedAt"))[0];
  const ensuredCheckIn = latestCheckIn ?? createCheckIn(user.uid, settings, new Date());

  await Promise.all([
    userSnap.exists ? Promise.resolve() : userRef.set(profile),
    settingsSnap.exists ? Promise.resolve() : settingsRef.set(settings),
    latestCheckIn ? Promise.resolve() : db.collection("checkIns").add(ensuredCheckIn)
  ]);

  return {
    profile,
    settings,
    latestCheckIn: ensuredCheckIn,
    watchLinks: linksSnap.docs.map((item) => sanitizeWatchLink({ id: item.id, ...(item.data() as Omit<WatchLink, "id">) })),
    incomingShares: sharesSnap.docs
      .map((item) => normalizeQuickShare(item.id, item.data() as Omit<QuickShare, "id">))
      .filter(isShareActive)
      .sort(byNewestDate<QuickShare>("createdAt"))
      .slice(0, 20),
    logs: logsSnap.docs
      .map((item) => normalizeLog(item.id, item.data() as Omit<NotificationLog, "id">))
      .sort(byNewestDate<NotificationLog>("createdAt"))
      .slice(0, 10)
  };
}

export async function saveSettingsAdmin(userId: string, settings: NotificationSettings) {
  ensureValidSettings(userId, settings);
  await getAdminDb().collection("notificationSettings").doc(userId).set(settings, { merge: true });
}

export async function saveCheckInAdmin(userId: string, checkIn: CheckIn): Promise<CheckIn> {
  ensureValidCheckIn(userId, checkIn);
  await getAdminDb().collection("checkIns").add(checkIn);
  return checkIn;
}

export async function addFamilyContactAdmin(
  memberId: string,
  familyName: string,
  familyEmail: string,
  connectionType: ConnectionType = "family"
): Promise<WatchLink> {
  const db = getAdminDb();
  const createdAt = new Date().toISOString();
  const familyKey = familyEmail.trim().toLowerCase().replace(/[^a-z0-9]/g, "_");
  const code = createLineLinkCode();
  const id = `${memberId}_invite_${code.replace(/[^A-Z0-9]/g, "_")}`;
  const link: WatchLink = {
    id,
    memberId,
    familyId: familyKey,
    familyName,
    familyEmail,
    connectionType,
    lineLinkCode: code,
    inviteStatus: "pending",
    lineLinked: false,
    pushEnabled: false,
    preferredChannel: "push",
    active: false,
    createdAt
  };

  await db.collection("watchLinks").doc(id).set(link);
  return sanitizeWatchLink(link);
}

export async function deactivateFamilyContactAdmin(memberId: string, linkId: string): Promise<WatchLink> {
  const db = getAdminDb();
  const linkRef = db.collection("watchLinks").doc(linkId);
  const linkSnap = await linkRef.get();

  if (!linkSnap.exists) {
    throw new Error("見守り相手が見つかりません。");
  }

  const link = { id: linkSnap.id, ...(linkSnap.data() as Omit<WatchLink, "id">) };
  if (link.memberId !== memberId) {
    throw new Error("見守り相手を更新する権限がありません。");
  }

  await linkRef.update({ active: false });
  return sanitizeWatchLink({ ...link, active: false });
}

export async function loadFamilyDashboardAdmin(familyId: string): Promise<FamilyWatchTarget[]> {
  const db = getAdminDb();
  const linksSnap = await db.collection("watchLinks").where("familyId", "==", familyId).where("active", "==", true).get();
  const targets = await Promise.all(
    linksSnap.docs.map(async (item) => {
      const link = { id: item.id, ...(item.data() as Omit<WatchLink, "id">) };
      const [memberSnap, settingsSnap, checkInsSnap] = await Promise.all([
        db.collection("users").doc(link.memberId).get(),
        db.collection("notificationSettings").doc(link.memberId).get(),
        db.collection("checkIns").where("memberId", "==", link.memberId).limit(20).get()
      ]);
      const latestCheckIn = checkInsSnap.docs
        .map((checkIn) => checkIn.data() as CheckIn)
        .sort(byNewestDate<CheckIn>("checkedAt"))[0];

      const member = memberSnap.exists ? sanitizeProfile(memberSnap.data() as UserProfile) : undefined;

      return {
        link: sanitizeWatchLink(link),
        member,
        settings: settingsSnap.exists ? (settingsSnap.data() as NotificationSettings) : undefined,
        latestCheckIn
      };
    })
  );

  return targets
    .filter((target) => Boolean(target.member))
    .map((target) => ({
      link: target.link,
      member: target.member as UserProfile,
      settings: target.settings,
      latestCheckIn: target.latestCheckIn
    }));
}

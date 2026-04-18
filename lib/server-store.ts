import { getAdminDb } from "@/lib/firebase-admin";
import { createCheckIn } from "@/lib/safety";
import type { CheckIn, FamilyWatchTarget, NotificationLog, NotificationSettings, UserProfile, WatchLink } from "@/lib/types";

export type MemberDashboardData = {
  profile: UserProfile;
  settings: NotificationSettings;
  latestCheckIn: CheckIn;
  watchLinks: WatchLink[];
  logs: NotificationLog[];
};

const defaultSettings = (userId: string): NotificationSettings => ({
  userId,
  frequencyDays: 1,
  graceHours: 6,
  reminderChannel: "email",
  familyChannel: "push"
});

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
  const value = Math.floor(100000 + Math.random() * 900000);
  return `ANPI-${value}`;
}

function normalizeLog(id: string, data: Omit<NotificationLog, "id">): NotificationLog {
  return {
    id,
    ...data,
    createdAt: dateString(data.createdAt)
  };
}

export async function loadMemberDashboardAdmin(user: { uid: string; email?: string | null }): Promise<MemberDashboardData> {
  const db = getAdminDb();
  const now = new Date().toISOString();
  const userRef = db.collection("users").doc(user.uid);
  const settingsRef = db.collection("notificationSettings").doc(user.uid);

  const [userSnap, settingsSnap, checkInsSnap, linksSnap, logsSnap] = await Promise.all([
    userRef.get(),
    settingsRef.get(),
    db.collection("checkIns").where("memberId", "==", user.uid).limit(20).get(),
    db.collection("watchLinks").where("memberId", "==", user.uid).get(),
    db.collection("notificationLogs").where("memberId", "==", user.uid).limit(20).get()
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
    watchLinks: linksSnap.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<WatchLink, "id">) })),
    logs: logsSnap.docs
      .map((item) => normalizeLog(item.id, item.data() as Omit<NotificationLog, "id">))
      .sort(byNewestDate<NotificationLog>("createdAt"))
      .slice(0, 10)
  };
}

export async function saveSettingsAdmin(userId: string, settings: NotificationSettings) {
  if (settings.userId !== userId) {
    throw new Error("設定の保存権限がありません。");
  }

  await getAdminDb().collection("notificationSettings").doc(userId).set(settings, { merge: true });
}

export async function saveCheckInAdmin(userId: string, checkIn: CheckIn): Promise<CheckIn> {
  if (checkIn.memberId !== userId) {
    throw new Error("チェックインの保存権限がありません。");
  }

  await getAdminDb().collection("checkIns").add(checkIn);
  return checkIn;
}

export async function addFamilyContactAdmin(memberId: string, familyName: string, familyEmail: string): Promise<WatchLink> {
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
    lineLinkCode: code,
    inviteStatus: "pending",
    lineLinked: false,
    pushEnabled: false,
    preferredChannel: "push",
    active: false,
    createdAt
  };

  await db.collection("watchLinks").doc(id).set(link);
  return link;
}

export async function deactivateFamilyContactAdmin(memberId: string, linkId: string): Promise<WatchLink> {
  const db = getAdminDb();
  const linkRef = db.collection("watchLinks").doc(linkId);
  const linkSnap = await linkRef.get();

  if (!linkSnap.exists) {
    throw new Error("見守り先が見つかりません。");
  }

  const link = { id: linkSnap.id, ...(linkSnap.data() as Omit<WatchLink, "id">) };
  if (link.memberId !== memberId) {
    throw new Error("見守り解除の権限がありません。");
  }

  await linkRef.update({ active: false });
  return { ...link, active: false };
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

      return {
        link,
        member: memberSnap.data() as UserProfile,
        settings: settingsSnap.exists ? (settingsSnap.data() as NotificationSettings) : undefined,
        latestCheckIn
      };
    })
  );

  return targets.filter((target) => Boolean(target.member));
}

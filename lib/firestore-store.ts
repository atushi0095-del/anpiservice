import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";
import { getFirebaseClients } from "@/lib/firebase";
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

function normalizeLog(id: string, data: Omit<NotificationLog, "id">): NotificationLog {
  return {
    id,
    ...data,
    createdAt: dateString(data.createdAt)
  };
}

export function createLineLinkCode(): string {
  const value = Math.floor(100000 + Math.random() * 900000);
  return `ANPI-${value}`;
}

export async function loadMemberDashboard(user: { uid: string; email: string | null }): Promise<MemberDashboardData> {
  const { db } = getFirebaseClients();
  const userRef = doc(db, "users", user.uid);
  const now = new Date().toISOString();
  const settingsRef = doc(db, "notificationSettings", user.uid);
  const checkInsQuery = query(
    collection(db, "checkIns"),
    where("memberId", "==", user.uid),
    limit(20)
  );

  const [userSnap, settingsSnap, checkInsSnap, linksSnap, logsSnap] = await Promise.all([
    getDoc(userRef),
    getDoc(settingsRef),
    getDocs(checkInsQuery),
    getDocs(query(collection(db, "watchLinks"), where("memberId", "==", user.uid))),
    getDocs(query(collection(db, "notificationLogs"), where("memberId", "==", user.uid), limit(20)))
  ]);

  const profile: UserProfile = userSnap.exists()
    ? (userSnap.data() as UserProfile)
    : {
        id: user.uid,
        displayName: user.email?.split("@")[0] || "利用者",
        email: user.email || "",
        role: "member",
        createdAt: now
      };

  const settings = settingsSnap.exists() ? (settingsSnap.data() as NotificationSettings) : defaultSettings(user.uid);
  const latestCheckIn = checkInsSnap.docs
    .map((item) => item.data() as CheckIn)
    .sort(byNewestDate<CheckIn>("checkedAt"))[0];
  const ensuredCheckIn = latestCheckIn ?? createCheckIn(user.uid, settings, new Date());

  await Promise.all([
    userSnap.exists() ? Promise.resolve() : setDoc(userRef, profile),
    settingsSnap.exists() ? Promise.resolve() : setDoc(settingsRef, settings),
    latestCheckIn ? Promise.resolve() : addDoc(collection(db, "checkIns"), ensuredCheckIn)
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

export async function saveSettings(settings: NotificationSettings) {
  const { db } = getFirebaseClients();
  await setDoc(doc(db, "notificationSettings", settings.userId), settings, { merge: true });
}

export async function saveCheckIn(memberId: string, settings: NotificationSettings, checkIn = createCheckIn(memberId, settings)): Promise<CheckIn> {
  const { db } = getFirebaseClients();
  await addDoc(collection(db, "checkIns"), checkIn);
  return checkIn;
}

export async function addFamilyContact(memberId: string, familyName: string, familyEmail: string): Promise<WatchLink> {
  const { db } = getFirebaseClients();
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

  await setDoc(doc(db, "watchLinks", id), link);
  return link;
}

export async function updateFamilyLineState(link: WatchLink, lineLinked: boolean): Promise<WatchLink> {
  const { db } = getFirebaseClients();
  const next: WatchLink = {
    ...link,
    lineLinked,
    lineUserId: lineLinked ? link.lineUserId : undefined,
    lineLinkedAt: lineLinked ? link.lineLinkedAt || new Date().toISOString() : undefined
  };

  await updateDoc(doc(db, "watchLinks", link.id), {
    lineLinked: next.lineLinked,
    lineUserId: next.lineUserId,
    lineLinkedAt: next.lineLinkedAt
  });
  return next;
}

export async function deactivateFamilyContact(link: WatchLink): Promise<WatchLink> {
  const { db } = getFirebaseClients();
  await updateDoc(doc(db, "watchLinks", link.id), { active: false });
  return { ...link, active: false };
}

export async function loadFamilyDashboard(familyId: string): Promise<FamilyWatchTarget[]> {
  const { db } = getFirebaseClients();
  const linksSnap = await getDocs(
    query(collection(db, "watchLinks"), where("familyId", "==", familyId), where("active", "==", true))
  );

  const targets = await Promise.all(
    linksSnap.docs.map(async (item) => {
      const link = { id: item.id, ...(item.data() as Omit<WatchLink, "id">) };
      const [memberSnap, settingsSnap, checkInsSnap] = await Promise.all([
        getDoc(doc(db, "users", link.memberId)),
        getDoc(doc(db, "notificationSettings", link.memberId)),
        getDocs(query(collection(db, "checkIns"), where("memberId", "==", link.memberId), limit(20)))
      ]);
      const latestCheckIn = checkInsSnap.docs
        .map((checkIn) => checkIn.data() as CheckIn)
        .sort(byNewestDate<CheckIn>("checkedAt"))[0];

      return {
        link,
        member: memberSnap.data() as UserProfile,
        settings: settingsSnap.exists() ? (settingsSnap.data() as NotificationSettings) : undefined,
        latestCheckIn
      };
    })
  );

  return targets.filter((target) => Boolean(target.member));
}

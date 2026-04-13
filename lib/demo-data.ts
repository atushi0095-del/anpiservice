import type { CheckIn, NotificationLog, NotificationSettings, UserProfile, WatchLink } from "@/lib/types";
import { createCheckIn } from "@/lib/safety";

const now = new Date();
const baseSettings: NotificationSettings = {
  userId: "member-demo",
  frequencyDays: 1,
  graceHours: 6,
  reminderChannel: "email",
  familyChannel: "line"
};

export const demoMember: UserProfile = {
  id: "member-demo",
  displayName: "山田 花子",
  email: "hanako@example.jp",
  role: "member",
  createdAt: now.toISOString()
};

export const demoFamily: UserProfile = {
  id: "family-demo",
  displayName: "山田 太郎",
  email: "taro@example.jp",
  role: "family",
  createdAt: now.toISOString()
};

export const demoSettings = baseSettings;

export const demoWatchLinks: WatchLink[] = [
  {
    id: "watch-demo-1",
    memberId: demoMember.id,
    familyId: demoFamily.id,
    familyName: demoFamily.displayName,
    familyEmail: demoFamily.email,
    lineLinkCode: "ANPI-123456",
    lineUserId: "Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    lineLinked: true,
    lineLinkedAt: now.toISOString(),
    active: true,
    createdAt: now.toISOString()
  },
  {
    id: "watch-demo-2",
    memberId: demoMember.id,
    familyId: "family-demo-2",
    familyName: "佐藤 みどり",
    familyEmail: "midori@example.jp",
    lineLinkCode: "ANPI-654321",
    lineLinked: false,
    active: true,
    createdAt: now.toISOString()
  }
];

export const demoCheckIn: CheckIn = createCheckIn(demoMember.id, baseSettings, new Date(now.getTime() - 21 * 60 * 60 * 1000));

export const demoNotificationLogs: NotificationLog[] = [
  {
    id: "log-1",
    memberId: demoMember.id,
    watchLinkId: "watch-demo-1",
    recipientName: "山田 太郎",
    channel: "line",
    kind: "family_alert",
    status: "sent",
    message: "昨日のテスト通知をLINEで送信しました。",
    createdAt: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  },
  {
    id: "log-2",
    memberId: demoMember.id,
    recipientName: "山田 花子",
    channel: "email",
    kind: "self_reminder",
    status: "queued",
    message: "本日の確認時間が近づいています。",
    createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString()
  }
];

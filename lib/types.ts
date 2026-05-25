export type UserRole = "member" | "family";

export type CheckInFrequencyDays = 1 | 2 | 3;
export type ConnectionType = "family" | "friend";
export type ShareMode = "status" | "location";
export type ShareStatus = "safe" | "need_help" | "unavailable";

export type UserProfile = {
  id: string;
  displayName: string;
  email: string;
  role: UserRole;
  pushToken?: string;
  pushEnabled?: boolean;
  pushLinkedAt?: string;
  createdAt: string;
};

export type NotificationSettings = {
  userId: string;
  frequencyDays: CheckInFrequencyDays;
  graceHours: number;
  reminderChannel: "app" | "email";
  familyChannel: "push" | "line" | "email";
};

export type WatchLink = {
  id: string;
  memberId: string;
  familyId: string;
  familyName: string;
  familyEmail: string;
  connectionType?: ConnectionType;
  lineLinkCode: string;
  inviteStatus?: "pending" | "accepted";
  acceptedAt?: string;
  acceptedFamilyId?: string;
  lineUserId?: string;
  lineLinked: boolean;
  lineLinkedAt?: string;
  pushToken?: string;
  pushEnabled?: boolean;
  pushLinkedAt?: string;
  preferredChannel?: "push" | "line" | "email";
  active: boolean;
  createdAt: string;
};

export type FamilyWatchTarget = {
  link: WatchLink;
  member: UserProfile;
  latestCheckIn?: CheckIn;
  settings?: NotificationSettings;
};

export type QuickShare = {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  recipientName: string;
  connectionId?: string;
  connectionType?: ConnectionType;
  shareMode: ShareMode;
  status?: ShareStatus;
  message: string;
  locationText?: string;
  mapUrl?: string;
  durationMinutes: number;
  createdAt: string;
  expiresAt: string;
  viewedAt?: string;
};

export type CheckIn = {
  id: string;
  memberId: string;
  checkedAt: string;
  nextDueAt: string;
  status: "safe";
};

export type NotificationLog = {
  id: string;
  memberId: string;
  watchLinkId?: string;
  recipientName: string;
  channel: "app" | "email" | "line" | "push";
  kind: "self_reminder" | "family_alert";
  status: "queued" | "sent" | "failed" | "fallback";
  message: string;
  createdAt: string;
};

export type SafetyStatus = "ok" | "due_soon" | "overdue" | "alerting";

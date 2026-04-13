import type { CheckIn, CheckInFrequencyDays, NotificationSettings, SafetyStatus } from "@/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export function addFrequency(base: Date, frequencyDays: CheckInFrequencyDays): Date {
  return new Date(base.getTime() + frequencyDays * DAY_MS);
}

export function createCheckIn(memberId: string, settings: NotificationSettings, now = new Date()): CheckIn {
  return {
    id: `checkin-${now.getTime()}`,
    memberId,
    checkedAt: now.toISOString(),
    nextDueAt: addFrequency(now, settings.frequencyDays).toISOString(),
    status: "safe"
  };
}

export function getSafetyStatus(nextDueAt: string, graceHours: number, now = new Date()): SafetyStatus {
  const dueAt = new Date(nextDueAt).getTime();
  const current = now.getTime();

  if (current < dueAt - 2 * HOUR_MS) {
    return "ok";
  }

  if (current < dueAt) {
    return "due_soon";
  }

  if (current < dueAt + graceHours * HOUR_MS) {
    return "overdue";
  }

  return "alerting";
}

export function formatJapaneseDateTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;

  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function statusLabel(status: SafetyStatus): string {
  switch (status) {
    case "ok":
      return "見守り中";
    case "due_soon":
      return "そろそろ確認";
    case "overdue":
      return "本人へ確認中";
    case "alerting":
      return "家族へ通知対象";
  }
}

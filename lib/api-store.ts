"use client";

import type { User } from "firebase/auth";
import type { CheckIn, FamilyWatchTarget, NotificationSettings, WatchLink } from "@/lib/types";
import type { MemberDashboardData } from "@/lib/server-store";

export type { MemberDashboardData } from "@/lib/server-store";

async function requestJson<T>(user: User, path: string, init: RequestInit = {}): Promise<T> {
  const token = await user.getIdToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init.headers
    }
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "通信処理に失敗しました。");
  }

  return data as T;
}

export async function loadMemberDashboardViaApi(user: User): Promise<MemberDashboardData> {
  return requestJson<MemberDashboardData>(user, "/api/member/dashboard");
}

export async function loadFamilyDashboardViaApi(user: User): Promise<FamilyWatchTarget[]> {
  const data = await requestJson<{ targets: FamilyWatchTarget[] }>(user, "/api/family/dashboard");
  return data.targets;
}

export async function saveCheckInViaApi(user: User, checkIn: CheckIn): Promise<CheckIn> {
  const data = await requestJson<{ checkIn: CheckIn }>(user, "/api/member/checkins", {
    method: "POST",
    body: JSON.stringify({ checkIn })
  });
  return data.checkIn;
}

export async function saveSettingsViaApi(user: User, settings: NotificationSettings) {
  await requestJson<{ ok: true }>(user, "/api/member/settings", {
    method: "PUT",
    body: JSON.stringify({ settings })
  });
}

export async function addFamilyContactViaApi(user: User, familyName: string, familyEmail: string): Promise<WatchLink> {
  const data = await requestJson<{ link: WatchLink }>(user, "/api/member/family", {
    method: "POST",
    body: JSON.stringify({ familyName, familyEmail })
  });
  return data.link;
}

export async function deactivateFamilyContactViaApi(user: User, link: WatchLink): Promise<WatchLink> {
  const data = await requestJson<{ link: WatchLink }>(user, `/api/member/family/${encodeURIComponent(link.id)}`, {
    method: "PATCH",
    body: JSON.stringify({ active: false })
  });
  return data.link;
}

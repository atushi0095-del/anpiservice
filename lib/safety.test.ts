import { describe, expect, it } from "vitest";
import { addFrequency, createCheckIn, getSafetyStatus } from "@/lib/safety";
import type { NotificationSettings } from "@/lib/types";

const settings: NotificationSettings = {
  userId: "member-1",
  frequencyDays: 1,
  graceHours: 6,
  reminderChannel: "email",
  familyChannel: "line"
};

describe("safety rules", () => {
  it("calculates the next due date from the selected frequency", () => {
    const base = new Date("2026-04-13T00:00:00.000Z");

    expect(addFrequency(base, 1).toISOString()).toBe("2026-04-14T00:00:00.000Z");
    expect(addFrequency(base, 2).toISOString()).toBe("2026-04-15T00:00:00.000Z");
    expect(addFrequency(base, 3).toISOString()).toBe("2026-04-16T00:00:00.000Z");
  });

  it("creates a check-in with the configured frequency", () => {
    const checkIn = createCheckIn("member-1", settings, new Date("2026-04-13T09:00:00.000Z"));

    expect(checkIn.memberId).toBe("member-1");
    expect(checkIn.nextDueAt).toBe("2026-04-14T09:00:00.000Z");
    expect(checkIn.status).toBe("safe");
  });

  it("moves through due and alert states", () => {
    const nextDueAt = "2026-04-13T12:00:00.000Z";

    expect(getSafetyStatus(nextDueAt, 6, new Date("2026-04-13T09:00:00.000Z"))).toBe("ok");
    expect(getSafetyStatus(nextDueAt, 6, new Date("2026-04-13T11:00:00.000Z"))).toBe("due_soon");
    expect(getSafetyStatus(nextDueAt, 6, new Date("2026-04-13T13:00:00.000Z"))).toBe("overdue");
    expect(getSafetyStatus(nextDueAt, 6, new Date("2026-04-13T19:00:00.000Z"))).toBe("alerting");
  });
});

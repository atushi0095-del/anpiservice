import { describe, expect, it } from "vitest";
import { calculateSupplyMetrics } from "@/lib/supply-metrics";
import type { SupplyItem } from "@/lib/disaster-types";

function supply(id: string, quantity: string, targetQuantity?: string): SupplyItem {
  return {
    id,
    name: id,
    category: "food",
    quantity,
    targetQuantity,
    expiresAt: "",
    checked: false
  };
}

describe("supply metrics", () => {
  it("calculates the average fulfillment rate for each item", () => {
    const metrics = calculateSupplyMetrics([
      supply("ready", "6", "6"),
      supply("partial", "3", "9"),
      supply("empty", "0", "1")
    ]);

    expect(metrics.percent).toBe(44);
    expect(metrics.readyCount).toBe(1);
    expect(metrics.shortageCount).toBe(2);
  });

  it("caps surplus stock at one hundred percent", () => {
    const metrics = calculateSupplyMetrics([supply("surplus", "12", "6")]);

    expect(metrics.percent).toBe(100);
    expect(metrics.shortageCount).toBe(0);
  });

  it("keeps legacy items without a target fully compatible", () => {
    const metrics = calculateSupplyMetrics([supply("legacy", "4")]);

    expect(metrics.percent).toBe(100);
    expect(metrics.categories.find((item) => item.category === "food")?.readyCount).toBe(1);
  });
});
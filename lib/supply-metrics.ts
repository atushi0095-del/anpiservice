import type { SupplyCategory, SupplyItem } from "@/lib/disaster-types";

const supplyCategories: SupplyCategory[] = [
  "water",
  "food",
  "battery",
  "medicine",
  "baby",
  "pet",
  "other"
];

export type SupplyShortage = {
  item: SupplyItem;
  current: number;
  target: number;
  missing: number;
};

export type SupplyCategoryMetric = {
  category: SupplyCategory;
  itemCount: number;
  readyCount: number;
  percent: number;
};

export type SupplyMetrics = {
  percent: number;
  itemCount: number;
  readyCount: number;
  shortageCount: number;
  shortages: SupplyShortage[];
  categories: SupplyCategoryMetric[];
};

export function parseSupplyCount(value?: string) {
  const parsed = Number.parseInt(value || "0", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function getSupplyTarget(item: SupplyItem) {
  const current = parseSupplyCount(item.quantity);
  const explicitTarget = parseSupplyCount(item.targetQuantity);
  return explicitTarget || Math.max(current, 1);
}

export function calculateSupplyMetrics(items: SupplyItem[]): SupplyMetrics {
  const itemMetrics = items.map((item) => {
    const current = parseSupplyCount(item.quantity);
    const target = getSupplyTarget(item);
    const ratio = Math.min(current / target, 1);
    return { item, current, target, ratio, missing: Math.max(target - current, 0) };
  });

  const percent = itemMetrics.length
    ? Math.round((itemMetrics.reduce((total, item) => total + item.ratio, 0) / itemMetrics.length) * 100)
    : 0;
  const shortages = itemMetrics
    .filter((item) => item.missing > 0)
    .sort((left, right) => left.ratio - right.ratio || right.missing - left.missing);

  const categories = supplyCategories.map((category) => {
    const categoryItems = itemMetrics.filter((item) => item.item.category === category);
    const categoryPercent = categoryItems.length
      ? Math.round((categoryItems.reduce((total, item) => total + item.ratio, 0) / categoryItems.length) * 100)
      : 0;

    return {
      category,
      itemCount: categoryItems.length,
      readyCount: categoryItems.filter((item) => item.missing === 0).length,
      percent: categoryPercent
    };
  });

  return {
    percent,
    itemCount: itemMetrics.length,
    readyCount: itemMetrics.filter((item) => item.missing === 0).length,
    shortageCount: shortages.length,
    shortages,
    categories
  };
}
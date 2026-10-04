import { test } from "node:test";
import assert from "node:assert/strict";
import {
  selectPrices,
  validPriceDate,
  shopKey,
} from "../src/services/price-selection.ts";

const quote = (
  id,
  shopId,
  price,
  priceDate,
  createdAt = "2026-10-01T12:00:00Z",
  itemId = 1,
) => ({ id, shopId, price, priceDate, createdAt: new Date(createdAt), itemId });
test("lowest compares latest per shop, not the historical cheapest", () => {
  const rows = [
    quote(1, 1, 100, "2026-01-01"),
    quote(2, 1, 150, "2026-10-01"),
    quote(3, 2, 120, "2026-09-01"),
  ];
  assert.equal(selectPrices(rows, "lowest").get(1).price, 120);
  assert.equal(selectPrices(rows, "latest").get(1).price, 150);
});
test("price date wins over when the entry was added", () => {
  const rows = [
    quote(1, 1, 80, "2026-01-01", "2026-10-02T00:00:00Z"),
    quote(2, 1, 100, "2026-09-01", "2026-10-01T00:00:00Z"),
  ];
  assert.equal(selectPrices(rows, "latest").get(1).id, 2);
});
test("same-day entries use creation time, then ID deterministically", () => {
  const rows = [
    quote(1, 1, 1, "2026-10-01"),
    quote(2, 1, 2, "2026-10-01"),
    quote(3, 1, 3, "2026-10-01", "2026-10-01T13:00:00Z"),
  ];
  assert.equal(selectPrices(rows.reverse(), "lowest").get(1).id, 3);
});
test("zero prices and multiple items are not lost", () => {
  const rows = [
    quote(1, 1, 0, "2026-10-01"),
    quote(2, 2, 10, "2026-10-01"),
    quote(3, 1, 30, "2026-10-01", undefined, 2),
  ];
  assert.equal(selectPrices(rows, "lowest").get(1).price, 0);
  assert.equal(selectPrices(rows, "lowest").get(2).price, 30);
});
test("dates remain calendar strings and reject impossible days", () => {
  assert.equal(validPriceDate("2024-02-29"), true);
  for (const d of [
    "2025-02-29",
    "2026-02-30",
    "0000-01-01",
    "03.10.2026",
    "2026-10-01T00:00:00Z",
  ])
    assert.equal(validPriceDate(d), false);
});
test("shop identity ignores case and repeated whitespace", () => {
  assert.equal(shopKey("  Магазин   А  "), shopKey("магазин а"));
});

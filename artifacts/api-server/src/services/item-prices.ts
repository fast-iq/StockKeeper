import {
  db,
  itemPricesTable,
  shopsTable,
  priceSettingsTable,
} from "@workspace/db";
import { and, eq, inArray, desc } from "drizzle-orm";
import { selectPrices, type PriceMode } from "./price-selection";

export async function getPriceMode(userId: number): Promise<PriceMode> {
  const [settings] = await db
    .select()
    .from(priceSettingsTable)
    .where(eq(priceSettingsTable.userId, userId));
  return settings?.mode === "latest" ? "latest" : "lowest";
}

export async function withSelectedPrices<
  T extends { id: number; price?: number | null },
>(userId: number, items: T[]) {
  if (!items.length) return [];
  const quotes = await db
    .selectDistinctOn([itemPricesTable.itemId, itemPricesTable.shopId], {
      id: itemPricesTable.id,
      itemId: itemPricesTable.itemId,
      shopId: itemPricesTable.shopId,
      price: itemPricesTable.price,
      priceDate: itemPricesTable.priceDate,
      createdAt: itemPricesTable.createdAt,
      shopName: shopsTable.name,
    })
    .from(itemPricesTable)
    .innerJoin(
      shopsTable,
      and(
        eq(shopsTable.id, itemPricesTable.shopId),
        eq(shopsTable.userId, userId),
      ),
    )
    .where(
      and(
        eq(itemPricesTable.userId, userId),
        inArray(
          itemPricesTable.itemId,
          items.map((i) => i.id),
        ),
      ),
    )
    .orderBy(
      itemPricesTable.itemId,
      itemPricesTable.shopId,
      desc(itemPricesTable.priceDate),
      desc(itemPricesTable.createdAt),
      desc(itemPricesTable.id),
    );
  const selected = selectPrices(quotes, await getPriceMode(userId));
  return items.map((item) => {
    const quote = selected.get(item.id);
    return {
      ...item,
      legacyPrice: item.price ?? null,
      price: quote?.price ?? item.price ?? null,
      priceShopName: quote?.shopName ?? null,
      priceDate: quote?.priceDate ?? null,
    };
  });
}

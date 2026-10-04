export type PriceMode = "lowest" | "latest";
export const shopName = (name: string) => name.trim().replace(/\s+/g, " ");
export const shopKey = (name: string) => shopName(name).toLocaleLowerCase("ru");

export function validPriceDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1)
    return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

type Quote = {
  id: number;
  itemId: number;
  shopId: number;
  price: number;
  priceDate: string;
  createdAt: Date;
};
function recent(a: Quote, b: Quote): number {
  return (
    a.priceDate.localeCompare(b.priceDate) ||
    a.createdAt.getTime() - b.createdAt.getTime() ||
    a.id - b.id
  );
}
/** Collapse history per shop BEFORE comparing amounts; stale historical bargains must never win. */
export function selectPrices<T extends Quote>(
  quotes: T[],
  mode: PriceMode,
): Map<number, T> {
  const latest = new Map<string, T>();
  for (const quote of quotes) {
    const key = `${quote.itemId}:${quote.shopId}`;
    const old = latest.get(key);
    if (!old || recent(quote, old) > 0) latest.set(key, quote);
  }
  const result = new Map<number, T>();
  for (const quote of latest.values()) {
    const old = result.get(quote.itemId);
    if (
      !old ||
      (mode === "latest"
        ? recent(quote, old) > 0
        : quote.price < old.price ||
          (quote.price === old.price && recent(quote, old) > 0))
    ) {
      result.set(quote.itemId, quote);
    }
  }
  return result;
}

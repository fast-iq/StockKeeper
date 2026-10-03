import i18n from "@/i18n";

export const MAX_PRICE = 999999999999.99;

/** Returns {value} (null when empty) or {error} key. */
export function parsePrice(
  raw: FormDataEntryValue | null,
): { value: number | null } | { error: string } {
  const s = String(raw ?? "")
    .trim()
    .replace(",", ".");
  if (s === "") return { value: null };
  const parts = s.split(".");
  if (parts.length > 2 || parts.some((part) => !part || !/^\d+$/.test(part)))
    return { error: "price.invalid" };
  if (s.includes(".") && s.split(".")[1].length > 2)
    return { error: "price.tooManyDecimals" };
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > MAX_PRICE)
    return { error: "price.outOfRange" };
  return { value: n };
}

export function formatPrice(price: number | null | undefined): string | null {
  if (price === null || price === undefined) return null;
  const loc = i18n.language?.startsWith("ru") ? "ru-RU" : "en-US";
  return new Intl.NumberFormat(loc, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

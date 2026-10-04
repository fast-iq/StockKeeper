import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListShops,
  useCreateShop,
  useListItemPrices,
  useCreateItemPrice,
  useUpdateItemPrice,
  useDeleteItemPrice,
  getListShopsQueryKey,
  getListItemPricesQueryKey,
  getGetItemQueryKey,
  getListItemsQueryKey,
  getGetRecentItemsQueryKey,
  getGetDashboardStatsQueryKey,
  type ItemPrice,
  useGetMe,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPrice, parsePrice } from "@/lib/price";
import {
  Loader2,
  Pencil,
  Trash2,
  Plus,
  Store,
  AlertTriangle,
} from "lucide-react";

const NEW_SHOP = "__new__";
const today = () => {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
};
const errText = (e: unknown, fb: string) => {
  const x = e as { data?: { error?: string }; message?: string };
  return x?.data?.error || x?.message || fb;
};

export function ItemPrices({
  itemId,
  legacyPrice,
}: {
  itemId: number;
  legacyPrice?: number | null;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: user } = useGetMe();
  const pricesQ = useListItemPrices(itemId, {
    query: {
      queryKey: [...getListItemPricesQueryKey(itemId), user?.id],
      enabled: !!itemId && !!user,
    },
  });
  const shopsQ = useListShops({
    query: { queryKey: [...getListShopsQueryKey(), user?.id], enabled: !!user },
  });
  const createShop = useCreateShop();
  const createPrice = useCreateItemPrice();
  const updatePrice = useUpdateItemPrice();
  const deletePrice = useDeleteItemPrice();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ItemPrice | null>(null);
  const [shopId, setShopId] = useState("");
  const [newShop, setNewShop] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const saving =
    createShop.isPending || createPrice.isPending || updatePrice.isPending;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: getListItemPricesQueryKey(itemId) });
    qc.invalidateQueries({ queryKey: getGetItemQueryKey(itemId) });
    qc.invalidateQueries({ queryKey: getListItemsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetRecentItemsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
  };

  const reset = () => {
    setOpen(false);
    setEditing(null);
    setShopId("");
    setNewShop("");
    setAmount("");
    setDate(today());
    setError(null);
  };

  const startEdit = (p: ItemPrice) => {
    setEditing(p);
    setShopId(String(p.shopId));
    setAmount(String(p.price));
    setDate(p.priceDate.slice(0, 10));
    setNewShop("");
    setError(null);
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setError(null);
    const parsed = parsePrice(amount);
    if ("error" in parsed) return setError(t(parsed.error));
    if (parsed.value === null) return setError(t("prices.amountRequired"));
    if (!date) return setError(t("prices.dateRequired"));
    if (!shopId) return setError(t("prices.shopRequired"));
    try {
      let sid = Number(shopId);
      if (shopId === NEW_SHOP) {
        const name = newShop.trim();
        if (!name) return setError(t("prices.shopRequired"));
        const existing = shopsQ.data?.find(
          (s) => s.name.toLowerCase() === name.toLowerCase(),
        );
        if (existing) sid = existing.id;
        else {
          const shop = await createShop.mutateAsync({ data: { name } });
          sid = shop.id;
          qc.invalidateQueries({ queryKey: getListShopsQueryKey() });
        }
      }
      const data = { shopId: sid, price: parsed.value, priceDate: date };
      if (editing)
        await updatePrice.mutateAsync({
          id: itemId,
          priceId: editing.id,
          data,
        });
      else await createPrice.mutateAsync({ id: itemId, data });
      refresh();
      reset();
    } catch (err) {
      setError(errText(err, t("prices.saveFailed")));
    }
  };

  const remove = async (priceId: number) => {
    if (deletePrice.isPending) return;
    setRowError(null);
    try {
      await deletePrice.mutateAsync({ id: itemId, priceId });
      setConfirmId(null);
      refresh();
    } catch (err) {
      setRowError(errText(err, t("prices.deleteFailed")));
    }
  };

  const prices = [...(pricesQ.data ?? [])].sort((a, b) =>
    b.priceDate.localeCompare(a.priceDate),
  );

  return (
    <section
      className="bg-card rounded-xl border border-border overflow-hidden"
      data-testid="section-item-prices"
    >
      <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-muted/50">
        <h3 className="font-semibold text-sm uppercase tracking-wider flex items-center gap-2">
          <Store className="w-4 h-4" /> {t("prices.title")}
        </h3>
        {!open && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1"
            onClick={() => setOpen(true)}
            data-testid="button-add-price"
          >
            <Plus className="w-3.5 h-3.5" /> {t("prices.add")}
          </Button>
        )}
      </div>

      {open && (
        <form
          onSubmit={submit}
          className="p-4 space-y-3 border-b border-border bg-background"
          data-testid="form-item-price"
        >
          <div className="space-y-1">
            <Label htmlFor="price-shop">{t("prices.shop")}</Label>
            <select
              id="price-shop"
              value={shopId}
              disabled={saving}
              onChange={(e) => setShopId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              data-testid="select-price-shop"
            >
              <option value="">{t("prices.chooseShop")}</option>
              {shopsQ.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value={NEW_SHOP}>+ {t("prices.newShop")}</option>
            </select>
            {shopId === NEW_SHOP && (
              <Input
                value={newShop}
                maxLength={120}
                disabled={saving}
                onChange={(e) => setNewShop(e.target.value)}
                placeholder={t("prices.shopName")}
                data-testid="input-new-shop"
              />
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="price-amount">{t("prices.amount")}</Label>
              <Input
                id="price-amount"
                inputMode="decimal"
                value={amount}
                disabled={saving}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={t("price.placeholder")}
                className="font-mono"
                data-testid="input-price-amount"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="price-date">{t("prices.date")}</Label>
              <Input
                id="price-date"
                type="date"
                value={date}
                disabled={saving}
                onChange={(e) => setDate(e.target.value)}
                className="font-mono"
                data-testid="input-price-date"
              />
            </div>
          </div>
          {error && (
            <p role="alert" className="text-xs text-destructive flex gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={saving}
              onClick={reset}
            >
              {t("prices.cancel")}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={saving}
              data-testid="button-save-price"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
              {t("prices.save")}
            </Button>
          </div>
        </form>
      )}

      {pricesQ.isLoading ? (
        <div className="p-4 space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-7 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : pricesQ.isError ? (
        <div role="alert" className="p-4 text-sm space-y-2">
          <p className="text-destructive">{t("prices.loadFailed")}</p>
          <Button size="sm" variant="outline" onClick={() => pricesQ.refetch()}>
            {t("prices.retry")}
          </Button>
        </div>
      ) : prices.length === 0 ? (
        <p
          className="p-4 text-sm text-muted-foreground"
          data-testid="text-prices-empty"
        >
          {t("prices.empty")}
        </p>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {prices.map((p) => (
            <li
              key={p.id}
              className="px-4 py-2"
              data-testid={`row-price-${p.id}`}
            >
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{p.shopName}</div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {p.priceDate.slice(0, 10)}
                  </div>
                </div>
                <span className="font-mono font-bold">
                  {formatPrice(p.price)}
                </span>
                {confirmId === p.id ? (
                  <>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7"
                      disabled={deletePrice.isPending}
                      onClick={() => remove(p.id)}
                      data-testid={`button-confirm-delete-price-${p.id}`}
                    >
                      {deletePrice.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        t("prices.confirmDelete")
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7"
                      disabled={deletePrice.isPending}
                      onClick={() => setConfirmId(null)}
                    >
                      {t("prices.cancel")}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      aria-label={t("prices.edit")}
                      onClick={() => startEdit(p)}
                      data-testid={`button-edit-price-${p.id}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 hover:text-destructive"
                      aria-label={t("prices.delete")}
                      onClick={() => {
                        setRowError(null);
                        setConfirmId(p.id);
                      }}
                      data-testid={`button-delete-price-${p.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </>
                )}
              </div>
              {confirmId === p.id && rowError && (
                <p role="alert" className="text-xs text-destructive mt-1">
                  {rowError}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {legacyPrice != null && (
        <div
          className="px-4 py-2 border-t border-dashed border-border flex justify-between text-xs text-muted-foreground"
          data-testid="text-legacy-price"
        >
          <span>{t("prices.legacy")}</span>
          <span className="font-mono">{formatPrice(legacyPrice)}</span>
        </div>
      )}
    </section>
  );
}

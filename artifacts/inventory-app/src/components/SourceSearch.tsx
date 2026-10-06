import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListDataSources,
  useCreateDataSource,
  useDeleteDataSource,
  useSearchDataSources,
  useUpdateItem,
  getListDataSourcesQueryKey,
  getGetItemQueryKey,
  getListItemsQueryKey,
  getGetRecentItemsQueryKey,
  getGetDashboardStatsQueryKey,
  type SourceSearchResultItem,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPrice } from "@/lib/price";
import {
  Loader2,
  Search,
  Plus,
  Trash2,
  ExternalLink,
  SlidersHorizontal,
  AlertTriangle,
} from "lucide-react";

const errText = (e: unknown, fb: string) => {
  const x = e as { data?: { error?: string }; message?: string };
  return x?.data?.error || x?.message || fb;
};

const SOURCE_ERROR_CODES = [
  "timeout",
  "network",
  "too-large",
  "bad-format",
  "redirect-loop",
];

export function SourceSearch({
  itemId,
  initialQuery,
  initialQuantity,
}: {
  itemId: number;
  initialQuery: string;
  initialQuantity: number;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const sourcesQ = useListDataSources({
    query: { queryKey: getListDataSourcesQueryKey() },
  });
  const search = useSearchDataSources();
  const createSource = useCreateDataSource();
  const deleteSource = useDeleteDataSource();
  const updateItem = useUpdateItem();

  const [sourceId, setSourceId] = useState<string>("");
  const [query, setQuery] = useState(initialQuery);
  const [qty, setQty] = useState<string>(String(initialQuantity));
  const [results, setResults] = useState<SourceSearchResultItem[]>([]);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTemplate, setNewTemplate] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  useEffect(() => {
    if (!sourceId && sourcesQ.data && sourcesQ.data.length > 0) {
      setSourceId(String(sourcesQ.data[0].id));
    }
  }, [sourcesQ.data, sourceId]);

  useEffect(() => {
    if (initialQuery) setQuery(initialQuery);
  }, [initialQuery]);

  const sources = sourcesQ.data ?? [];
  const busy = search.isPending || updateItem.isPending;

  const refreshItem = () => {
    qc.invalidateQueries({ queryKey: getGetItemQueryKey(itemId) });
    qc.invalidateQueries({ queryKey: getListItemsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetRecentItemsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetDashboardStatsQueryKey() });
  };

  const runSearch = () => {
    const trimmed = query.trim();
    if (!sourceId || !trimmed || search.isPending) return;
    setActionError(null);
    search.mutate(
      { data: { sourceId: Number(sourceId), query: trimmed } },
      {
        onSuccess: (data) => {
          setResults(data.results ?? []);
          setSourceError(data.sourceError ?? null);
        },
        onError: (err) => {
          setResults([]);
          setSourceError(null);
          setActionError(errText(err, t("sources.searchFailed")));
        },
      },
    );
  };

  const [applied, setApplied] = useState(false);
  const toastApplied = () => {
    setApplied(true);
    setTimeout(() => setApplied(false), 2500);
  };

  const applyPrice = (price: number) => {
    if (updateItem.isPending) return;
    updateItem.mutate(
      { id: itemId, data: { price } },
      {
        onSuccess: () => {
          refreshItem();
          toastApplied();
        },
        onError: (err) =>
          setActionError(errText(err, t("sources.applyFailed"))),
      },
    );
  };

  const addSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (createSource.isPending) return;
    setActionError(null);
    try {
      const created = await createSource.mutateAsync({
        data: { name: newName.trim(), urlTemplate: newTemplate.trim() },
      });
      qc.invalidateQueries({ queryKey: getListDataSourcesQueryKey() });
      setSourceId(String(created.id));
      setNewName("");
      setNewTemplate("");
    } catch (err) {
      setActionError(errText(err, t("sources.addFailed")));
    }
  };

  const removeSource = async (id: number) => {
    if (deleteSource.isPending) return;
    setActionError(null);
    try {
      await deleteSource.mutateAsync({ id });
      setConfirmDeleteId(null);
      qc.invalidateQueries({ queryKey: getListDataSourcesQueryKey() });
      if (sourceId === String(id)) setSourceId("");
    } catch (err) {
      setActionError(errText(err, t("sources.deleteFailed")));
    }
  };

  const parsedQty = Number(qty);
  const quantity = Number.isFinite(parsedQty) && parsedQty >= 0 ? parsedQty : 0;

  const sourceErrorMessage = sourceError
    ? SOURCE_ERROR_CODES.includes(sourceError)
      ? t(`sources.error.${sourceError}`)
      : t("sources.error.generic")
    : null;

  return (
    <section
      className="bg-card rounded-xl border border-border overflow-hidden"
      data-testid="section-source-search"
    >
      <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-muted/50">
        <h3 className="font-semibold text-sm uppercase tracking-wider flex items-center gap-2">
          <Search className="w-4 h-4" /> {t("sources.title")}
        </h3>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          aria-label={t("sources.manage")}
          aria-pressed={manageOpen}
          onClick={() => setManageOpen((v) => !v)}
          data-testid="button-toggle-source-manage"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </Button>
      </div>

      <div className="p-4 space-y-3 border-b border-border">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1 col-span-2">
            <Label htmlFor="source-select">{t("sources.source")}</Label>
            <select
              id="source-select"
              value={sourceId}
              disabled={sourcesQ.isLoading}
              onChange={(e) => setSourceId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              data-testid="select-source"
            >
              <option value="">
                {sourcesQ.isLoading
                  ? t("sources.loading")
                  : t("sources.choose")}
              </option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1 col-span-2">
            <Label htmlFor="source-query">{t("sources.query")}</Label>
            <Input
              id="source-query"
              value={query}
              maxLength={100}
              disabled={busy}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runSearch();
                }
              }}
              placeholder={t("sources.queryPlaceholder")}
              className="font-mono"
              data-testid="input-source-query"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="source-qty">{t("sources.quantity")}</Label>
            <Input
              id="source-qty"
              type="number"
              min={0}
              value={qty}
              disabled={busy}
              onChange={(e) => setQty(e.target.value)}
              className="font-mono"
              data-testid="input-source-qty"
            />
          </div>
          <div className="space-y-1 flex items-end">
            <Button
              type="button"
              className="w-full"
              disabled={!sourceId || !query.trim() || busy}
              onClick={runSearch}
              data-testid="button-source-search"
            >
              {search.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Search className="w-4 h-4 mr-2" />
              )}
              {t("sources.search")}
            </Button>
          </div>
        </div>

        {actionError && (
          <p role="alert" className="text-xs text-destructive flex gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {actionError}
          </p>
        )}
        {sourceErrorMessage && (
          <p
            role="status"
            className="text-xs text-muted-foreground flex gap-1.5"
            data-testid="text-source-error"
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />{" "}
            {sourceErrorMessage}
          </p>
        )}
        {applied && (
          <p className="text-xs text-primary" data-testid="text-price-applied">
            {t("sources.priceApplied")}
          </p>
        )}
      </div>

      {search.isPending ? (
        <div className="p-4 space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-7 bg-muted rounded animate-pulse" />
          ))}
        </div>
      ) : results.length > 0 ? (
        <ul
          className="divide-y divide-border text-sm max-h-72 overflow-y-auto"
          data-testid="list-source-results"
        >
          {results.map((r, i) => (
            <li
              key={`${r.url ?? r.title}-${i}`}
              className="px-4 py-2"
              data-testid={`row-source-result-${i}`}
            >
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{r.title}</div>
                  <div className="text-xs text-muted-foreground font-mono">
                    {r.price != null ? formatPrice(r.price) : "—"}
                    {r.price != null && quantity > 1 && (
                      <span className="ml-1.5">
                        {t("sources.total", {
                          qty: quantity,
                          total: formatPrice(r.price * quantity) ?? "",
                        })}
                      </span>
                    )}
                  </div>
                </div>
                {r.price != null && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7"
                    disabled={updateItem.isPending}
                    onClick={() => applyPrice(r.price!)}
                    data-testid={`button-apply-price-${i}`}
                  >
                    {t("sources.applyPrice")}
                  </Button>
                )}
                {r.url && (
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                    aria-label={t("sources.open")}
                    data-testid={`link-source-result-${i}`}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        !search.isPending &&
        query.trim() !== "" &&
        !sourceError && (
          <p
            className="p-4 text-sm text-muted-foreground"
            data-testid="text-source-empty"
          >
            {t("sources.noResults")}
          </p>
        )
      )}

      {manageOpen && (
        <div
          className="p-4 border-t border-border space-y-3"
          data-testid="section-source-manage"
        >
          {sources.length > 0 && (
            <ul className="space-y-1">
              {sources.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-2 text-sm"
                  data-testid={`row-source-${s.id}`}
                >
                  <span className="truncate flex-1">{s.name}</span>
                  <span className="truncate max-w-[45%] text-xs text-muted-foreground font-mono">
                    {s.urlTemplate}
                  </span>
                  {confirmDeleteId === s.id ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        className="h-7"
                        disabled={deleteSource.isPending}
                        onClick={() => removeSource(s.id)}
                        data-testid={`button-confirm-delete-source-${s.id}`}
                      >
                        {t("sources.confirmDelete")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7"
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        {t("sources.cancel")}
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 hover:text-destructive"
                      aria-label={t("sources.delete")}
                      onClick={() => setConfirmDeleteId(s.id)}
                      data-testid={`button-delete-source-${s.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <form
            onSubmit={addSource}
            className="space-y-2"
            data-testid="form-add-source"
          >
            <div className="space-y-1">
              <Label htmlFor="source-name">{t("sources.name")}</Label>
              <Input
                id="source-name"
                value={newName}
                maxLength={60}
                disabled={createSource.isPending}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("sources.namePlaceholder")}
                data-testid="input-source-name"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="source-template">{t("sources.template")}</Label>
              <Input
                id="source-template"
                value={newTemplate}
                maxLength={500}
                disabled={createSource.isPending}
                onChange={(e) => setNewTemplate(e.target.value)}
                placeholder="https://example.com/search?q={sku}"
                className="font-mono text-xs"
                data-testid="input-source-template"
              />
              <p className="text-xs text-muted-foreground">
                {t("sources.templateHint")}
              </p>
            </div>
            <Button
              type="submit"
              size="sm"
              variant="outline"
              className="gap-1"
              disabled={
                !newName.trim() || !newTemplate.trim() || createSource.isPending
              }
              data-testid="button-add-source"
            >
              {createSource.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              {t("sources.add")}
            </Button>
          </form>
        </div>
      )}
    </section>
  );
}

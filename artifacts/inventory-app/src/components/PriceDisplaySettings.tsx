import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetPriceSettings,
  useUpdatePriceSettings,
  getGetPriceSettingsQueryKey,
  type PriceSettings,
  useGetMe,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Tag } from "lucide-react";

type Mode = PriceSettings["mode"];

export function PriceDisplaySettings() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: user } = useGetMe();
  const settingsKey = [...getGetPriceSettingsQueryKey(), user?.id];
  const q = useGetPriceSettings({
    query: { queryKey: settingsKey, enabled: !!user },
  });
  const update = useUpdatePriceSettings();
  const [mode, setMode] = useState<Mode>("lowest");
  useEffect(() => {
    if (q.data) setMode(q.data.mode);
  }, [q.data]);

  const save = () => {
    if (update.isPending) return;
    update.mutate(
      { data: { mode } },
      {
        onSuccess: (res) => {
          qc.setQueryData(settingsKey, res);
          // items, item details, dashboard and history all embed computed price
          qc.invalidateQueries({
            predicate: (query) => {
              const key = query.queryKey[0];
              return (
                typeof key === "string" &&
                (key.startsWith("/api/items") ||
                  key.startsWith("/api/dashboard"))
              );
            },
          });
          toast({ title: t("priceSettings.saved") });
        },
        onError: () =>
          toast({
            title: t("priceSettings.saveFailed"),
            variant: "destructive",
          }),
      },
    );
  };

  return (
    <div
      className="bg-card rounded-xl border border-border overflow-hidden"
      data-testid="section-price-settings"
    >
      <div className="px-4 py-4 border-b border-border flex items-center gap-2 sm:px-6">
        <Tag className="w-4 h-4 text-muted-foreground" />
        <h2 className="font-semibold">{t("priceSettings.title")}</h2>
      </div>
      <div className="p-4 space-y-3 sm:p-6">
        <p className="text-sm text-muted-foreground">
          {t("priceSettings.description")}
        </p>
        {q.isLoading ? (
          <div className="h-16 bg-muted rounded animate-pulse" />
        ) : q.isError ? (
          <div role="alert" className="text-sm space-y-2">
            <p className="text-destructive">{t("priceSettings.loadFailed")}</p>
            <Button size="sm" variant="outline" onClick={() => q.refetch()}>
              {t("prices.retry")}
            </Button>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["lowest", "latest"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  disabled={update.isPending}
                  onClick={() => setMode(m)}
                  data-testid={`button-price-mode-${m}`}
                  className={`p-3 rounded-lg border-2 text-left ${mode === m ? "border-primary bg-primary/5" : "border-border text-muted-foreground"}`}
                >
                  <div className="font-medium text-foreground">
                    {t(`priceSettings.${m}`)}
                  </div>
                  <div className="text-xs">{t(`priceSettings.${m}Hint`)}</div>
                </button>
              ))}
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={save}
                disabled={update.isPending || mode === q.data?.mode}
                data-testid="button-save-price-settings"
              >
                {update.isPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                {t("priceSettings.save")}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

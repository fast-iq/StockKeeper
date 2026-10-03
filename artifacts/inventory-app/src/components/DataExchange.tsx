import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import {
  exportData,
  usePreviewDataImport,
  useImportData,
  type TransferPreview,
  type TransferImportResult,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatPrice } from "@/lib/price";
import {
  Database,
  Download,
  FileSpreadsheet,
  FileJson,
  Upload,
  Loader2,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";

const MAX_BYTES = 5 * 1024 * 1024;
type Mode = "skip" | "add";

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error ?? new Error("read"));
    r.onload = () => {
      const buf = new Uint8Array(r.result as ArrayBuffer);
      let bin = "";
      const chunk = 0x8000;
      for (let i = 0; i < buf.length; i += chunk)
        bin += String.fromCharCode(...buf.subarray(i, i + chunk));
      resolve(btoa(bin));
    };
    r.readAsArrayBuffer(file);
  });
}

function errMsg(e: unknown, fallback: string): string {
  const x = e as { data?: { error?: string }; message?: string };
  return x?.data?.error || x?.message || fallback;
}

export function DataExchange() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const previewMut = usePreviewDataImport();
  const importMut = useImportData();
  const inputRef = useRef<HTMLInputElement>(null);

  const [exporting, setExporting] = useState<"json" | "xlsx" | null>(null);
  const [reading, setReading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<TransferPreview | null>(null);
  const [mode, setMode] = useState<Mode>("skip");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TransferImportResult | null>(null);

  const committing = importMut.isPending;
  const busy = reading || previewMut.isPending || committing;

  const handleExport = async (format: "json" | "xlsx") => {
    setExporting(format);
    try {
      const blob = await exportData({ format });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `stockkeeper-${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: t("exchange.exported") });
    } catch (e) {
      toast({
        title: t("exchange.exportFailed"),
        description: errMsg(e, t("exchange.tryAgain")),
        variant: "destructive",
      });
    } finally {
      setExporting(null);
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    setPreview(null);
    setResult(null);
    setError(null);
    setConfirmed(false);
    setMode("skip");
    previewMut.reset();
    importMut.reset();
    if (!file) {
      setFileName("");
      return;
    }
    setFileName(file.name);
    if (!/\.(xlsx|json)$/i.test(file.name)) {
      setError(t("exchange.badType"));
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(t("exchange.tooLarge"));
      return;
    }
    try {
      setReading(true);
      const content = await readBase64(file);
      setReading(false);
      const p = await previewMut.mutateAsync({
        data: { fileName: file.name, content },
      });
      setPreview(p);
    } catch (err) {
      setReading(false);
      setError(errMsg(err, t("exchange.previewFailed")));
    }
  };

  const commit = async () => {
    if (!preview || !confirmed) return;
    setError(null);
    try {
      const res = await importMut.mutateAsync({
        data: { data: preview.data, mode },
      });
      setResult(res);
      setPreview(null);
      setFileName("");
      setConfirmed(false);
      await qc.invalidateQueries();
      toast({ title: t("exchange.imported") });
    } catch (err) {
      setError(errMsg(err, t("exchange.importFailed")));
    }
  };

  const countRows: [keyof TransferPreview["counts"], string][] = [
    ["items", "exchange.items"],
    ["categories", "exchange.categories"],
    ["locations", "exchange.locations"],
    ["units", "exchange.units"],
    ["shoppingList", "exchange.shopping"],
  ];
  const sample = preview?.data.items.slice(0, 8) ?? [];
  const shoppingSample = preview?.data.shoppingList.slice(0, 8) ?? [];
  const categoryById = new Map(
    preview?.data.categories.map((category) => [category.id, category]),
  );
  const categoryPath = (id: number | null | undefined): string => {
    const parts: string[] = [];
    const seen = new Set<number>();
    while (id != null && categoryById.has(id) && !seen.has(id)) {
      seen.add(id);
      const category = categoryById.get(id)!;
      parts.unshift(category.name);
      id = category.parentId;
    }
    return parts.join(" / ");
  };

  return (
    <div
      className="bg-card rounded-xl border border-border overflow-hidden"
      data-testid="section-data-exchange"
    >
      <div className="px-4 py-4 border-b border-border flex items-center gap-2 sm:px-6">
        <Database className="w-4 h-4 text-muted-foreground" />
        <h2 className="font-semibold">{t("exchange.title")}</h2>
      </div>
      <div className="p-4 space-y-6 sm:p-6">
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("exchange.exportTitle")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t("exchange.exportHint")}
          </p>
          <div className="flex items-start gap-2 rounded-lg bg-primary/5 border border-primary/20 p-3 text-xs text-muted-foreground">
            <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <span>{t("exchange.privacyNote")}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["xlsx", "json"] as const).map((f) => (
              <Button
                key={f}
                type="button"
                variant="outline"
                className="justify-start h-auto py-3 gap-3"
                disabled={exporting !== null}
                onClick={() => handleExport(f)}
                data-testid={`button-export-${f}`}
              >
                {exporting === f ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : f === "xlsx" ? (
                  <FileSpreadsheet className="w-5 h-5 text-primary" />
                ) : (
                  <FileJson className="w-5 h-5 text-primary" />
                )}
                <span className="text-left">
                  <span className="block font-medium">
                    {t(`exchange.export_${f}`)}
                  </span>
                  <span className="block text-xs text-muted-foreground font-normal">
                    {t(`exchange.export_${f}_hint`)}
                  </span>
                </span>
                <Download className="w-4 h-4 ml-auto text-muted-foreground" />
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-3 border-t border-border pt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("exchange.importTitle")}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t("exchange.importHint")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("exchange.excelHint")}
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.json,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            id="import-file"
            onChange={onFile}
            disabled={busy}
            data-testid="input-import-file"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              data-testid="button-choose-file"
            >
              {reading || previewMut.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              {reading
                ? t("exchange.reading")
                : previewMut.isPending
                  ? t("exchange.checking")
                  : t("exchange.chooseFile")}
            </Button>
            <span className="text-sm text-muted-foreground break-all">
              {fileName || t("exchange.noFile")}
            </span>
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
              data-testid="text-import-error"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="break-words">{error}</span>
            </div>
          )}

          {result && (
            <div
              role="status"
              className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm space-y-1"
              data-testid="text-import-result"
            >
              <div className="font-medium">{t("exchange.imported")}</div>
              <div className="text-muted-foreground">
                {countRows
                  .map(([k, l]) => `${t(l)}: ${result.created[k]}`)
                  .join(" · ")}
              </div>
              <div className="text-muted-foreground">
                {t("exchange.skipped", { count: result.skipped })}
              </div>
            </div>
          )}

          {preview && (
            <div
              className="rounded-lg border border-border bg-background p-4 space-y-4"
              data-testid="panel-import-preview"
            >
              <h4 className="font-semibold text-sm">
                {t("exchange.previewTitle")}
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {countRows.map(([k, l]) => (
                  <div
                    key={k}
                    className="rounded-md border border-border bg-card px-3 py-2"
                  >
                    <div className="font-mono text-lg font-bold">
                      {preview.counts[k]}
                    </div>
                    <div className="text-xs text-muted-foreground">{t(l)}</div>
                  </div>
                ))}
              </div>

              {preview.warnings.length > 0 && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {t("exchange.warnings")}
                  </div>
                  <ul className="list-disc pl-5 space-y-0.5">
                    {preview.warnings.map((w, i) => (
                      <li key={i} className="break-words">
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {sample.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">
                    {t("exchange.sample", {
                      shown: sample.length,
                      total: preview.data.items.length,
                    })}
                  </div>
                  <ul className="divide-y divide-border rounded-md border border-border bg-card">
                    {sample.map((it, i) => {
                      const loc = [
                        preview.data.locations.find(
                          (l) => l.id === it.locationId,
                        )?.name,
                        it.location,
                      ]
                        .filter(Boolean)
                        .join(" · ");
                      const unit = preview.data.units.find(
                        (u) => u.id === it.unitId,
                      )?.symbol;
                      const price = formatPrice(it.price);
                      return (
                        <li key={i} className="px-3 py-2 text-sm">
                          <div className="flex justify-between gap-3">
                            <span className="font-medium break-words min-w-0">
                              {it.name}
                            </span>
                            <span className="font-mono shrink-0">
                              {it.quantity}
                              {unit ? ` ${unit}` : ""}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3">
                            {it.categoryId != null && (
                              <span className="break-words">
                                {categoryPath(it.categoryId)}
                              </span>
                            )}
                            <span>{loc || t("exchange.noLocation")}</span>
                            {price && (
                              <span className="font-mono">{price}</span>
                            )}
                            {it.tags && <span>{it.tags}</span>}
                          </div>
                          {it.description && (
                            <p className="whitespace-pre-line break-words text-xs text-muted-foreground">
                              {it.description}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {shoppingSample.length > 0 && (
                <div className="space-y-1">
                  <h5 className="text-sm font-medium">
                    {t("exchange.shopping")}
                  </h5>
                  <ul className="divide-y divide-border rounded-md border border-border bg-card">
                    {shoppingSample.map((entry) => (
                      <li key={entry.id} className="px-3 py-2 text-sm">
                        <div className="flex justify-between gap-3">
                          <span className="min-w-0 break-words">
                            {entry.name}
                          </span>
                          <span className="shrink-0 font-mono">
                            {entry.quantity} {entry.unit}
                          </span>
                        </div>
                        {entry.note && (
                          <p className="whitespace-pre-line break-words text-xs text-muted-foreground">
                            {entry.note}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <fieldset className="space-y-2" disabled={committing}>
                <legend className="text-sm font-medium mb-1">
                  {t("exchange.modeTitle")}
                </legend>
                {(["skip", "add"] as const).map((m) => (
                  <label
                    key={m}
                    className={`flex items-start gap-2 rounded-md border p-3 text-sm cursor-pointer ${mode === m ? "border-primary bg-primary/5" : "border-border"}`}
                  >
                    <input
                      type="radio"
                      name="import-mode"
                      checked={mode === m}
                      onChange={() => setMode(m)}
                      className="mt-1"
                      data-testid={`radio-mode-${m}`}
                    />
                    <span>
                      <span className="block font-medium">
                        {t(`exchange.mode_${m}`)}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {t(`exchange.mode_${m}_hint`)}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>

              <div className="flex items-start gap-2">
                <input
                  id="import-confirm"
                  type="checkbox"
                  checked={confirmed}
                  disabled={committing}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-1"
                  data-testid="checkbox-import-confirm"
                />
                <Label
                  htmlFor="import-confirm"
                  className="text-sm font-normal leading-snug"
                >
                  {t("exchange.confirm")}
                </Label>
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  disabled={!confirmed || busy}
                  onClick={commit}
                  className="w-full sm:w-auto"
                  data-testid="button-confirm-import"
                >
                  {committing && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  {committing
                    ? t("exchange.importing")
                    : t("exchange.importNow")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  useCreateItem,
  useListCategories,
  getListCategoriesQueryKey,
  getListItemsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TagInput } from "@/components/ui/tag-input";
import { Package, ArrowLeft, Save, Loader2, Image, Copy } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { CategoryNode } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Unit = { id: number; name: string; symbol: string; isCustom: boolean };
type StorageLocation = {
  id: number;
  name: string;
  description: string | null;
  icon: string | null;
};

function useUnits() {
  const [units, setUnits] = useState<Unit[]>([]);
  useEffect(() => {
    fetch(`${BASE}/api/units`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setUnits(data);
      })
      .catch(() => {});
  }, []);
  return units;
}

function useStorageLocations() {
  const [locations, setLocations] = useState<StorageLocation[]>([]);
  useEffect(() => {
    fetch(`${BASE}/api/locations`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setLocations(data);
      })
      .catch(() => {});
  }, []);
  return locations;
}

type CopySource = {
  name: string;
  description: string | null;
  photoUrl: string | null;
  quantity: number;
  unitId: number | null;
  locationId: number | null;
  location: string | null;
  sku: string | null;
  barcode: string | null;
  tags: string | null;
  notes: string | null;
  categoryId: number | null;
};

function NewItemForm({
  copySource,
  isCopy,
}: {
  copySource: CopySource | null;
  isCopy: boolean;
}) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createItem = useCreateItem();
  const units = useUnits();
  const storageLocations = useStorageLocations();

  const [photoPreview, setPhotoPreview] = useState<string>(
    copySource?.photoUrl ?? "",
  );

  const { data: categories } = useListCategories({
    query: { queryKey: getListCategoriesQueryKey() },
  });

  const flattenCategories = (
    nodes: CategoryNode[],
    result: CategoryNode[] = [],
    level = 0,
  ) => {
    nodes.forEach((node) => {
      result.push({ ...node, name: `${"—".repeat(level)} ${node.name}` });
      if (node.children) flattenCategories(node.children, result, level + 1);
    });
    return result;
  };
  const flatCategories = categories ? flattenCategories(categories) : [];

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const categoryIdVal = formData.get("categoryId");
    const unitIdVal = formData.get("unitId");
    const locationIdVal = formData.get("locationId");

    const data = {
      name: formData.get("name") as string,
      description: (formData.get("description") as string) || null,
      photoUrl: (formData.get("photoUrl") as string) || null,
      quantity: Number(formData.get("quantity")) || 0,
      unitId: unitIdVal && unitIdVal !== "none" ? Number(unitIdVal) : null,
      locationId:
        locationIdVal && locationIdVal !== "none"
          ? Number(locationIdVal)
          : null,
      location: (formData.get("location") as string) || null,
      sku: (formData.get("sku") as string) || null,
      barcode: (formData.get("barcode") as string) || null,
      tags: (formData.get("tags") as string) || null,
      notes: (formData.get("notes") as string) || null,
      categoryId:
        categoryIdVal && categoryIdVal !== "none"
          ? Number(categoryIdVal)
          : null,
    };

    createItem.mutate(
      { data },
      {
        onSuccess: (item) => {
          queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
          toast({
            title: isCopy ? "Товар скопирован" : t("itemNew.itemLogged"),
            description: isCopy
              ? `Создан «${item.name}»`
              : t("itemNew.successAdded"),
          });
          setLocation(`/items/${item.id}`);
        },
        onError: (err: any) => {
          toast({
            title: t("itemNew.failedCreate"),
            description: err.message,
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="border-b border-border bg-card sticky top-0 z-10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/inventory">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            {isCopy ? (
              <Copy className="w-5 h-5 text-primary" />
            ) : (
              <Package className="w-5 h-5 text-primary" />
            )}
            {isCopy ? "Копия товара" : t("itemNew.title")}
          </h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-6 md:p-8">
        <form id="new-item-form" onSubmit={handleSubmit} className="space-y-8">
          <div className="bg-card rounded-xl border border-border p-6 shadow-sm space-y-6">
            <h2 className="text-lg font-semibold border-b border-border pb-2">
              {t("itemNew.coreIdentity")}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="name">
                  {t("itemNew.itemName")}{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="name"
                  name="name"
                  required
                  defaultValue={copySource?.name ?? ""}
                  placeholder={t("itemNew.itemNamePlaceholder")}
                  className="text-lg py-6 bg-background font-medium"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sku">{t("itemNew.skuPartNumber")}</Label>
                <Input
                  id="sku"
                  name="sku"
                  defaultValue={copySource?.sku ?? ""}
                  placeholder={t("itemNew.skuPlaceholder")}
                  className="font-mono bg-background text-sm uppercase"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="categoryId">{t("itemNew.category")}</Label>
                <Select
                  name="categoryId"
                  defaultValue={copySource?.categoryId?.toString() ?? "none"}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue
                      placeholder={t("itemNew.categoryPlaceholder")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      {t("itemNew.uncategorized")}
                    </SelectItem>
                    {flatCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id.toString()}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="description">
                  {t("itemNew.shortDescription")}
                </Label>
                <Input
                  id="description"
                  name="description"
                  defaultValue={copySource?.description ?? ""}
                  placeholder={t("itemNew.descriptionPlaceholder")}
                  className="bg-background"
                />
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-6 shadow-sm space-y-6">
            <h2 className="text-lg font-semibold border-b border-border pb-2">
              {t("itemNew.quantitiesPhysical")}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="quantity">
                  {t("itemNew.initialQuantity")}{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="quantity"
                  name="quantity"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={copySource?.quantity?.toString() ?? "0"}
                  required
                  className="font-mono text-lg bg-background"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unitId">{t("itemNew.unitOfMeasure")}</Label>
                <Select
                  name="unitId"
                  defaultValue={copySource?.unitId?.toString() ?? "none"}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder={t("itemNew.unitPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("itemNew.noUnit")}</SelectItem>
                    {units.map((u) => (
                      <SelectItem key={u.id} value={u.id.toString()}>
                        {u.symbol} — {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="locationId">Место хранения</Label>
                <Select
                  name="locationId"
                  defaultValue={copySource?.locationId?.toString() ?? "none"}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Выберите место хранения" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Не указано</SelectItem>
                    {storageLocations.map((l) => (
                      <SelectItem key={l.id} value={l.id.toString()}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">Полка / Ячейка</Label>
                <Input
                  id="location"
                  name="location"
                  defaultValue={copySource?.location ?? ""}
                  placeholder="Стеллаж А, полка 3..."
                  className="bg-background font-mono text-sm uppercase"
                />
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-6 shadow-sm space-y-6">
            <h2 className="text-lg font-semibold border-b border-border pb-2">
              {t("itemNew.metadata")}
            </h2>
            <div className="grid grid-cols-1 gap-6">
              <div className="space-y-2">
                <Label>{t("itemNew.tags")}</Label>
                <TagInput
                  name="tags"
                  defaultValue={copySource?.tags ?? ""}
                  placeholder={t("itemNew.tagsPlaceholder")}
                />
                <p className="text-xs text-muted-foreground">
                  {t("itemNew.tagsHint")}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="photoUrl">{t("itemNew.photoUrl")}</Label>
                <Input
                  id="photoUrl"
                  name="photoUrl"
                  placeholder="https://..."
                  className="bg-background font-mono text-xs"
                  value={photoPreview}
                  onChange={(e) => setPhotoPreview(e.target.value)}
                />
                {photoPreview && (
                  <div className="mt-2 rounded-lg overflow-hidden border border-border bg-muted w-40 h-28 flex items-center justify-center">
                    <img
                      src={photoPreview}
                      alt="preview"
                      className="object-contain w-full h-full"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                )}
                {!photoPreview && (
                  <div className="mt-1 rounded-lg border border-dashed border-border bg-muted/30 w-40 h-28 flex flex-col items-center justify-center text-muted-foreground gap-1">
                    <Image className="w-6 h-6 opacity-30" />
                    <span className="text-xs opacity-40">
                      {t("itemNew.noPhoto")}
                    </span>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="barcode">{t("itemNew.barcodeData")}</Label>
                <Input
                  id="barcode"
                  name="barcode"
                  defaultValue={copySource?.barcode ?? ""}
                  placeholder={t("itemNew.barcodePlaceholder")}
                  className="font-mono bg-background"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">{t("itemNew.extendedNotes")}</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  defaultValue={copySource?.notes ?? ""}
                  placeholder={t("itemNew.notesPlaceholder")}
                  className="min-h-[100px] bg-background"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-4 pt-4 pb-12">
            <Link href="/inventory">
              <Button type="button" variant="outline" className="w-32">
                {t("itemNew.cancel")}
              </Button>
            </Link>
            <Button
              type="submit"
              className="w-40 font-bold"
              disabled={createItem.isPending}
            >
              {createItem.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              {isCopy ? "Сохранить копию" : t("itemNew.logItem")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function NewItemPage() {
  const copyFromId = new URLSearchParams(window.location.search).get(
    "copyFrom",
  );

  const [copySource, setCopySource] = useState<CopySource | null>(null);
  const [copyLoading, setCopyLoading] = useState(!!copyFromId);

  useEffect(() => {
    if (!copyFromId) return;
    fetch(`${BASE}/api/items/${copyFromId}`, { credentials: "include" })
      .then((r) => r.json())
      .then((item) => {
        if (item?.id) {
          setCopySource({
            name: item.name,
            description: item.description,
            photoUrl: item.photoUrl,
            quantity: item.quantity,
            unitId: item.unitId,
            locationId: item.locationId,
            location: item.location,
            sku: item.sku,
            barcode: item.barcode,
            tags: item.tags,
            notes: item.notes,
            categoryId: item.categoryId,
          });
        }
      })
      .catch(() => {})
      .finally(() => setCopyLoading(false));
  }, [copyFromId]);

  if (copyLoading) {
    return (
      <ProtectedRoute>
        <AppLayout>
          <div className="flex h-full items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        </AppLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <AppLayout>
        <NewItemForm copySource={copySource} isCopy={!!copyFromId} />
      </AppLayout>
    </ProtectedRoute>
  );
}

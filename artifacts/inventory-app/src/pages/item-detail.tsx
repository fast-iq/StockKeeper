import { useEffect, useState, useRef } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  type Item,
  useGetItem,
  getGetItemQueryKey,
  useUpdateItem,
  useListCategories,
  getListCategoriesQueryKey,
  getListItemsQueryKey,
  useAddToShoppingList,
  getListShoppingListQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BarcodeInput } from "@/components/BarcodeInput";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ItemPrices } from "@/components/ItemPrices";
import { SourceSearch } from "@/components/SourceSearch";
import { TagInput } from "@/components/ui/tag-input";
import {
  Package,
  ArrowLeft,
  Loader2,
  Minus,
  Plus,
  Save,
  Clock,
  MapPin,
  Tag,
  Box,
  Image,
  Copy,
  ShoppingCart,
} from "lucide-react";
import { Link, useParams, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { CategoryNode } from "@workspace/api-client-react";
import { formatDistanceToNow, format } from "date-fns";
import { ru as ruLocale, enUS } from "date-fns/locale";
import { parsePrice } from "@/lib/price";
import { formatPrice } from "@/lib/price";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";

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

export default function ItemDetailPage() {
  const { t } = useTranslation();
  const params = useParams();
  const id = Number(params.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const dateLocale = i18n.language?.startsWith("ru") ? ruLocale : enUS;
  const units = useUnits();
  const storageLocations = useStorageLocations();

  const { data: item, isLoading } = useGetItem(id, {
    query: { enabled: !!id, queryKey: getGetItemQueryKey(id) },
  });
  const { data: categories } = useListCategories({
    query: { queryKey: getListCategoriesQueryKey() },
  });
  const updateItem = useUpdateItem();
  const addToShoppingList = useAddToShoppingList();
  const [addedToList, setAddedToList] = useState(false);

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

  const [quantity, setQuantity] = useState<number>(0);
  const [photoPreview, setPhotoPreview] = useState<string>("");
  const initRef = useRef(false);

  useEffect(() => {
    if (item && !initRef.current) {
      setQuantity(item.quantity);
      setPhotoPreview(item.photoUrl || "");
      initRef.current = true;
    }
  }, [item]);

  const handleQuantityUpdate = (newQty: number) => {
    if (newQty < 0) return;
    setQuantity(newQty);

    queryClient.setQueryData<Item>(getGetItemQueryKey(id), (old) =>
      old ? { ...old, quantity: newQty } : old,
    );

    updateItem.mutate(
      { id, data: { quantity: newQty } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
        },
        onError: () => {
          toast({
            title: t("itemDetail.failedQuantity"),
            variant: "destructive",
          });
          setQuantity(item?.quantity || 0);
          queryClient.invalidateQueries({ queryKey: getGetItemQueryKey(id) });
        },
      },
    );
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const parsedPrice = parsePrice(formData.get("price"));
    if ("error" in parsedPrice) {
      toast({
        title: t("price.title"),
        description: t(parsedPrice.error),
        variant: "destructive",
      });
      return;
    }
    const categoryIdVal = formData.get("categoryId");
    const unitIdVal = formData.get("unitId");
    const locationIdVal = formData.get("locationId");

    const data = {
      name: formData.get("name") as string,
      description: (formData.get("description") as string) || null,
      photoUrl: (formData.get("photoUrl") as string) || null,
      price: parsedPrice.value,
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

    updateItem.mutate(
      { id, data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetItemQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
          toast({ title: t("itemDetail.itemUpdated") });
        },
        onError: (err) => {
          toast({
            title: t("itemDetail.updateFailed"),
            description: err.message,
            variant: "destructive",
          });
        },
      },
    );
  };

  if (isLoading) {
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

  if (!item) {
    return (
      <ProtectedRoute>
        <AppLayout>
          <div className="p-8 text-center">{t("itemDetail.itemNotFound")}</div>
        </AppLayout>
      </ProtectedRoute>
    );
  }

  const displayUnit = item.unitSymbol || item.unit || t("itemDetail.units");
  const locationDisplay = [item.locationName, item.location]
    .filter(Boolean)
    .join(" · ");

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="flex flex-col h-full bg-muted/10">
          <div className="border-b border-border bg-card sticky top-0 z-10 px-4 md:px-6 py-3 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-4">
              <Link href="/inventory">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              </Link>
              <div className="flex items-center gap-3">
                {item.photoUrl ? (
                  <img
                    src={item.photoUrl}
                    alt={item.name}
                    className="w-9 h-9 rounded-md object-contain bg-muted border border-border"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="w-9 h-9 rounded-md bg-muted border border-border flex items-center justify-center">
                    <Package className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
                <div className="flex flex-col">
                  <h1 className="font-bold tracking-tight text-lg flex items-center gap-2 truncate max-w-md">
                    {item.name}
                  </h1>
                  <div className="text-xs text-muted-foreground font-mono flex items-center gap-2">
                    <span>ID: {item.id}</span>
                    {item.sku && <span>• SKU: {item.sku}</span>}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-muted-foreground"
                disabled={addedToList || addToShoppingList.isPending}
                onClick={() => {
                  if (!item) return;
                  addToShoppingList.mutate(
                    {
                      data: {
                        itemId: item.id,
                        name: item.name,
                        quantity: 1,
                        unit: item.unitSymbol || item.unit || undefined,
                      },
                    },
                    {
                      onSuccess: () => {
                        queryClient.invalidateQueries({
                          queryKey: getListShoppingListQueryKey(),
                        });
                        setAddedToList(true);
                        toast({ title: "Добавлено в список покупок" });
                        setTimeout(() => setAddedToList(false), 3000);
                      },
                      onError: () =>
                        toast({ title: "Ошибка", variant: "destructive" }),
                    },
                  );
                }}
              >
                {addToShoppingList.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ShoppingCart className="w-3.5 h-3.5" />
                )}
                {addedToList ? "Добавлено ✓" : "В список покупок"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-muted-foreground"
                onClick={() => navigate(`/items/new?copyFrom=${id}`)}
              >
                <Copy className="w-3.5 h-3.5" />
                Дублировать
              </Button>
              <div className="flex items-center gap-2 bg-background border border-border rounded-md p-1 shadow-inner">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => handleQuantityUpdate(quantity - 1)}
                >
                  <Minus className="w-4 h-4" />
                </Button>
                <div className="w-16 text-center font-mono font-bold text-lg">
                  {quantity}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-primary/10 hover:text-primary"
                  onClick={() => handleQuantityUpdate(quantity + 1)}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
            <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <form
                  id="edit-item-form"
                  onSubmit={handleSubmit}
                  className="space-y-6"
                >
                  <div className="bg-card rounded-xl border border-border p-6 shadow-sm space-y-6">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
                      {t("itemDetail.properties")}
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="name">{t("itemDetail.itemName")}</Label>
                        <Input
                          id="name"
                          name="name"
                          defaultValue={item.name}
                          required
                          className="bg-background font-medium"
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="description">
                          {t("itemDetail.description")}
                        </Label>
                        <Textarea
                          id="description"
                          name="description"
                          defaultValue={item.description || ""}
                          className="bg-background"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="sku">{t("itemDetail.skuPartNo")}</Label>
                        <Input
                          id="sku"
                          name="sku"
                          defaultValue={item.sku || ""}
                          className="font-mono bg-background text-sm uppercase"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="categoryId">
                          {t("itemDetail.category2")}
                        </Label>
                        <Select
                          name="categoryId"
                          defaultValue={item.categoryId?.toString() || "none"}
                        >
                          <SelectTrigger className="bg-background">
                            <SelectValue
                              placeholder={t("itemDetail.categoryPlaceholder")}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">
                              {t("itemDetail.uncategorized")}
                            </SelectItem>
                            {flatCategories.map((c) => (
                              <SelectItem key={c.id} value={c.id.toString()}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <div className="bg-card rounded-xl border border-border p-6 shadow-sm space-y-6">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
                      {t("itemDetail.logistics")}
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <Label htmlFor="price">{t("price.legacyLabel")}</Label>
                        <Input
                          id="price"
                          name="price"
                          type="text"
                          inputMode="decimal"
                          defaultValue={item.legacyPrice?.toString() ?? ""}
                          placeholder={t("price.placeholder")}
                          className="font-mono bg-background"
                          data-testid="input-price"
                        />
                        <p className="text-xs text-muted-foreground">
                          {t("price.hint")}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="unitId">
                          {t("itemDetail.unitOfMeasure")}
                        </Label>
                        <Select
                          name="unitId"
                          defaultValue={item.unitId?.toString() || "none"}
                        >
                          <SelectTrigger className="bg-background">
                            <SelectValue
                              placeholder={t("itemDetail.unitPlaceholder")}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">
                              {t("itemNew.noUnit")}
                            </SelectItem>
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
                          defaultValue={item.locationId?.toString() || "none"}
                        >
                          <SelectTrigger className="bg-background">
                            <SelectValue placeholder="Выберите место" />
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
                          defaultValue={item.location || ""}
                          placeholder="Стеллаж А, полка 3..."
                          className="bg-background font-mono text-sm uppercase"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="barcode">
                          {t("itemDetail.barcode")}
                        </Label>
                        <BarcodeInput defaultValue={item.barcode || ""} />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label>{t("itemDetail.tags")}</Label>
                        <TagInput
                          name="tags"
                          defaultValue={item.tags || ""}
                          placeholder={t("itemNew.tagsPlaceholder")}
                        />
                        <p className="text-xs text-muted-foreground">
                          {t("itemNew.tagsHint")}
                        </p>
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="notes">{t("itemDetail.notes")}</Label>
                        <Textarea
                          id="notes"
                          name="notes"
                          defaultValue={item.notes || ""}
                          className="min-h-[100px] bg-background"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="bg-card rounded-xl border border-border p-6 shadow-sm space-y-4">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
                      {t("itemNew.photoUrl")}
                    </h2>
                    <div className="flex gap-4 items-start">
                      <div className="shrink-0 w-28 h-28 rounded-lg overflow-hidden border border-border bg-muted flex items-center justify-center">
                        {photoPreview ? (
                          <img
                            src={photoPreview}
                            alt="preview"
                            className="object-contain w-full h-full"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display =
                                "none";
                            }}
                          />
                        ) : (
                          <Image className="w-8 h-8 text-muted-foreground opacity-30" />
                        )}
                      </div>
                      <div className="flex-1 space-y-2">
                        <Label htmlFor="photoUrl">
                          {t("itemNew.photoUrl")}
                        </Label>
                        <Input
                          id="photoUrl"
                          name="photoUrl"
                          placeholder="https://..."
                          className="bg-background font-mono text-xs"
                          value={photoPreview}
                          onChange={(e) => setPhotoPreview(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          {t("itemNew.photoHint")}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      type="submit"
                      className="w-full md:w-auto"
                      disabled={updateItem.isPending}
                    >
                      {updateItem.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}
                      {t("itemDetail.saveChanges")}
                    </Button>
                  </div>
                </form>
              </div>

              <div className="space-y-6">
                <ItemPrices itemId={id} legacyPrice={item.legacyPrice} />
                <SourceSearch
                  itemId={id}
                  initialQuery={item.sku || item.barcode || ""}
                  initialQuantity={quantity}
                />
                <div className="bg-card rounded-xl border border-border overflow-hidden">
                  <div className="bg-muted/50 p-4 border-b border-border flex items-center justify-between">
                    <h3 className="font-semibold text-sm uppercase tracking-wider">
                      {t("itemDetail.status")}
                    </h3>
                    <div
                      className={`px-2 py-1 rounded-md text-xs font-bold font-mono ${quantity > 0 ? "bg-primary/20 text-primary" : "bg-destructive/20 text-destructive"}`}
                    >
                      {quantity > 0
                        ? t("itemDetail.inStock")
                        : t("itemDetail.depleted")}
                    </div>
                  </div>
                  <div className="p-4 space-y-4">
                    <div className="flex justify-between items-center pb-4 border-b border-border border-dashed">
                      <span className="text-muted-foreground flex items-center gap-2 text-sm">
                        <Box className="w-4 h-4" />{" "}
                        {t("itemDetail.currentQuantity")}
                      </span>
                      <span className="font-mono text-xl font-bold">
                        {quantity}{" "}
                        <span className="text-sm font-sans font-normal text-muted-foreground">
                          {displayUnit}
                        </span>
                      </span>
                    </div>
                    <div className="flex justify-between items-center pb-4 border-b border-border border-dashed">
                      <span className="text-muted-foreground text-sm">
                        {t("price.label")}
                      </span>
                      <span
                        className="font-mono text-sm"
                        data-testid="text-item-price"
                      >
                        {formatPrice(item.price) ?? "—"}
                      </span>
                    </div>
                    {item.priceShopName && (
                      <div className="-mt-2 pb-4 border-b border-border border-dashed text-right text-xs text-muted-foreground">
                        {item.priceShopName}
                        {item.priceDate
                          ? ` · ${item.priceDate.slice(0, 10)}`
                          : ""}
                      </div>
                    )}
                    <div className="hidden"></div>
                    <div className="flex justify-between items-center pb-4 border-b border-border border-dashed">
                      <span className="text-muted-foreground flex items-center gap-2 text-sm">
                        <MapPin className="w-4 h-4" />{" "}
                        {t("itemDetail.location")}
                      </span>
                      <span className="font-mono text-sm uppercase text-right">
                        {locationDisplay || t("itemDetail.unassigned")}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pb-4 border-b border-border border-dashed">
                      <span className="text-muted-foreground flex items-center gap-2 text-sm">
                        <Tag className="w-4 h-4" /> {t("itemDetail.category")}
                      </span>
                      <span className="text-sm font-medium">
                        {item.categoryName || t("itemDetail.uncategorized")}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pb-4 border-b border-border border-dashed">
                      <span className="text-muted-foreground flex items-center gap-2 text-sm">
                        <Clock className="w-4 h-4" />{" "}
                        {t("itemDetail.lastUpdated")}
                      </span>
                      <div className="text-right">
                        <div className="text-sm">
                          {formatDistanceToNow(new Date(item.updatedAt), {
                            addSuffix: true,
                            locale: dateLocale,
                          })}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(item.updatedAt), "PP p", {
                            locale: dateLocale,
                          })}
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground flex items-center gap-2 text-sm">
                        <Clock className="w-4 h-4" /> {t("itemDetail.created")}
                      </span>
                      <div className="text-right">
                        <div className="text-sm">
                          {format(new Date(item.createdAt), "PP", {
                            locale: dateLocale,
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {item.tags && (
                  <div className="bg-card rounded-xl border border-border p-4 space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t("itemDetail.tags")}
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {item.tags
                        .split(",")
                        .map((tag) => tag.trim())
                        .filter(Boolean)
                        .map((tag, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded-md bg-primary/15 text-primary text-xs font-medium border border-primary/25"
                          >
                            {tag}
                          </span>
                        ))}
                    </div>
                  </div>
                )}

                {item.barcode && (
                  <div className="bg-card rounded-xl border border-border p-4 flex flex-col items-center justify-center space-y-2">
                    <div className="h-16 w-full bg-foreground/10 rounded flex items-center justify-center border-y-4 border-foreground border-double opacity-50">
                      <div className="w-full flex justify-between px-4 opacity-50">
                        {[...Array(20)].map((_, i) => (
                          <div
                            key={i}
                            className={`h-12 bg-foreground ${i % 2 === 0 ? "w-1" : i % 3 === 0 ? "w-2" : "w-0.5"}`}
                          ></div>
                        ))}
                      </div>
                    </div>
                    <span className="font-mono text-sm tracking-widest">
                      {item.barcode}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}

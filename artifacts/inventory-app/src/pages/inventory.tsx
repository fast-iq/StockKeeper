import { formatPrice } from "@/lib/price";
import { useEffect, useRef, useState } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  useListCategories,
  getListCategoriesQueryKey,
  useListItems,
  getListItemsQueryKey,
  useUpdateItem,
  useDeleteItem,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search,
  Plus,
  Filter,
  FolderTree,
  Package,
  MoreVertical,
  Edit,
  Trash2,
  MapPin,
  Copy,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useQueryClient } from "@tanstack/react-query";
import type { CategoryNode, Item } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type StorageLocation = {
  id: number;
  name: string;
  icon: string | null;
  itemCount: number;
};

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

export default function InventoryPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<
    number | undefined
  >(undefined);
  const [selectedLocationId, setSelectedLocationId] = useState<
    number | undefined
  >(undefined);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { data: categories } = useListCategories({
    query: { queryKey: getListCategoriesQueryKey() },
  });
  const storageLocations = useStorageLocations();

  const queryParams = {
    categoryId: selectedCategoryId,
    locationId: selectedLocationId,
    search: debouncedSearch,
    includeSubcategories: true,
  };

  const { data: items, isLoading: itemsLoading } = useListItems(queryParams, {
    query: { queryKey: getListItemsQueryKey(queryParams) },
  });

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const handleSearchChange = (value: string) => {
    setSearch(value);
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(value), 300);
  };

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="flex h-full w-full overflow-hidden">
          {/* Sidebar */}
          <div className="w-64 border-r border-border bg-card flex flex-col h-full hidden md:flex">
            {/* Categories */}
            <div className="p-4 border-b border-border font-semibold flex items-center justify-between shrink-0">
              <span className="flex items-center gap-2">
                <FolderTree className="w-4 h-4" /> {t("inventory.categories")}
              </span>
              <Link href="/categories">
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <Edit className="w-3 h-3" />
                </Button>
              </Link>
            </div>
            <div
              className="overflow-y-auto p-2 space-y-1"
              style={{ maxHeight: "50%" }}
            >
              <div
                className={cn(
                  "px-3 py-2 rounded-md text-sm cursor-pointer hover:bg-muted/50 transition-colors flex justify-between items-center",
                  !selectedCategoryId && !selectedLocationId
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground",
                )}
                onClick={() => {
                  setSelectedCategoryId(undefined);
                  setSelectedLocationId(undefined);
                }}
              >
                <span>{t("inventory.allItems")}</span>
              </div>
              {categories?.map((cat) => (
                <CategoryTreeNode
                  key={cat.id}
                  category={cat}
                  level={0}
                  selectedId={selectedCategoryId}
                  onSelect={(id) => {
                    setSelectedCategoryId(id);
                    setSelectedLocationId(undefined);
                  }}
                />
              ))}
            </div>

            {/* Locations */}
            <div className="p-4 border-t border-b border-border font-semibold flex items-center justify-between shrink-0">
              <span className="flex items-center gap-2">
                <MapPin className="w-4 h-4" /> Места хранения
              </span>
              <Link href="/locations">
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <Edit className="w-3 h-3" />
                </Button>
              </Link>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {storageLocations.length === 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  <Link
                    href="/locations"
                    className="hover:text-primary transition-colors"
                  >
                    + Добавить место
                  </Link>
                </div>
              ) : null}
              {storageLocations.map((loc) => (
                <div
                  key={loc.id}
                  className={cn(
                    "px-3 py-2 rounded-md text-sm cursor-pointer hover:bg-muted/50 transition-colors flex justify-between items-center",
                    selectedLocationId === loc.id
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground",
                  )}
                  onClick={() => {
                    setSelectedLocationId(loc.id);
                    setSelectedCategoryId(undefined);
                  }}
                >
                  <span className="truncate">{loc.name}</span>
                  <span className="text-xs opacity-50 font-mono shrink-0 ml-1">
                    {loc.itemCount}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col min-w-0 h-full">
            <div className="p-4 md:p-6 border-b border-border bg-background flex flex-col gap-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                  {t("inventory.title")}
                  {selectedLocationId &&
                    storageLocations.find(
                      (l) => l.id === selectedLocationId,
                    ) && (
                      <span className="ml-2 text-base font-normal text-muted-foreground">
                        ·{" "}
                        {
                          storageLocations.find(
                            (l) => l.id === selectedLocationId,
                          )?.name
                        }
                      </span>
                    )}
                </h1>
                <Link href="/items/new">
                  <Button className="w-full sm:w-auto">
                    <Plus className="w-4 h-4 mr-2" /> {t("inventory.addItem")}
                  </Button>
                </Link>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t("inventory.searchPlaceholder")}
                    className="pl-9 bg-card"
                    value={search}
                    onChange={(e) => handleSearchChange(e.target.value)}
                  />
                </div>
                <Button
                  variant="outline"
                  className="md:hidden"
                  onClick={() => setFiltersOpen(true)}
                >
                  <Filter className="w-4 h-4 mr-2" /> {t("inventory.filter")}
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-muted/20">
              {itemsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className="h-16 bg-card border border-border rounded-lg animate-pulse"
                    />
                  ))}
                </div>
              ) : items && items.length > 0 ? (
                <>
                  <div className="hidden overflow-hidden rounded-lg border border-border bg-card md:block">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-muted-foreground bg-muted/50 border-b border-border uppercase">
                        <tr>
                          <th className="px-4 py-3 font-medium">
                            {t("inventory.colItem")}
                          </th>
                          <th className="px-4 py-3 font-medium">
                            {t("inventory.colSku")}
                          </th>
                          <th className="px-4 py-3 font-medium">
                            {t("inventory.colCategory")}
                          </th>
                          <th className="px-4 py-3 font-medium text-right">
                            {t("inventory.colQuantity")}
                          </th>
                          <th className="px-4 py-3 font-medium">
                            {t("inventory.colLocation")}
                          </th>
                          <th className="px-4 py-3 font-medium w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {items.map((item) => (
                          <ItemRow key={item.id} item={item} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="space-y-3 md:hidden">
                    {items.map((item) => (
                      <MobileItemCard key={item.id} item={item} />
                    ))}
                  </div>
                </>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center p-8">
                  <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4 text-muted-foreground">
                    <Package className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-medium text-foreground">
                    {t("inventory.noItemsFound")}
                  </h3>
                  <p className="text-muted-foreground mt-1 max-w-sm mb-6">
                    {search || selectedCategoryId || selectedLocationId
                      ? t("inventory.adjustFilters")
                      : t("inventory.emptyInventory")}
                  </p>
                  {!search && !selectedCategoryId && !selectedLocationId && (
                    <Link href="/items/new">
                      <Button>
                        <Plus className="w-4 h-4 mr-2" />{" "}
                        {t("inventory.addItem")}
                      </Button>
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
          <SheetContent
            side="bottom"
            className="max-h-[82dvh] rounded-t-2xl px-4 pb-8"
          >
            <SheetHeader className="text-left">
              <SheetTitle>{t("inventory.filter")}</SheetTitle>
            </SheetHeader>
            <div className="mt-4 max-h-[60dvh] space-y-5 overflow-y-auto">
              <div className="space-y-1">
                <button
                  type="button"
                  className={cn(
                    "flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-left text-sm",
                    !selectedCategoryId && !selectedLocationId
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:bg-muted/60",
                  )}
                  onClick={() => {
                    setSelectedCategoryId(undefined);
                    setSelectedLocationId(undefined);
                    setFiltersOpen(false);
                  }}
                >
                  {t("inventory.allItems")}
                </button>
                {categories?.map((cat) => (
                  <CategoryTreeNode
                    key={cat.id}
                    category={cat}
                    level={0}
                    selectedId={selectedCategoryId}
                    onSelect={(id) => {
                      setSelectedCategoryId(id);
                      setSelectedLocationId(undefined);
                      setFiltersOpen(false);
                    }}
                  />
                ))}
              </div>
              <div className="space-y-1 border-t border-border pt-4">
                <div className="mb-2 flex items-center gap-2 px-3 text-sm font-semibold">
                  <MapPin className="h-4 w-4" />
                  Места хранения
                </div>
                {storageLocations.map((loc) => (
                  <button
                    type="button"
                    key={loc.id}
                    className={cn(
                      "flex min-h-11 w-full items-center justify-between rounded-lg px-3 text-left text-sm",
                      selectedLocationId === loc.id
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-muted-foreground hover:bg-muted/60",
                    )}
                    onClick={() => {
                      setSelectedLocationId(loc.id);
                      setSelectedCategoryId(undefined);
                      setFiltersOpen(false);
                    }}
                  >
                    <span className="truncate">{loc.name}</span>
                    <span className="ml-2 text-xs opacity-60">
                      {loc.itemCount}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </AppLayout>
    </ProtectedRoute>
  );
}

function CategoryTreeNode({
  category,
  level,
  selectedId,
  onSelect,
}: {
  category: CategoryNode;
  level: number;
  selectedId?: number;
  onSelect: (id: number) => void;
}) {
  const isSelected = selectedId === category.id;
  const [expanded, setExpanded] = useState(true);

  return (
    <div>
      <div
        className={cn(
          "px-3 py-2 rounded-md text-sm cursor-pointer hover:bg-muted/50 transition-colors flex items-center gap-2 group",
          isSelected
            ? "bg-primary/10 text-primary font-medium"
            : "text-muted-foreground",
        )}
        style={{ paddingLeft: `${level * 12 + 12}px` }}
      >
        {category.children && category.children.length > 0 ? (
          <button
            className="w-4 h-4 flex items-center justify-center hover:bg-muted rounded"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            {expanded ? (
              <span className="text-xs">▼</span>
            ) : (
              <span className="text-xs">▶</span>
            )}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <div
          className="flex-1 min-w-0 flex items-center justify-between"
          onClick={() => onSelect(category.id)}
        >
          <span className="truncate flex items-center gap-2">
            {category.color && (
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: category.color }}
              />
            )}
            {category.name}
          </span>
          <span className="text-xs opacity-50 group-hover:opacity-100 font-mono">
            {category.itemCount}
          </span>
        </div>
      </div>
      {expanded &&
        category.children?.map((child) => (
          <CategoryTreeNode
            key={child.id}
            category={child as CategoryNode}
            level={level + 1}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}

function ItemRow({ item }: { item: Item }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const updateItem = useUpdateItem();
  const deleteItem = useDeleteItem();
  const [, navigate] = useLocation();

  const handleQuantityChange = (amount: number) => {
    const newQuantity = Math.max(0, item.quantity + amount);
    updateItem.mutate(
      { id: item.id, data: { quantity: newQuantity } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
        },
      },
    );
  };

  const handleDelete = () => {
    if (confirm(t("inventory.confirmDelete"))) {
      deleteItem.mutate(
        { id: item.id },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
          },
        },
      );
    }
  };

  const locationDisplay = [item.locationName, item.location]
    .filter(Boolean)
    .join(" · ");

  return (
    <tr className="hover:bg-muted/30 group transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {item.photoUrl && (
            <img
              src={item.photoUrl}
              alt={item.name}
              className="w-7 h-7 rounded object-contain bg-muted border border-border shrink-0"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          )}
          <div>
            <Link
              href={`/items/${item.id}`}
              className="block font-medium hover:text-primary transition-colors"
            >
              {item.name}
            </Link>
            {item.tags && (
              <div className="flex flex-wrap gap-1 mt-0.5">
                {item.tags
                  .split(",")
                  .map((tag: string) => tag.trim())
                  .filter(Boolean)
                  .map((tag: string, i: number) => (
                    <span
                      key={i}
                      className="px-1.5 py-0 rounded text-[10px] font-medium bg-primary/10 text-primary border border-primary/20 leading-4"
                    >
                      {tag}
                    </span>
                  ))}
              </div>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
        {item.sku || "-"}
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {item.categoryName || "-"}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          <button
            className="w-6 h-6 flex items-center justify-center rounded border border-border bg-card hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
            onClick={() => handleQuantityChange(-1)}
            disabled={updateItem.isPending}
          >
            -
          </button>
          <span className="font-mono font-bold w-12 text-center inline-block">
            {item.quantity}
            {item.unitSymbol ? (
              <span className="text-xs text-muted-foreground font-normal ml-0.5">
                {item.unitSymbol}
              </span>
            ) : null}
          </span>
          {item.price != null && (
            <span
              className="ml-2 text-xs font-mono text-muted-foreground"
              data-testid={`text-price-${item.id}`}
            >
              {formatPrice(item.price)}
            </span>
          )}
          <button
            className="w-6 h-6 flex items-center justify-center rounded border border-border bg-card hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
            onClick={() => handleQuantityChange(1)}
            disabled={updateItem.isPending}
          >
            +
          </button>
        </div>
      </td>
      <td className="px-4 py-3 text-muted-foreground text-xs">
        {locationDisplay || "-"}
      </td>
      <td className="px-4 py-3 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 group-hover:opacity-100"
            >
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <Link href={`/items/${item.id}`}>
              <DropdownMenuItem>
                <Edit className="w-4 h-4 mr-2" /> {t("inventory.editDetails")}
              </DropdownMenuItem>
            </Link>
            <DropdownMenuItem
              onClick={() => navigate(`/items/new?copyFrom=${item.id}`)}
            >
              <Copy className="w-4 h-4 mr-2" /> Дублировать
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={handleDelete}
            >
              <Trash2 className="w-4 h-4 mr-2" /> {t("inventory.deleteItem")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

function MobileItemCard({ item }: { item: Item }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const updateItem = useUpdateItem();
  const deleteItem = useDeleteItem();
  const [, navigate] = useLocation();
  const locationDisplay = [item.locationName, item.location]
    .filter(Boolean)
    .join(" · ");

  const invalidateItems = () => {
    queryClient.invalidateQueries({ queryKey: getListItemsQueryKey() });
  };

  const handleQuantityChange = (amount: number) => {
    updateItem.mutate(
      { id: item.id, data: { quantity: Math.max(0, item.quantity + amount) } },
      { onSuccess: invalidateItems },
    );
  };

  const handleDelete = () => {
    if (confirm(t("inventory.confirmDelete"))) {
      deleteItem.mutate({ id: item.id }, { onSuccess: invalidateItems });
    }
  };

  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        {item.photoUrl ? (
          <img
            src={item.photoUrl}
            alt={item.name}
            className="h-12 w-12 shrink-0 rounded-lg border border-border bg-muted object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
            <Package className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <Link
            href={`/items/${item.id}`}
            className="block truncate font-semibold hover:text-primary"
          >
            {item.name}
          </Link>
          <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
            {item.sku && (
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono">
                {item.sku}
              </span>
            )}
            {item.categoryName && (
              <span className="truncate">{item.categoryName}</span>
            )}
          </div>
          {item.tags && (
            <div className="mt-1 flex flex-wrap gap-1">
              {item.tags
                .split(",")
                .map((tag: string) => tag.trim())
                .filter(Boolean)
                .map((tag: string, i: number) => (
                  <span
                    key={i}
                    className="rounded border border-primary/20 bg-primary/10 px-1.5 text-[10px] leading-4 text-primary"
                  >
                    {tag}
                  </span>
                ))}
            </div>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <Link href={`/items/${item.id}`}>
              <DropdownMenuItem>
                <Edit className="mr-2 h-4 w-4" /> {t("inventory.editDetails")}
              </DropdownMenuItem>
            </Link>
            <DropdownMenuItem
              onClick={() => navigate(`/items/new?copyFrom=${item.id}`)}
            >
              <Copy className="mr-2 h-4 w-4" /> Дублировать
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={handleDelete}
            >
              <Trash2 className="mr-2 h-4 w-4" /> {t("inventory.deleteItem")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
        <div className="min-w-0 text-xs text-muted-foreground">
          <MapPin className="mr-1 inline-block h-3.5 w-3.5" />
          <span className="truncate">{locationDisplay || "-"}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-lg text-muted-foreground active:bg-muted"
            onClick={() => handleQuantityChange(-1)}
            disabled={updateItem.isPending}
          >
            -
          </button>
          <span className="min-w-12 text-center font-mono font-bold">
            {item.quantity}
            {item.unitSymbol ? (
              <span className="ml-0.5 text-xs font-normal text-muted-foreground">
                {item.unitSymbol}
              </span>
            ) : null}
          </span>
          {item.price != null && (
            <span
              className="ml-2 text-xs font-mono text-muted-foreground"
              data-testid={`text-price-${item.id}`}
            >
              {formatPrice(item.price)}
            </span>
          )}
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-lg text-muted-foreground active:bg-muted"
            onClick={() => handleQuantityChange(1)}
            disabled={updateItem.isPending}
          >
            +
          </button>
        </div>
      </div>
    </article>
  );
}

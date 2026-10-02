import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  useGetDashboardStats,
  getGetDashboardStatsQueryKey,
  useGetRecentItems,
  getGetRecentItemsQueryKey,
  useGetCategoryCounts,
  getGetCategoryCountsQueryKey,
} from "@workspace/api-client-react";
import {
  type LucideIcon,
  Package,
  FolderTree,
  TrendingUp,
  Clock,
  AlertTriangle,
  Layers,
  ArrowRight,
} from "lucide-react";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { ru as ruLocale, enUS } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";

export default function DashboardPage() {
  const { t } = useTranslation();
  const dateLocale = i18n.language?.startsWith("ru") ? ruLocale : enUS;

  const { data: stats, isLoading: statsLoading } = useGetDashboardStats({
    query: { queryKey: getGetDashboardStatsQueryKey() },
  });

  const { data: recentItems, isLoading: recentLoading } = useGetRecentItems(
    { limit: 5 },
    {
      query: { queryKey: getGetRecentItemsQueryKey({ limit: 5 }) },
    },
  );

  const { data: categoryCounts, isLoading: countsLoading } =
    useGetCategoryCounts({
      query: { queryKey: getGetCategoryCountsQueryKey() },
    });

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
          <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  {t("dashboard.title")}
                </h1>
                <p className="text-muted-foreground mt-1">
                  {t("dashboard.subtitle")}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Link href="/items/new">
                  <div className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer sm:w-auto">
                    <Package className="w-4 h-4 mr-2" />
                    {t("dashboard.newItem")}
                  </div>
                </Link>
              </div>
            </div>

            {statsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-32 bg-card rounded-xl border border-border animate-pulse"
                  ></div>
                ))}
              </div>
            ) : stats ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  title={t("dashboard.totalItems")}
                  value={stats.totalItems}
                  icon={Layers}
                  trend={t("dashboard.activeNodes")}
                  color="text-blue-500"
                  bg="bg-blue-500/10"
                />
                <StatCard
                  title={t("dashboard.totalQuantity")}
                  value={stats.totalQuantity}
                  icon={Package}
                  trend={t("dashboard.unitsInStock")}
                  color="text-primary"
                  bg="bg-primary/10"
                />
                <StatCard
                  title={t("dashboard.categories")}
                  value={stats.totalCategories}
                  icon={FolderTree}
                  trend={t("dashboard.activeNodes")}
                  color="text-green-500"
                  bg="bg-green-500/10"
                />
                <StatCard
                  title={t("dashboard.lowStock")}
                  value={stats.lowStockItems}
                  icon={AlertTriangle}
                  trend={t("dashboard.actionRequired")}
                  color="text-destructive"
                  bg="bg-destructive/10"
                  alert={stats.lowStockItems > 0}
                />
              </div>
            ) : null}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Clock className="w-5 h-5 text-muted-foreground" />
                    {t("dashboard.recentActivity")}
                  </h2>
                  <Link
                    href="/inventory"
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                  >
                    {t("dashboard.viewAll")} <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>

                <div className="bg-card rounded-xl border border-border overflow-hidden">
                  {recentLoading ? (
                    <div className="p-8 text-center text-muted-foreground">
                      {t("dashboard.loadingRecent")}
                    </div>
                  ) : recentItems && recentItems.length > 0 ? (
                    <div className="divide-y divide-border">
                      {recentItems.map((item) => (
                        <Link key={item.id} href={`/items/${item.id}`}>
                          <div className="p-4 hover:bg-muted/50 transition-colors flex items-center gap-4 cursor-pointer group">
                            <div className="w-10 h-10 rounded-md bg-secondary flex items-center justify-center text-secondary-foreground border border-border">
                              <Package className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-foreground truncate group-hover:text-primary transition-colors">
                                {item.name}
                              </div>
                              <div className="text-sm text-muted-foreground flex items-center gap-2 mt-0.5">
                                {item.sku && (
                                  <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                                    {item.sku}
                                  </span>
                                )}
                                {item.categoryName && (
                                  <span>{item.categoryName}</span>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-lg font-mono">
                                {item.quantity} {item.unit || ""}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(item.createdAt), {
                                  addSuffix: true,
                                  locale: dateLocale,
                                })}
                              </div>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="p-12 text-center flex flex-col items-center justify-center">
                      <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4 text-muted-foreground">
                        <Package className="w-8 h-8" />
                      </div>
                      <h3 className="text-lg font-medium text-foreground">
                        {t("dashboard.noItemsYet")}
                      </h3>
                      <p className="text-muted-foreground mt-1 max-w-sm">
                        {t("dashboard.emptyWorkspace")}
                      </p>
                      <Link href="/items/new" className="mt-4">
                        <div className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 cursor-pointer">
                          {t("dashboard.addFirstItem")}
                        </div>
                      </Link>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-muted-foreground" />
                  {t("dashboard.categoryBreakdown")}
                </h2>
                <div className="bg-card rounded-xl border border-border p-6 space-y-4">
                  {countsLoading ? (
                    <div className="text-center p-4 text-muted-foreground">
                      {t("dashboard.loadingBreakdown")}
                    </div>
                  ) : categoryCounts && categoryCounts.length > 0 ? (
                    <div className="space-y-4">
                      {categoryCounts.map((count) => (
                        <div key={count.categoryId}>
                          <div className="flex justify-between text-sm mb-1.5">
                            <span className="font-medium text-foreground">
                              {count.categoryName}
                            </span>
                            <span className="font-mono text-muted-foreground">
                              {count.itemCount} {t("dashboard.items")}
                            </span>
                          </div>
                          <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.max(5, (count.itemCount / (stats?.totalItems || 1)) * 100)}%`,
                                backgroundColor:
                                  count.color || "hsl(var(--primary))",
                              }}
                            ></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center p-4 text-muted-foreground text-sm">
                      {t("dashboard.noCategoriesWithItems")}
                    </div>
                  )}

                  <div className="pt-4 border-t border-border mt-6">
                    <p className="text-sm text-muted-foreground italic">
                      {t("dashboard.quote")}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}

type StatCardProps = {
  title: string;
  value: number;
  icon: LucideIcon;
  trend: string;
  color: string;
  bg: string;
  alert?: boolean;
};

function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  color,
  bg,
  alert,
}: StatCardProps) {
  return (
    <div
      className={`bg-card rounded-xl border p-6 flex flex-col justify-between ${alert ? "border-destructive shadow-[0_0_15px_rgba(255,0,0,0.1)]" : "border-border shadow-sm"}`}
    >
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        <div className={`p-2 rounded-md ${bg} ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div>
        <div className="text-3xl font-bold font-mono tracking-tight text-foreground">
          {value?.toLocaleString() || 0}
        </div>
        <div className="text-xs text-muted-foreground mt-1 font-medium">
          {trend}
        </div>
      </div>
    </div>
  );
}

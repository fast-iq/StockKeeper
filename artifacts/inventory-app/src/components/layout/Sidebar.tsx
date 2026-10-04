import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Package,
  FolderTree,
  Settings,
  LogOut,
  Loader2,
  Package2,
  Shield,
  MapPin,
  ShoppingCart,
  Menu,
} from "lucide-react";
import { useLogout, useGetMe } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { setLanguage } from "@/i18n";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function Sidebar() {
  const [location] = useLocation();
  const logout = useLogout();
  const { data: user } = useGetMe();
  const { t } = useTranslation();

  // Sync language from user preferences once available
  useEffect(() => {
    const userLang = user?.language;
    if (userLang === "ru" || userLang === "en" || userLang === "auto") {
      setLanguage(userLang);
    }
  }, [user?.language]);

  const navItems = [
    { href: "/dashboard", label: t("nav.overview"), icon: LayoutDashboard },
    { href: "/inventory", label: t("nav.inventory"), icon: Package },
    { href: "/categories", label: t("nav.categories"), icon: FolderTree },
    { href: "/locations", label: t("nav.locations"), icon: MapPin },
    { href: "/shopping-list", label: t("nav.shopping"), icon: ShoppingCart },
  ];

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        window.location.href = "/login";
      },
    });
  };

  return (
    <>
      <aside className="hidden md:flex w-64 bg-sidebar border-r border-sidebar-border h-screen sticky top-0 flex-col text-sidebar-foreground shrink-0">
        <div className="p-4 md:p-6 border-b border-sidebar-border flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center text-primary-foreground">
            <Package2 className="w-5 h-5" />
          </div>
          <div className="font-bold text-lg tracking-tight font-mono">
            {t("app.name")}
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <div className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-4 px-2">
            {t("nav.navigation")}
          </div>
          {navItems.map((item) => {
            const isActive =
              location === item.href || location.startsWith(`${item.href}/`);
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer group",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                  )}
                >
                  <item.icon
                    className={cn(
                      "w-4 h-4 transition-colors",
                      isActive
                        ? "text-primary"
                        : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80",
                    )}
                  />
                  {item.label}
                </div>
              </Link>
            );
          })}

          <div className="pt-2 space-y-1">
            <Link href="/settings">
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer group",
                  location === "/settings"
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                )}
              >
                <Settings
                  className={cn(
                    "w-4 h-4 transition-colors",
                    location === "/settings"
                      ? "text-primary"
                      : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80",
                  )}
                />
                {t("nav.settings")}
              </div>
            </Link>

            {user?.isAdmin && (
              <Link href="/admin">
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer group",
                    location === "/admin"
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                  )}
                >
                  <Shield
                    className={cn(
                      "w-4 h-4 transition-colors",
                      location === "/admin"
                        ? "text-primary"
                        : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80",
                    )}
                  />
                  {t("nav.admin")}
                </div>
              </Link>
            )}
          </div>
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-3 py-2 mb-2 rounded-md bg-sidebar-accent/30">
            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-secondary-foreground border border-secondary-border">
              {user?.name?.[0]?.toUpperCase() || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{user?.name}</div>
              <div className="text-xs text-sidebar-foreground/50 truncate">
                {user?.email}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
            onClick={handleLogout}
            disabled={logout.isPending}
          >
            {logout.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <LogOut className="w-4 h-4 mr-2" />
            )}
            {t("nav.signOut")}
          </Button>
        </div>
      </aside>

      <div className="md:hidden">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Package2 className="h-5 w-5" />
            </span>
            <span className="truncate font-mono text-sm font-bold tracking-tight">
              {t("app.name")}
            </span>
          </Link>
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 shrink-0"
                aria-label={t("nav.navigation")}
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-[85vw] max-w-sm bg-sidebar text-sidebar-foreground"
            >
              <SheetHeader className="border-b border-sidebar-border pb-4 text-left">
                <SheetTitle className="flex items-center gap-2 text-sidebar-foreground">
                  <Package2 className="h-5 w-5 text-primary" />
                  {t("nav.navigation")}
                </SheetTitle>
                <SheetDescription className="text-sidebar-foreground/60">
                  {user?.email}
                </SheetDescription>
              </SheetHeader>
              <nav className="mt-6 space-y-1">
                {[
                  ...navItems,
                  {
                    href: "/settings",
                    label: t("nav.settings"),
                    icon: Settings,
                  },
                  ...(user?.isAdmin
                    ? [{ href: "/admin", label: t("nav.admin"), icon: Shield }]
                    : []),
                ].map((item) => {
                  const isActive =
                    location === item.href ||
                    location.startsWith(`${item.href}/`);
                  return (
                    <SheetClose asChild key={item.href}>
                      <Link href={item.href}>
                        <div
                          className={cn(
                            "flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition-colors",
                            isActive
                              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                              : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60",
                          )}
                        >
                          <item.icon
                            className={cn(
                              "h-5 w-5",
                              isActive
                                ? "text-primary"
                                : "text-sidebar-foreground/50",
                            )}
                          />
                          {item.label}
                        </div>
                      </Link>
                    </SheetClose>
                  );
                })}
              </nav>
              <Button
                variant="ghost"
                className="mt-6 w-full justify-start text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                onClick={handleLogout}
                disabled={logout.isPending}
              >
                {logout.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="mr-2 h-4 w-4" />
                )}
                {t("nav.signOut")}
              </Button>
            </SheetContent>
          </Sheet>
        </header>

        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-card/95 px-1 pb-[env(safe-area-inset-bottom)] pt-1 shadow-[0_-8px_20px_rgba(0,0,0,0.12)] backdrop-blur">
          {[
            {
              href: "/dashboard",
              label: t("nav.overview"),
              icon: LayoutDashboard,
            },
            { href: "/inventory", label: t("nav.inventory"), icon: Package },
            {
              href: "/categories",
              label: t("nav.categories"),
              icon: FolderTree,
            },
            {
              href: "/shopping-list",
              label: t("nav.shopping"),
              icon: ShoppingCart,
            },
            { href: "/settings", label: t("nav.settings"), icon: Settings },
          ].map((item) => {
            const isActive =
              location === item.href || location.startsWith(`${item.href}/`);
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md px-1 text-[10px] transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <item.icon
                    className={cn("h-4 w-4", isActive && "fill-primary/10")}
                  />
                  <span className="max-w-full truncate">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </nav>
      </div>
    </>
  );
}

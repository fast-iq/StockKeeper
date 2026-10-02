import { useGetMe } from "@workspace/api-client-react";
import { Redirect } from "wouter";
import { Sidebar } from "@/components/layout/Sidebar";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ru as ruLocale, enUS } from "date-fns/locale";
import i18n from "@/i18n";
import {
  Shield,
  Users,
  Globe,
  Crown,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type AdminUser = {
  id: number;
  email: string;
  name: string;
  language: string;
  isAdmin: boolean;
  createdAt: string;
  itemCount: number;
};

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function fetchAdminUsers(): Promise<AdminUser[]> {
  const res = await fetch(`${BASE}/api/admin/users`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch users");
  return res.json();
}

async function patchAdminUser(
  id: number,
  updates: { language?: string; isAdmin?: boolean },
): Promise<AdminUser> {
  const res = await fetch(`${BASE}/api/admin/users/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Update failed");
  }
  return res.json();
}

function useAdminUsers() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminUsers();
      setUsers(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const updateUser = (updated: AdminUser) => {
    setUsers(
      (prev) => prev?.map((u) => (u.id === updated.id ? updated : u)) ?? null,
    );
  };

  return { users, loading, error, load, updateUser };
}

const LANG_LABELS: Record<string, string> = {
  en: "English",
  ru: "Русский",
  auto: "Auto",
};

const LANG_FLAGS: Record<string, string> = {
  en: "🇬🇧",
  ru: "🇷🇺",
  auto: "🌐",
};

export default function AdminPage() {
  const { data: me } = useGetMe();
  const { t } = useTranslation();
  const { toast } = useToast();
  const dateLocale = i18n.language?.startsWith("ru") ? ruLocale : enUS;

  const { users, loading, error, load, updateUser } = useAdminUsers();
  const [updating, setUpdating] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  if (!loaded && !loading) {
    setLoaded(true);
    load();
  }

  const isAdmin = (me as any)?.isAdmin;
  if (me && !isAdmin) {
    return <Redirect to="/dashboard" />;
  }

  const handleLanguageChange = async (userId: number, lang: string) => {
    setUpdating(userId);
    try {
      const updated = await patchAdminUser(userId, { language: lang });
      updateUser(updated);
      toast({ title: t("admin.languageUpdated"), description: updated.name });
    } catch (e: any) {
      toast({
        title: t("admin.updateFailed"),
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setUpdating(null);
    }
  };

  const handleAdminToggle = async (userId: number, makeAdmin: boolean) => {
    setUpdating(userId);
    try {
      const updated = await patchAdminUser(userId, { isAdmin: makeAdmin });
      updateUser(updated);
      toast({
        title: makeAdmin ? t("admin.adminGranted") : t("admin.adminRevoked"),
        description: updated.name,
      });
    } catch (e: any) {
      toast({
        title: t("admin.updateFailed"),
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setUpdating(null);
    }
  };

  const myId = (me as any)?.id;

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar />
      <div className="flex-1 overflow-auto">
        <div className="p-6 md:p-8 max-w-6xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-md bg-primary/20 flex items-center justify-center">
                <Shield className="w-4 h-4 text-primary" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight font-mono">
                {t("admin.title")}
              </h1>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("admin.subtitle")}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("admin.totalUsers")}
                </span>
              </div>
              <div className="text-3xl font-bold font-mono">
                {users ? users.length : "—"}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <Crown className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("admin.admins")}
                </span>
              </div>
              <div className="text-3xl font-bold font-mono">
                {users ? users.filter((u) => u.isAdmin).length : "—"}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <Globe className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("admin.totalItems")}
                </span>
              </div>
              <div className="text-3xl font-bold font-mono">
                {users ? users.reduce((s, u) => s + u.itemCount, 0) : "—"}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {t("admin.userList")}
              </h2>
              {loading && (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              )}
            </div>

            {error && (
              <div className="px-6 py-8 text-center text-destructive text-sm">
                {error}
              </div>
            )}

            {!loading && !error && users && users.length === 0 && (
              <div className="px-6 py-8 text-center text-muted-foreground text-sm">
                {t("admin.noUsers")}
              </div>
            )}

            {users && users.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("admin.colUser")}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("admin.colRole")}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("admin.colLanguage")}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("admin.colItems")}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("admin.colSince")}
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("admin.colActions")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {users.map((user) => (
                      <tr
                        key={user.id}
                        className={`transition-colors hover:bg-muted/20 ${
                          user.id === myId ? "bg-primary/5" : ""
                        }`}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-secondary-foreground border border-border shrink-0">
                              {user.name?.[0]?.toUpperCase() || "?"}
                            </div>
                            <div>
                              <div className="font-medium flex items-center gap-2">
                                {user.name}
                                {user.id === myId && (
                                  <span className="text-xs text-muted-foreground font-normal">
                                    ({t("admin.you")})
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground font-mono">
                                {user.email}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {user.isAdmin ? (
                            <Badge className="bg-primary/20 text-primary border-primary/30 hover:bg-primary/30 font-mono text-xs gap-1">
                              <Crown className="w-3 h-3" />
                              {t("admin.roleAdmin")}
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="font-mono text-xs text-muted-foreground"
                            >
                              {t("admin.roleUser")}
                            </Badge>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              disabled={updating === user.id}
                              className="flex items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-md border border-border hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-mono"
                            >
                              {updating === user.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <span>{LANG_FLAGS[user.language] || "🌐"}</span>
                              )}
                              <span className="text-xs">
                                {LANG_LABELS[user.language] || user.language}
                              </span>
                              <ChevronDown className="w-3 h-3 text-muted-foreground" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              {(["ru", "en", "auto"] as const).map((lang) => (
                                <DropdownMenuItem
                                  key={lang}
                                  onClick={() =>
                                    handleLanguageChange(user.id, lang)
                                  }
                                  className={`font-mono text-sm gap-2 ${user.language === lang ? "text-primary font-semibold" : ""}`}
                                >
                                  {LANG_FLAGS[lang]} {LANG_LABELS[lang]}
                                  {user.language === lang && (
                                    <span className="ml-auto text-xs text-primary">
                                      ✓
                                    </span>
                                  )}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                        <td className="px-6 py-4 font-mono text-muted-foreground">
                          {user.itemCount}
                        </td>
                        <td className="px-6 py-4 text-muted-foreground text-xs">
                          {format(new Date(user.createdAt), "PP", {
                            locale: dateLocale,
                          })}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              disabled={updating === user.id}
                              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-accent transition-colors ml-auto disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {t("admin.manage")}
                              <ChevronDown className="w-3 h-3" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {!user.isAdmin ? (
                                <DropdownMenuItem
                                  onClick={() =>
                                    handleAdminToggle(user.id, true)
                                  }
                                  className="gap-2 text-sm"
                                >
                                  <Crown className="w-3.5 h-3.5 text-primary" />
                                  {t("admin.grantAdmin")}
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onClick={() =>
                                    handleAdminToggle(user.id, false)
                                  }
                                  disabled={user.id === myId}
                                  className="gap-2 text-sm text-destructive focus:text-destructive"
                                >
                                  <Shield className="w-3.5 h-3.5" />
                                  {t("admin.revokeAdmin")}
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { PriceDisplaySettings } from "@/components/PriceDisplaySettings";
import { DataExchange } from "@/components/DataExchange";
import { getGetMeQueryKey, useGetMe } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  getLanguagePreference,
  setLanguage,
  type LanguagePreference,
} from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Settings,
  Globe,
  User,
  LockKeyhole,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ru as ruLocale, enUS } from "date-fns/locale";
import i18n from "@/i18n";
import { useChangePassword } from "@workspace/api-client-react";

// Keep the deadline active through body consumption, not just response headers.
const LANGUAGE_REQUEST_TIMEOUT_MS = 10_000;

async function withLanguageRequestTimeout<T>(
  request: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    LANGUAGE_REQUEST_TIMEOUT_MS,
  );
  try {
    return await request(controller.signal);
  } finally {
    window.clearTimeout(timeout);
  }
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: user } = useGetMe();
  const queryClient = useQueryClient();
  const [selectedLang, setSelectedLang] = useState<LanguagePreference>(
    getLanguagePreference,
  );
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [languageUnverified, setLanguageUnverified] = useState(false);
  useEffect(() => {
    const lang = user?.language;
    if (lang === "en" || lang === "ru" || lang === "auto") {
      setSelectedLang(lang);
    }
  }, [user?.language]);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const changePasswordMutation = useChangePassword();

  const verifyLanguage = async () => {
    const profile = await withLanguageRequestTimeout(async (signal) => {
      const response = await fetch("/api/auth/me", {
        credentials: "include",
        cache: "no-store",
        signal,
      });
      if (!response.ok) throw new Error("Language verification failed");
      return response.json();
    });
    const language = profile.language;
    if (
      profile.id !== user?.id ||
      (language !== "en" && language !== "ru" && language !== "auto")
    ) {
      throw new Error("Invalid language verification response");
    }
    queryClient.setQueryData(getGetMeQueryKey(), profile);
    setLanguage(language);
    setLanguageUnverified(false);
    return language as LanguagePreference;
  };

  const showUnverified = () => {
    setLanguageUnverified(true);
    toast({
      title: t("settings.languageUnverified"),
      variant: "destructive",
    });
  };

  const handleVerifyLanguage = async () => {
    setSavingLanguage(true);
    try {
      setSelectedLang(await verifyLanguage());
      toast({ title: t("settings.languageVerified") });
    } catch {
      showUnverified();
    } finally {
      setSavingLanguage(false);
    }
  };

  const handleSave = async () => {
    setSavingLanguage(true);
    let rejected = false;
    try {
      const updatedUser = await withLanguageRequestTimeout(async (signal) => {
        const response = await fetch("/api/auth/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ language: selectedLang }),
          signal,
        });
        if (!response.ok) {
          rejected = true;
          throw new Error("Language preference was not saved");
        }
        return response.json();
      });
      queryClient.setQueryData(getGetMeQueryKey(), updatedUser);
      setLanguage(selectedLang);
      setLanguageUnverified(false);
      toast({
        title: t("settings.saved"),
        description: t("settings.savedDescription"),
      });
    } catch {
      if (rejected) {
        toast({ title: t("settings.saveFailed"), variant: "destructive" });
      } else {
        // A lost/timed-out response does not prove the write failed. Never repeat PATCH
        // automatically: read the authoritative profile before changing local UI.
        try {
          const persisted = await verifyLanguage();
          toast({
            title: t(
              persisted === selectedLang
                ? "settings.languageVerified"
                : "settings.saveFailed",
            ),
            ...(persisted === selectedLang
              ? {}
              : { variant: "destructive" as const }),
          });
        } catch {
          showUnverified();
        }
      }
    } finally {
      setSavingLanguage(false);
    }
  };

  const handlePasswordChange = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (newPassword !== confirmPassword) {
      toast({
        title: t("settings.passwordMismatch"),
        variant: "destructive",
      });
      return;
    }

    changePasswordMutation.mutate(
      { data: { currentPassword, newPassword } },
      {
        onSuccess: () => {
          setCurrentPassword("");
          setNewPassword("");
          setConfirmPassword("");
          toast({
            title: t("settings.passwordUpdated"),
            description: t("settings.passwordUpdatedDescription"),
          });
        },
        onError: (error) => {
          toast({
            title: t("settings.passwordUpdateFailed"),
            description: error.data?.error || t("settings.passwordUpdateError"),
            variant: "destructive",
          });
        },
      },
    );
  };

  const dateLocale = i18n.language?.startsWith("ru") ? ruLocale : enUS;

  return (
    <ProtectedRoute>
      <AppLayout>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
          <div className="mx-auto max-w-2xl space-y-6 sm:space-y-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                <Settings className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  {t("settings.title")}
                </h1>
                <p className="text-muted-foreground text-sm mt-0.5">
                  {t("settings.subtitle")}
                </p>
              </div>
            </div>

            {/* Language */}
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-4 border-b border-border flex items-center gap-2 sm:px-6">
                <Globe className="w-4 h-4 text-muted-foreground" />
                <h2 className="font-semibold">{t("settings.language")}</h2>
              </div>
              <div className="p-4 space-y-3 sm:p-6">
                <p className="text-sm text-muted-foreground mb-4">
                  {t("settings.languageDescription")}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(["ru", "en", "auto"] as const).map((lang) => {
                    const label =
                      lang === "ru"
                        ? t("settings.languageRu")
                        : lang === "en"
                          ? t("settings.languageEn")
                          : t("settings.languageAuto");
                    const isSelected = selectedLang === lang;
                    return (
                      <button
                        key={lang}
                        type="button"
                        data-testid={`button-language-${lang}`}
                        aria-pressed={isSelected}
                        disabled={savingLanguage}
                        onClick={() => setSelectedLang(lang)}
                        className={`relative flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left ${
                          isSelected
                            ? "border-primary bg-primary/5 text-foreground"
                            : "border-border bg-background hover:border-muted-foreground/30 text-muted-foreground"
                        }`}
                      >
                        <span className="text-2xl">
                          {lang === "ru" ? "🇷🇺" : lang === "en" ? "🇬🇧" : "🌐"}
                        </span>
                        <div>
                          <div
                            className={`font-medium ${isSelected ? "text-foreground" : ""}`}
                          >
                            {label}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {lang === "ru"
                              ? "Русский"
                              : lang === "en"
                                ? "English"
                                : t("settings.languageAutoHint")}
                          </div>
                        </div>
                        {isSelected && (
                          <CheckCircle2 className="w-4 h-4 text-primary absolute top-3 right-3" />
                        )}
                      </button>
                    );
                  })}
                </div>
                {languageUnverified && (
                  <div role="alert" className="space-y-3">
                    <p className="text-sm text-destructive">
                      {t("settings.languageUnverified")}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={savingLanguage}
                      onClick={handleVerifyLanguage}
                      data-testid="button-verify-language"
                    >
                      {t("settings.verifyLanguage")}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Profile Info */}
            {user && (
              <div className="bg-card rounded-xl border border-border overflow-hidden">
                <div className="px-4 py-4 border-b border-border flex items-center gap-2 sm:px-6">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <h2 className="font-semibold">{t("settings.profile")}</h2>
                </div>
                <div className="p-4 space-y-4 sm:p-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-primary/10 border border-border flex items-center justify-center text-xl font-bold text-primary">
                      {user.name?.[0]?.toUpperCase()}
                    </div>
                    <div>
                      <div className="font-semibold text-foreground">
                        {user.name}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {user.email}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
                    <div>
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                        {t("settings.memberId")}
                      </Label>
                      <div className="font-mono text-sm mt-1">#{user.id}</div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                        {t("settings.since")}
                      </Label>
                      <div className="text-sm mt-1">
                        {format(new Date(user.createdAt), "PP", {
                          locale: dateLocale,
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-4 border-b border-border flex items-center gap-2 sm:px-6">
                <LockKeyhole className="w-4 h-4 text-muted-foreground" />
                <h2 className="font-semibold">
                  {t("settings.changePassword")}
                </h2>
              </div>
              <form
                onSubmit={handlePasswordChange}
                className="p-4 space-y-4 sm:p-6"
              >
                <p className="text-sm text-muted-foreground">
                  {t("settings.changePasswordDescription")}
                </p>
                <div className="space-y-2">
                  <Label htmlFor="current-password">
                    {t("settings.currentPassword")}
                  </Label>
                  <Input
                    id="current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                    disabled={changePasswordMutation.isPending}
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">
                      {t("settings.newPassword")}
                    </Label>
                    <Input
                      id="new-password"
                      type="password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      autoComplete="new-password"
                      minLength={8}
                      required
                      disabled={changePasswordMutation.isPending}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">
                      {t("settings.confirmPassword")}
                    </Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(event) =>
                        setConfirmPassword(event.target.value)
                      }
                      autoComplete="new-password"
                      minLength={8}
                      required
                      disabled={changePasswordMutation.isPending}
                    />
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <Button
                    type="submit"
                    disabled={changePasswordMutation.isPending}
                    className="w-full md:w-auto"
                  >
                    {changePasswordMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : null}
                    {t("settings.updatePassword")}
                  </Button>
                </div>
              </form>
            </div>

            <PriceDisplaySettings />

            <DataExchange />

            <div className="flex justify-end">
              <Button
                onClick={handleSave}
                disabled={savingLanguage}
                data-testid="button-save-language"
                className="w-full md:w-auto px-8"
              >
                {t("settings.save")}
              </Button>
            </div>
          </div>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}

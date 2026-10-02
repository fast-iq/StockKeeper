import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { useGetMe } from "@workspace/api-client-react";
import { useTranslation } from "react-i18next";
import { setLanguage } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, Globe, User, LockKeyhole, CheckCircle2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { format } from "date-fns";
import { ru as ruLocale, enUS } from "date-fns/locale";
import i18n from "@/i18n";
import { useChangePassword } from "@workspace/api-client-react";

export default function SettingsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: user } = useGetMe();

  const currentLang = (i18n.language?.startsWith("ru") ? "ru" : "en") as "en" | "ru";
  const [selectedLang, setSelectedLang] = useState<"en" | "ru">(currentLang);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const changePasswordMutation = useChangePassword();

  const handleSave = async () => {
    setLanguage(selectedLang);

    try {
      await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ language: selectedLang }),
      });
    } catch {
      // silently ignore server error — local change already applied
    }

    toast({
      title: t("settings.saved"),
      description: t("settings.savedDescription"),
    });
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
        onError: (error: any) => {
          toast({
            title: t("settings.passwordUpdateFailed"),
            description:
              error?.response?.data?.error || t("settings.passwordUpdateError"),
            variant: "destructive",
          });
        },
      },
    );
  };

  const dateLocale = selectedLang === "ru" ? ruLocale : enUS;

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
                <h1 className="text-2xl font-bold tracking-tight">{t("settings.title")}</h1>
                <p className="text-muted-foreground text-sm mt-0.5">{t("settings.subtitle")}</p>
              </div>
            </div>

            {/* Language */}
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-4 border-b border-border flex items-center gap-2 sm:px-6">
                <Globe className="w-4 h-4 text-muted-foreground" />
                <h2 className="font-semibold">{t("settings.language")}</h2>
              </div>
              <div className="p-4 space-y-3 sm:p-6">
                <p className="text-sm text-muted-foreground mb-4">{t("settings.languageDescription")}</p>
                <div className="grid grid-cols-2 gap-3">
                  {(["ru", "en"] as const).map((lang) => {
                    const label = lang === "ru" ? t("settings.languageRu") : t("settings.languageEn");
                    const isSelected = selectedLang === lang;
                    return (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => setSelectedLang(lang)}
                        className={`relative flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left ${
                          isSelected
                            ? "border-primary bg-primary/5 text-foreground"
                            : "border-border bg-background hover:border-muted-foreground/30 text-muted-foreground"
                        }`}
                      >
                        <span className="text-2xl">{lang === "ru" ? "🇷🇺" : "🇬🇧"}</span>
                        <div>
                          <div className={`font-medium ${isSelected ? "text-foreground" : ""}`}>{label}</div>
                          <div className="text-xs text-muted-foreground">{lang === "ru" ? "Русский" : "English"}</div>
                        </div>
                        {isSelected && (
                          <CheckCircle2 className="w-4 h-4 text-primary absolute top-3 right-3" />
                        )}
                      </button>
                    );
                  })}
                </div>
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
                      <div className="font-semibold text-foreground">{user.name}</div>
                      <div className="text-sm text-muted-foreground">{user.email}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border">
                    <div>
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider">{t("settings.memberId")}</Label>
                      <div className="font-mono text-sm mt-1">#{user.id}</div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider">{t("settings.since")}</Label>
                      <div className="text-sm mt-1">
                        {format(new Date(user.createdAt), "PP", { locale: dateLocale })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-4 border-b border-border flex items-center gap-2 sm:px-6">
                <LockKeyhole className="w-4 h-4 text-muted-foreground" />
                <h2 className="font-semibold">{t("settings.changePassword")}</h2>
              </div>
              <form onSubmit={handlePasswordChange} className="p-4 space-y-4 sm:p-6">
                <p className="text-sm text-muted-foreground">
                  {t("settings.changePasswordDescription")}
                </p>
                <div className="space-y-2">
                  <Label htmlFor="current-password">{t("settings.currentPassword")}</Label>
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
                    <Label htmlFor="new-password">{t("settings.newPassword")}</Label>
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
                    <Label htmlFor="confirm-password">{t("settings.confirmPassword")}</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
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

            <div className="flex justify-end">
              <Button onClick={handleSave} className="w-full md:w-auto px-8">
                {t("settings.save")}
              </Button>
            </div>

          </div>
        </div>
      </AppLayout>
    </ProtectedRoute>
  );
}

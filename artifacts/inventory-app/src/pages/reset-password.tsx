import { useState } from "react";
import { useResetPassword } from "@workspace/api-client-react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Package2,
  Loader2,
  ArrowLeft,
  CheckCircle,
  Eye,
  EyeOff,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ResetPasswordPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [done, setDone] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const resetMutation = useResetPassword();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = form.get("password") as string;
    const confirm = form.get("confirm") as string;

    if (password !== confirm) {
      toast({ title: "Пароли не совпадают", variant: "destructive" });
      return;
    }
    if (password.length < 8) {
      toast({
        title: "Пароль слишком короткий",
        description: "Минимум 8 символов",
        variant: "destructive",
      });
      return;
    }

    resetMutation.mutate(
      { data: { token, password } },
      {
        onSuccess: () => {
          setDone(true);
          setTimeout(() => setLocation("/login"), 3000);
        },
        onError: (err: any) => {
          toast({
            title: "Ошибка",
            description:
              err?.response?.data?.error ||
              "Ссылка недействительна или истекла",
            variant: "destructive",
          });
        },
      },
    );
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-border/50 bg-card/80 backdrop-blur-xl">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground text-sm">
              Ссылка недействительна. Запросите новую.
            </p>
            <Link
              href="/forgot-password"
              className="mt-4 inline-block text-sm text-primary hover:underline"
            >
              Запросить ссылку
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-blue-500 to-primary" />
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary/10 rounded-full blur-3xl opacity-50" />
      <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl opacity-50" />

      <Card className="w-full max-w-md shadow-2xl border-border/50 bg-card/80 backdrop-blur-xl relative z-10">
        <CardHeader className="space-y-4 pb-6">
          <div className="flex items-center justify-center">
            <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20">
              <Package2 className="w-8 h-8" />
            </div>
          </div>
          <div className="text-center space-y-1">
            <CardTitle className="text-2xl font-bold tracking-tight font-mono">
              STOCKKEEPER
            </CardTitle>
            <CardDescription>
              {done ? "Пароль изменён" : "Новый пароль"}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          {done ? (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle className="w-7 h-7 text-green-500" />
              </div>
              <p className="text-sm text-muted-foreground">
                Пароль успешно изменён. Перенаправление на страницу входа...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Новый пароль</Label>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    disabled={resetMutation.isPending}
                    className="bg-background/50 focus:bg-background pr-10"
                    autoComplete="new-password"
                    placeholder="Минимум 8 символов"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Подтверждение пароля</Label>
                <div className="relative">
                  <Input
                    id="confirm"
                    name="confirm"
                    type={showConfirm ? "text" : "password"}
                    required
                    disabled={resetMutation.isPending}
                    className="bg-background/50 focus:bg-background pr-10"
                    autoComplete="new-password"
                    placeholder="Повторите пароль"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowConfirm((v) => !v)}
                    tabIndex={-1}
                  >
                    {showConfirm ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
              <Button
                type="submit"
                className="w-full font-medium"
                disabled={resetMutation.isPending}
              >
                {resetMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : null}
                Сохранить новый пароль
              </Button>
            </form>
          )}
        </CardContent>

        <CardFooter className="flex justify-center border-t border-border/50 pt-6">
          <Link
            href="/login"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Вернуться ко входу
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}

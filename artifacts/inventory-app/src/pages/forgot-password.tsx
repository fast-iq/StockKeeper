import { useState } from "react";
import { useForgotPassword } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Package2, Loader2, ArrowLeft, MailCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [sentEmail, setSentEmail] = useState("");
  const { toast } = useToast();
  const forgotMutation = useForgotPassword();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const email = (new FormData(e.currentTarget).get("email") as string).trim();
    forgotMutation.mutate(
      { data: { email } },
      {
        onSuccess: () => {
          setSentEmail(email);
          setSent(true);
        },
        onError: () => {
          toast({ title: "Ошибка", description: "Не удалось отправить запрос", variant: "destructive" });
        },
      }
    );
  };

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
            <CardTitle className="text-2xl font-bold tracking-tight font-mono">STOCKKEEPER</CardTitle>
            <CardDescription>
              {sent ? "Ссылка отправлена" : "Восстановление пароля"}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          {sent ? (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center">
                <MailCheck className="w-7 h-7 text-green-500" />
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Если адрес <span className="text-foreground font-medium">{sentEmail}</span> зарегистрирован,
                на него была отправлена ссылка для сброса пароля.
              </p>
              <p className="text-xs text-muted-foreground">
                Ссылка действительна 1 час. Проверьте папку «Спам», если письмо не пришло.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Введите email вашей учётной записи — мы отправим ссылку для сброса пароля.
              </p>
              <div className="space-y-2">
                <Label htmlFor="email">Эл. почта</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="склад@example.com"
                  required
                  disabled={forgotMutation.isPending}
                  className="bg-background/50 focus:bg-background"
                  autoComplete="email"
                />
              </div>
              <Button type="submit" className="w-full font-medium" disabled={forgotMutation.isPending}>
                {forgotMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Отправить ссылку
              </Button>
            </form>
          )}
        </CardContent>

        <CardFooter className="flex justify-center border-t border-border/50 pt-6">
          <Link href="/login" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            Вернуться ко входу
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}

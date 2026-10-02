import { useEffect, useRef, useState } from "react";
import {
  useGoogleLogin,
  useLogin,
  useRegister,
  useGetMe,
  getGetMeQueryKey,
} from "@workspace/api-client-react";
import { GoogleLogin } from "@react-oauth/google";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Redirect } from "wouter";
import { useTranslation } from "react-i18next";
import { setLanguage } from "@/i18n";

export default function LoginPage() {
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { data: user, isLoading: isUserLoading } = useGetMe({
    query: { retry: false, queryKey: getGetMeQueryKey() },
  });

  const loginMutation = useLogin();
  const registerMutation = useRegister();
  const googleLoginMutation = useGoogleLogin();
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as
    | string
    | undefined;
  const loginFormRef = useRef<HTMLFormElement>(null);
  const [googleButtonWidth, setGoogleButtonWidth] = useState(400);

  useEffect(() => {
    const form = loginFormRef.current;
    if (!form) {
      return;
    }

    const updateWidth = () => {
      const formWidth = Math.floor(form.getBoundingClientRect().width);
      if (formWidth > 0) {
        setGoogleButtonWidth(Math.max(200, Math.min(400, formWidth)));
      }
    };

    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(form);

    return () => observer.disconnect();
  }, [isUserLoading]);

  if (isUserLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return <Redirect to="/dashboard" />;
  }

  const handleLogin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    loginMutation.mutate(
      { data: { email, password } },
      {
        onSuccess: (data) => {
          const lang = data.user.language;
          if (lang === "ru" || lang === "en") {
            setLanguage(lang);
          }
          toast({
            title: t("auth.welcomeBack"),
            description: t("auth.successLogin"),
          });
          setLocation("/dashboard");
        },
        onError: (err) => {
          toast({
            title: t("auth.loginFailed"),
            description: err.data?.error || t("auth.invalidCredentials"),
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleRegister = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    registerMutation.mutate(
      { data: { name, email, password } },
      {
        onSuccess: () => {
          toast({
            title: t("auth.accountCreated"),
            description: t("auth.successRegister"),
          });
          setLocation("/dashboard");
        },
        onError: (err) => {
          toast({
            title: t("auth.registerFailed"),
            description: err.data?.error || t("auth.couldNotCreate"),
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleGoogleLogin = (credential: string) => {
    googleLoginMutation.mutate(
      { data: { idToken: credential } },
      {
        onSuccess: (data) => {
          const lang = data.user.language;
          if (lang === "ru" || lang === "en") {
            setLanguage(lang);
          }
          toast({
            title: t("auth.welcomeBack"),
            description: t("auth.successGoogleLogin"),
          });
          setLocation("/dashboard");
        },
        onError: (err) => {
          toast({
            title: t("auth.googleLoginFailed"),
            description: err.data?.error || t("auth.googleLoginError"),
            variant: "destructive",
          });
        },
      },
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
            <CardTitle className="text-2xl font-bold tracking-tight font-mono">
              {t("app.name")}
            </CardTitle>
            <CardDescription>{t("app.tagline")}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as "login" | "register")}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="login">{t("auth.login")}</TabsTrigger>
              <TabsTrigger value="register">{t("auth.register")}</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <form
                ref={loginFormRef}
                onSubmit={handleLogin}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="email">{t("auth.email")}</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder={t("auth.emailPlaceholder")}
                    required
                    disabled={loginMutation.isPending}
                    className="bg-background/50 focus:bg-background"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">{t("auth.password")}</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    disabled={loginMutation.isPending}
                    className="bg-background/50 focus:bg-background"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full font-medium"
                  disabled={loginMutation.isPending}
                >
                  {loginMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
                  {t("auth.accessWorkspace")}
                </Button>
                <div className="text-center">
                  <Link
                    href="/forgot-password"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {t("auth.forgotPassword")}
                  </Link>
                </div>
                {googleClientId ? (
                  <>
                    <div className="relative my-5">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t border-border" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-card px-3 text-muted-foreground">
                          {t("auth.orContinueWith")}
                        </span>
                      </div>
                    </div>
                    <div
                      className={`w-full ${googleLoginMutation.isPending ? "pointer-events-none opacity-60" : ""}`}
                    >
                      <GoogleLogin
                        onSuccess={(response) => {
                          if (response.credential) {
                            handleGoogleLogin(response.credential);
                          }
                        }}
                        onError={() => {
                          toast({
                            title: t("auth.googleLoginFailed"),
                            description: t("auth.googleLoginError"),
                            variant: "destructive",
                          });
                        }}
                        text="continue_with"
                        shape="rectangular"
                        width={googleButtonWidth}
                      />
                    </div>
                  </>
                ) : null}
              </form>
            </TabsContent>
            <TabsContent value="register">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">{t("auth.fullName")}</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder={t("auth.namePlaceholder")}
                    required
                    disabled={registerMutation.isPending}
                    className="bg-background/50 focus:bg-background"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="register-email">{t("auth.email")}</Label>
                  <Input
                    id="register-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder={t("auth.emailPlaceholder")}
                    required
                    disabled={registerMutation.isPending}
                    className="bg-background/50 focus:bg-background"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="register-password">
                    {t("auth.password")}
                  </Label>
                  <Input
                    id="register-password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    disabled={registerMutation.isPending}
                    className="bg-background/50 focus:bg-background"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full font-medium"
                  disabled={registerMutation.isPending}
                >
                  {registerMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
                  {t("auth.createWorkspace")}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter className="flex justify-center border-t border-border/50 pt-6">
          <p className="text-xs text-muted-foreground font-mono">
            {t("app.name")} {t("app.version")}
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}

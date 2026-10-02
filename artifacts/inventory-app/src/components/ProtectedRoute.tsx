import { getGetMeQueryKey, useGetMe } from "@workspace/api-client-react";
import { Redirect } from "wouter";
import { ReactNode } from "react";
import { Loader2 } from "lucide-react";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const {
    data: user,
    isLoading,
    error,
  } = useGetMe({
    query: {
      retry: false,
      queryKey: getGetMeQueryKey(),
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground animate-pulse font-mono">
            INITIALIZING WORKSPACE...
          </p>
        </div>
      </div>
    );
  }

  if (error || !user) {
    return <Redirect to="/login" />;
  }

  return <>{children}</>;
}

import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GoogleOAuthProvider } from "@react-oauth/google";

import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import InventoryPage from "@/pages/inventory";
import CategoriesPage from "@/pages/categories";
import NewItemPage from "@/pages/item-new";
import ItemDetailPage from "@/pages/item-detail";
import SettingsPage from "@/pages/settings";
import AdminPage from "@/pages/admin";
import LocationsPage from "@/pages/locations";
import ShoppingListPage from "@/pages/shopping-list";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={LoginPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/inventory" component={InventoryPage} />
      <Route path="/categories" component={CategoriesPage} />
      <Route path="/items/new" component={NewItemPage} />
      <Route path="/items/:id" component={ItemDetailPage} />
      <Route path="/locations" component={LocationsPage} />
      <Route path="/shopping-list" component={ShoppingListPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/admin" component={AdminPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as
    | string
    | undefined;

  const content = (
    <>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </>
  );

  return (
    <QueryClientProvider client={queryClient}>
      {googleClientId ? (
        <GoogleOAuthProvider clientId={googleClientId}>
          {content}
        </GoogleOAuthProvider>
      ) : (
        content
      )}
    </QueryClientProvider>
  );
}

export default App;

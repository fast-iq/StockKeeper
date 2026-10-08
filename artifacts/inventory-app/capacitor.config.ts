import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl = process.env.APP_URL ?? "https://157-228-160-86.sslip.io";

const config: CapacitorConfig = {
  appId: "io.fastiq.stockkeeper",
  appName: "StockKeeper",
  webDir: "dist/public",
  server: {
    url: serverUrl,
    androidScheme: "https",
  },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  backgroundColor: "#1a222e",
};

export default config;

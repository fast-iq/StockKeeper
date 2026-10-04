import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT ?? "3000";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(
        import.meta.dirname,
        "..",
        "..",
        "attached_assets",
      ),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }
          if (/[\\/]node_modules[\\/]@zxing[\\/]/.test(id)) {
            return "barcode";
          }
          if (
            /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)
          ) {
            return "react";
          }
          if (/[\\/]node_modules[\\/]@radix-ui[\\/]/.test(id)) {
            return "radix";
          }
          if (
            /[\\/]node_modules[\\/](recharts|victory-vendor|d3-[a-z-]+|internmap|delaunator|robust-predicates)[\\/]/.test(
              id,
            )
          ) {
            return "charts";
          }
          if (
            /[\\/]node_modules[\\/](framer-motion|motion-dom|motion-utils)[\\/]/.test(
              id,
            )
          ) {
            return "motion";
          }
          if (/[\\/]node_modules[\\/]@?i18next[\\/]/.test(id)) {
            return "i18n";
          }
          return "vendor";
        },
      },
    },
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});

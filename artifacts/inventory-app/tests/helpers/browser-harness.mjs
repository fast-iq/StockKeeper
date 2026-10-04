import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { transferHarness } from "../../../api-server/tests/helpers/transfer-test-database.mjs";

export async function browserHarness() {
  let h;
  let vite;
  let browser;
  let directory;
  const close = async () => {
    try {
      if (browser) await browser.close();
    } finally {
      try {
        if (vite) await vite.close();
      } finally {
        try {
          if (h) await h.close();
        } finally {
          if (directory) await rm(directory, { recursive: true, force: true });
        }
      }
    }
  };
  try {
    h = await transferHarness();
    directory = await mkdtemp(join(tmpdir(), "stockkeeper-browser-"));
    vite = await createServer({
      configFile: fileURLToPath(
        new URL("../../vite.config.ts", import.meta.url),
      ),
      envDir: directory,
      cacheDir: join(directory, "vite-cache"),
      server: {
        host: "127.0.0.1",
        port: 0,
        open: false,
        proxy: { "/api": { target: h.base.replace(/\/api$/, "") } },
      },
    });
    await vite.listen();
    const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
    browser = await chromium.launch({
      headless: true,
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
        : {}),
    });
    return { h, browser, origin, close };
  } catch (error) {
    await close();
    throw error;
  }
}

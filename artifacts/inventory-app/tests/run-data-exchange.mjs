import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { testDatabaseUrl } from "../../api-server/tests/helpers/transfer-test-database.mjs";

// Validate before starting a browser, Vite, child process or SQL connection.
try {
  testDatabaseUrl(process.env.TRANSFER_TEST_DATABASE_URL, process.env.NODE_ENV);
} catch {
  console.error(
    "Use NODE_ENV=test and TRANSFER_TEST_DATABASE_URL pointing to the local stockkeeper_transfer_test database as transfer_test. No application database fallback is allowed.",
  );
  process.exit(1);
}

// Never pass application DB, OAuth, SMTP, connector secrets or .env settings.
const env = {
  NODE_ENV: "test",
  TRANSFER_TEST_DATABASE_URL: process.env.TRANSFER_TEST_DATABASE_URL,
};
for (const key of [
  "PATH",
  "HOME",
  "TMPDIR",
  "SYSTEMROOT",
  "SystemRoot",
  "TEMP",
  "TMP",
  "PLAYWRIGHT_BROWSERS_PATH",
  "PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH",
])
  if (process.env[key]) env[key] = process.env[key];

const result = spawnSync(
  process.execPath,
  [
    "--test",
    "--test-concurrency=1",
    ...(process.argv.length > 2
      ? process.argv.slice(2)
      : ["data-exchange.browser.test.mjs", "language.browser.test.mjs"]
    ).map((file) => fileURLToPath(new URL(file, import.meta.url))),
  ],
  { env, stdio: "inherit", timeout: 300_000 },
);
if (result.error)
  console.error("Browser test process failed:", result.error.code);
process.exit(result.status ?? 1);

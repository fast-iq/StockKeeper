import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { testDatabaseUrl } from "./helpers/transfer-test-database.mjs";

// Fail closed before creating a child or contacting PostgreSQL.
try {
  testDatabaseUrl(process.env.TRANSFER_TEST_DATABASE_URL, process.env.NODE_ENV);
} catch {
  console.error(
    "Use NODE_ENV=test and TRANSFER_TEST_DATABASE_URL pointing to the local stockkeeper_transfer_test database as transfer_test. No application database fallback is allowed.",
  );
  process.exit(1);
}

// An allowlist prevents inheriting production DB, SMTP, OAuth or connector secrets.
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
])
  if (process.env[key]) env[key] = process.env[key];
const result = spawnSync(
  process.execPath,
  [
    "--experimental-strip-types",
    "--test",
    "--test-concurrency=1",
    fileURLToPath(
      new URL("./data-transfer.integration.test.mjs", import.meta.url),
    ),
    fileURLToPath(
      new URL("./migrations.integration.test.mjs", import.meta.url),
    ),
  ],
  { env, stdio: "inherit", timeout: 120_000 },
);
if (result.error)
  console.error("Integration test process failed:", result.error.code);
process.exit(result.status ?? 1);

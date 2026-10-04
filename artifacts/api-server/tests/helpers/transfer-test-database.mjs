import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const dbRequire = createRequire(
  new URL("../../../../lib/db/package.json", import.meta.url),
);

// Never fall back to either application database variable.
export function testDatabaseUrl(value, environment) {
  assert.equal(environment, "test", "Integration tests require NODE_ENV=test");
  assert.ok(
    value,
    "Set TRANSFER_TEST_DATABASE_URL to a disposable local database",
  );
  const url = new URL(value);
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
  assert.ok(
    ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname),
    "Integration tests only accept loopback PostgreSQL",
  );
  assert.equal(url.pathname, "/stockkeeper_transfer_test");
  assert.equal(url.username, "transfer_test");
  assert.equal(url.search, "", "Connection options are not accepted");
  assert.equal(url.hash, "");
  return url;
}

export async function transferHarness() {
  // This check must precede imports of the runtime DB and any SQL.
  const url = testDatabaseUrl(
    process.env.TRANSFER_TEST_DATABASE_URL,
    process.env.NODE_ENV,
  );
  const schemaName = `transfer_test_${randomUUID().replaceAll("-", "")}`;
  const { Pool } = dbRequire("pg");
  const admin = new Pool({ connectionString: url.href });
  const directory = await mkdtemp(
    fileURLToPath(new URL("../../.transfer-integration-", import.meta.url)),
  );
  let runtime;
  let server;
  let schemaCreated = false;
  const close = async () => {
    try {
      if (server) {
        server.closeAllConnections();
        await new Promise((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
      if (runtime) await runtime.pool.end();
    } finally {
      try {
        // Only the randomly named schema created by this run is removed.
        if (schemaCreated)
          await admin.query(`DROP SCHEMA "${schemaName}" CASCADE`);
      } finally {
        await admin.end();
        await rm(directory, { recursive: true, force: true });
      }
    }
  };

  try {
    const identity = await admin.query(
      "SELECT current_database() AS database, current_user AS role",
    );
    assert.deepEqual(identity.rows[0], {
      database: "stockkeeper_transfer_test",
      role: "transfer_test",
    });
    await admin.query(`CREATE SCHEMA "${schemaName}"`);
    schemaCreated = true;
    await build({
      stdin: {
        contents: `
          export { default as app } from "./src/app.ts";
          export * from "@workspace/db";
          export { eq, and } from "drizzle-orm";
          export { default as bcrypt } from "bcryptjs";
        `,
        resolveDir: fileURLToPath(new URL("../../", import.meta.url)),
      },
      outfile: `${directory}/runtime.mjs`,
      platform: "node",
      bundle: true,
      format: "esm",
      external: ["pg-native", "pino", "pino-http", "exceljs", "nodemailer"],
      banner: {
        js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
      },
      logLevel: "silent",
    });
    await build({
      entryPoints: [
        fileURLToPath(
          new URL("../../../../lib/db/src/schema/index.ts", import.meta.url),
        ),
      ],
      outfile: `${directory}/schema.mjs`,
      platform: "node",
      bundle: true,
      format: "esm",
      logLevel: "silent",
    });
    const schema = await import(pathToFileURL(`${directory}/schema.mjs`));
    const { generateDrizzleJson, generateMigration } =
      dbRequire("drizzle-kit/api");
    const statements = await generateMigration(
      generateDrizzleJson({}),
      generateDrizzleJson(schema),
    );
    // Generate from the current Drizzle schema, not a hand-maintained SQL copy.
    // Explicit "public" qualifiers are redirected into our isolated schema.
    const client = await admin.connect();
    try {
      await client.query(`SET search_path TO "${schemaName}"`);
      for (const statement of statements)
        await client.query(statement.replaceAll('"public"', `"${schemaName}"`));
    } finally {
      client.release();
    }

    // Child process environment only; no project secrets are read or modified.
    url.searchParams.set("options", `-c search_path=${schemaName}`);
    process.env.DATABASE_URL = url.href;
    process.env.EXTERNAL_DB_URL = url.href;
    process.env.SESSION_SECRET = "transfer-integration-only";
    process.env.LOG_LEVEL = "silent";
    runtime = await import(pathToFileURL(`${directory}/runtime.mjs`));
    const runtimeIdentity = await runtime.pool.query(
      "SELECT current_database() AS database, current_schema() AS schema",
    );
    assert.deepEqual(runtimeIdentity.rows[0], {
      database: "stockkeeper_transfer_test",
      schema: schemaName,
    });
    server = runtime.app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const request = (cookie, path, options = {}) =>
      fetch(`${base}${path}`, {
        ...options,
        headers: { ...options.headers, ...(cookie ? { Cookie: cookie } : {}) },
      });
    const json = async (
      cookie,
      path,
      body,
      expected = 200,
      method = "POST",
    ) => {
      const response = await request(cookie, path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      assert.equal(response.status, expected, JSON.stringify(result));
      return result;
    };
    let accountNumber = 0;
    const account = async () => {
      const email = `transfer-${randomUUID()}@example.invalid`;
      const password = "integration-test-only";
      const clientIp = `192.0.2.${++accountNumber}`;
      const [user] = await runtime.db
        .insert(runtime.usersTable)
        .values({
          email,
          name: "Transfer test",
          passwordHash: await runtime.bcrypt.hash(password, 4),
        })
        .returning();
      const response = await request(null, "/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Distinct synthetic proxy clients retain the real login limiter.
          "X-Forwarded-For": clientIp,
        },
        body: JSON.stringify({ email, password }),
      });
      assert.equal(response.status, 200);
      // Headers can arrive before express-session finishes its async DB save.
      // Drain the login body before sending the next authenticated request.
      await response.json();
      const cookie = response.headers.get("set-cookie")?.split(";")[0];
      assert.ok(cookie, "Login must issue a session cookie");
      return { id: user.id, cookie, email, password, clientIp };
    };
    const snapshot = async (userId) => {
      const result = {};
      for (const [name, table] of Object.entries({
        categories: runtime.categoriesTable,
        locations: runtime.locationsTable,
        units: runtime.unitsTable,
        items: runtime.itemsTable,
        shoppingList: runtime.shoppingListTable,
      })) {
        result[name] = await runtime.db
          .select()
          .from(table)
          .where(runtime.eq(table.userId, userId))
          .orderBy(table.id);
      }
      return result;
    };
    return {
      ...runtime,
      account,
      request,
      json,
      snapshot,
      close,
      schemaName,
      base,
    };
  } catch (error) {
    await close();
    throw error;
  }
}

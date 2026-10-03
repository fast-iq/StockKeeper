import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import express from "express";
import session from "express-session";

// Exercise the actual cookie configuration without loading the database or routes.
const source = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
const cookieSource = source.match(/cookie:\s*(\{[^}]*\})/)?.[1];
assert.ok(cookieSource, "The session cookie configuration must be present");

for (const isProduction of [true, false]) {
  test(`session cookie is explicitly Lax in ${isProduction ? "production" : "development"}`, async (t) => {
    const cookie = runInNewContext(`(${cookieSource})`, { isProduction });
    assert.equal(cookie.sameSite, "lax");
    assert.equal(cookie.secure, isProduction);
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.maxAge, 7 * 24 * 60 * 60 * 1000);

    const app = express();
    app.set("trust proxy", 1);
    app.use(
      session({
        secret: "session-cookie-regression-test-only",
        resave: false,
        saveUninitialized: false,
        cookie,
      }),
    );
    app.post("/login", (req, res) => {
      req.session.userId = 1;
      res.sendStatus(204);
    });
    app.post("/protected", (req, res) => {
      res.sendStatus(req.session.userId === 1 ? 204 : 401);
    });

    const server = app.listen(0, "127.0.0.1");
    t.after(() => new Promise((resolve) => server.close(resolve)));
    await new Promise((resolve) => server.once("listening", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const headers = { "X-Forwarded-Proto": isProduction ? "https" : "http" };
    const login = await fetch(`${baseUrl}/login`, { method: "POST", headers });
    assert.equal(login.status, 204);
    const setCookie = login.headers.get("set-cookie");
    assert.ok(setCookie);
    assert.match(setCookie, /;\s*SameSite=Lax(?:;|$)/i);
    assert.match(setCookie, /;\s*HttpOnly(?:;|$)/i);
    assert.equal(/;\s*Secure(?:;|$)/i.test(setCookie), isProduction);

    // Same-origin clients can continue using their authenticated session.
    const authenticated = await fetch(`${baseUrl}/protected`, {
      method: "POST",
      headers: { ...headers, Cookie: setCookie.split(";")[0] },
    });
    assert.equal(authenticated.status, 204);
    // Cross-site POSTs omit an explicitly Lax cookie in supporting browsers.
    const unauthenticated = await fetch(`${baseUrl}/protected`, {
      method: "POST",
      headers,
    });
    assert.equal(unauthenticated.status, 401);
  });
}

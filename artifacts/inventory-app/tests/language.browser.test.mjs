/* global window, document, MutationObserver */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { expect } from "@playwright/test";
import { browserHarness } from "./helpers/browser-harness.mjs";

const copy = {};
for (const lang of ["ru", "en"]) {
  copy[lang] = JSON.parse(
    await readFile(
      new URL(`../src/i18n/locales/${lang}.json`, import.meta.url),
      "utf8",
    ),
  );
}
let harness;
before(async () => {
  harness = await browserHarness();
});
after(async () => {
  if (harness) await harness.close();
});

async function passwordLogin(context, account, preference) {
  const login = await context.request.post(`${harness.origin}/api/auth/login`, {
    headers: { "X-Forwarded-For": account.clientIp },
    data: { email: account.email, password: account.password },
  });
  assert.equal(login.status(), 200);
  const body = await login.json(); // Drain before using the saved session.
  assert.equal(body.user.id, account.id);
  assert.equal(body.user.language, preference);
}

async function openContext(locale, account, preference, mobile = false) {
  const { browser, origin } = harness;
  const context = await browser.newContext({
    locale,
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1280, height: 900 },
    isMobile: mobile,
    hasTouch: mobile,
    serviceWorkers: "block",
  });
  try {
    // No outside network or Google auth. API requests below also use this
    // fixed loopback origin; credentials are synthetic and never reused.
    await context.route("**/*", (route) =>
      new URL(route.request().url()).origin === origin
        ? route.continue()
        : route.abort(),
    );
    const errors = [];
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${origin}/login`);
    assert.equal(
      await page.evaluate(() => localStorage.getItem("sk_language")),
      null,
      "Fresh browser must not inherit a cached language",
    );
    // Real password API issues cookies into this browser's cookie jar.
    await passwordLogin(context, account, preference);
    await page.goto(`${origin}/settings`);
    return { context, page, errors, mobile };
  } catch (error) {
    await context.close();
    throw error;
  }
}

async function assertSettings(session, account, preference, locale) {
  const { page } = session;
  const language =
    preference === "auto" ? (locale === "ru-RU" ? "ru" : "en") : preference;
  const text = copy[language];
  await expect(
    page.getByRole("heading", { name: text.settings.title, exact: true }),
  ).toBeVisible();
  for (const choice of ["ru", "en", "auto"]) {
    await expect(page.getByTestId(`button-language-${choice}`)).toHaveAttribute(
      "aria-pressed",
      String(choice === preference),
    );
  }
  if (session.mobile) {
    await assertMobileNavigation(session, text);
  } else {
    await expect(
      page
        .locator("aside")
        .getByRole("link", { name: text.nav.inventory, exact: true }),
    ).toBeVisible();
  }
  await expect(page.getByTestId("button-save-language")).toHaveText(
    text.settings.save,
  );
  await assertPersistedLanguage(session, account, preference);
  return text;
}

async function assertPersistedLanguage(session, account, preference) {
  const { page, context } = session;
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("sk_language")))
    .toBe(preference);
  const me = await context.request.get(`${harness.origin}/api/auth/me`);
  assert.equal(me.status(), 200);
  const user = await me.json();
  assert.equal(user.id, account.id);
  assert.equal(user.language, preference);
  const persisted = await harness.h.pool.query(
    "SELECT language FROM users WHERE id = $1",
    [account.id],
  );
  assert.equal(persisted.rows[0].language, preference);
  assert.deepEqual(session.errors, [], "No uncaught browser errors");
}

async function assertNavigation(session, text) {
  const { page } = session;
  const sidebar = page.locator("aside");
  await sidebar
    .getByRole("link", { name: text.nav.inventory, exact: true })
    .click();
  await expect(page).toHaveURL(`${harness.origin}/inventory`);
  await expect(
    page.getByText(text.inventory.noItemsFound, { exact: true }),
  ).toBeVisible();
  await sidebar
    .getByRole("link", { name: text.nav.shopping, exact: true })
    .click();
  await expect(
    page.getByText(text.shopping.emptyList, { exact: true }),
  ).toBeVisible();
  await sidebar
    .getByRole("link", { name: text.nav.settings, exact: true })
    .click();
  await expect(page).toHaveURL(`${harness.origin}/settings`);
}

async function assertMobileNavigation(session, text) {
  const { page } = session;
  await expect(page.locator("aside")).toBeHidden();
  const bar = page.locator("nav.fixed");
  await expect(bar).toBeVisible();
  await expect(bar.getByRole("link")).toHaveCount(5);
  for (const key of [
    "overview",
    "inventory",
    "categories",
    "shopping",
    "settings",
  ]) {
    await expect(
      bar.getByRole("link", { name: text.nav[key], exact: true }),
    ).toBeVisible();
  }
  await page
    .getByRole("button", { name: text.nav.navigation, exact: true })
    .tap();
  const drawer = page.getByRole("dialog", {
    name: text.nav.navigation,
    exact: true,
  });
  await expect(drawer).toBeVisible();
  await expect(
    drawer.getByRole("heading", { name: text.nav.navigation, exact: true }),
  ).toBeVisible();
  await expect(drawer.getByRole("link")).toHaveCount(6);
  for (const key of [
    "overview",
    "inventory",
    "categories",
    "locations",
    "shopping",
    "settings",
  ]) {
    await expect(
      drawer.getByRole("link", { name: text.nav[key], exact: true }),
    ).toBeVisible();
  }
  await expect(
    drawer.getByRole("button", { name: text.nav.signOut, exact: true }),
  ).toBeVisible();
  // Exercise the translated drawer and bottom bar, not the hidden desktop
  // sidebar. Returning via the bar also remounts the actual settings form.
  await drawer
    .getByRole("link", { name: text.nav.inventory, exact: true })
    .tap();
  await expect(drawer).toBeHidden();
  await expect(page).toHaveURL(`${harness.origin}/inventory`);
  await expect(
    page.getByText(text.inventory.noItemsFound, { exact: true }),
  ).toBeVisible();
  await bar.getByRole("link", { name: text.nav.settings, exact: true }).tap();
  await expect(page).toHaveURL(`${harness.origin}/settings`);
  await expect(
    page.getByRole("heading", { name: text.settings.title, exact: true }),
  ).toBeVisible();
}

for (const locale of ["en-US", "ru-RU"]) {
  test(
    `${locale}: mobile shared browser replaces the previous account's ru/en/auto language after logout and password login`,
    { timeout: 90_000 },
    async () => {
      const { h, origin } = harness;
      const accounts = [await h.account(), await h.account()];
      const snapshots = await Promise.all(
        accounts.map((account) => h.snapshot(account.id)),
      );
      const native = locale === "ru-RU" ? "ru" : "en";
      const opposite = native === "ru" ? "en" : "ru";
      // A -> B -> A -> B -> A. Auto follows an explicit override opposite
      // to the browser locale, so retaining the previous translation fails.
      const visits = [
        { account: accounts[0], preference: native },
        { account: accounts[1], preference: opposite },
        { account: accounts[0], preference: "auto" },
        { account: accounts[1], preference: native },
        { account: accounts[0], preference: opposite },
      ];
      const preferences = new Map();
      const seed = async (account, preference) => {
        await h.json(
          account.cookie,
          "/auth/me",
          { language: preference },
          200,
          "PATCH",
        );
        preferences.set(account.id, preference);
      };
      await seed(accounts[0], native);
      await seed(accounts[1], opposite);
      const session = await openContext(locale, accounts[0], native, true);
      const { page, context } = session;
      page.setDefaultTimeout(10_000);
      let previousText;
      let previousPreference;
      try {
        for (const [index, { account, preference }] of visits.entries()) {
          if (index > 0) {
            // Real mobile Sidebar logout, including its normal navigation.
            // Never clear cookies/storage or create a new page/context here.
            await page
              .getByRole("button", {
                name: previousText.nav.navigation,
                exact: true,
              })
              .tap();
            const drawer = page.getByRole("dialog", {
              name: previousText.nav.navigation,
              exact: true,
            });
            await expect(drawer).toBeVisible();
            await expect(
              drawer.getByText(visits[index - 1].account.email, {
                exact: true,
              }),
            ).toBeVisible();
            const loggedOut = page.waitForResponse(
              (response) =>
                response.url() === `${origin}/api/auth/logout` &&
                response.request().method() === "POST",
            );
            await drawer
              .getByRole("button", {
                name: previousText.nav.signOut,
                exact: true,
              })
              .tap();
            const response = await loggedOut;
            assert.equal(response.status(), 200);
            // Logout navigates the document as soon as its JSON is consumed;
            // the old browser response body may no longer be retrievable.
            await expect(page).toHaveURL(`${origin}/login`);
            const anonymous = await context.request.get(
              `${origin}/api/auth/me`,
            );
            assert.equal(anonymous.status(), 401);
            await anonymous.body();
            assert.equal(
              await page.evaluate(() => localStorage.getItem("sk_language")),
              previousPreference,
              "Logout retains the old preference on this shared device",
            );
            await seed(account, preference);
            await passwordLogin(context, account, preference);
            // API login does not update localStorage; the new server profile
            // must supersede this deliberately retained previous preference.
            assert.equal(
              await page.evaluate(() => localStorage.getItem("sk_language")),
              previousPreference,
            );
            await page.goto(`${origin}/settings`);
          }
          const text = await assertSettings(
            session,
            account,
            preference,
            locale,
          );
          await expect(
            page.getByRole("main").getByText(account.email, { exact: true }),
          ).toBeVisible();
          await expect(
            page.getByText(
              accounts.find((other) => other.id !== account.id).email,
              { exact: true },
            ),
          ).toHaveCount(0);

          // Hold background profile GETs during the SPA remount. The settings
          // button/identity and Sidebar must use the NEW React Query profile,
          // not pass only because another network response corrected the cache.
          let release;
          const pending = new Promise((resolve) => {
            release = resolve;
          });
          const endpoint = `${origin}/api/auth/me`;
          const holdProfile = async (route) => {
            if (route.request().method() !== "GET") return route.fallback();
            await pending;
            await route.continue();
          };
          await page.route(endpoint, holdProfile);
          await page.evaluate(() => {
            window.__accountSwitchDocument = true;
          });
          try {
            await assertSettings(session, account, preference, locale);
            await expect(
              page.getByRole("main").getByText(account.email, { exact: true }),
            ).toBeVisible();
            assert.equal(
              await page.evaluate(() => window.__accountSwitchDocument),
              true,
              "Navigation remounts settings without resetting React Query",
            );
          } finally {
            release();
            // Wait for released handlers before a logout changes the document.
            // The loopback guard lives on context, so it remains installed.
            await page.unrouteAll({ behavior: "wait" });
          }
          previousText = text;
          previousPreference = preference;
        }
        for (const [index, account] of accounts.entries()) {
          const profile = await h.request(account.cookie, "/auth/me");
          assert.equal(profile.status, 200);
          const user = await profile.json();
          assert.equal(user.id, account.id);
          assert.equal(user.language, preferences.get(account.id));
          assert.deepEqual(await h.snapshot(account.id), snapshots[index]);
        }
        assert.deepEqual(session.errors, [], "No uncaught browser errors");
      } finally {
        await context.close();
      }
    },
  );
}

for (const locale of ["en-US", "ru-RU"]) {
  test(
    `${locale}: mobile 390x844 touch settings ru/en/auto persist through reload and fresh password login`,
    { timeout: 90_000 },
    async () => {
      const { h, origin } = harness;
      const account = await h.account();
      const session = await openContext(locale, account, "auto", true);
      try {
        assert.deepEqual(session.page.viewportSize(), {
          width: 390,
          height: 844,
        });
        assert.equal(
          await session.page.evaluate(() => navigator.maxTouchPoints > 0),
          true,
        );
        await assertSettings(session, account, "auto", locale);
        // Before auto, save the language opposite to this browser's locale.
        const choices =
          locale === "en-US" ? ["en", "ru", "auto"] : ["ru", "en", "auto"];
        for (const preference of choices) {
          await session.page.getByTestId(`button-language-${preference}`).tap();
          const saved = session.page.waitForResponse(
            (response) =>
              response.url() === `${origin}/api/auth/me` &&
              response.request().method() === "PATCH",
          );
          await session.page.getByTestId("button-save-language").tap();
          const response = await saved;
          assert.equal(response.status(), 200);
          assert.deepEqual(response.request().postDataJSON(), {
            language: preference,
          });
          assert.equal((await response.json()).language, preference);
          await assertSettings(session, account, preference, locale);
          await session.page.reload();
          await assertSettings(session, account, preference, locale);

          // No storageState/cookies/localStorage are copied. The real password
          // API must restore the server preference in another mobile browser.
          // Auto must follow that browser's opposite locale, not the old copy.
          const opposite = locale === "en-US" ? "ru-RU" : "en-US";
          const fresh = await openContext(opposite, account, preference, true);
          try {
            await assertSettings(fresh, account, preference, opposite);
            await fresh.page.reload();
            await assertSettings(fresh, account, preference, opposite);
          } finally {
            await fresh.context.close();
          }
        }
      } finally {
        await session.context.close();
      }
    },
  );
}

for (const locale of ["en-US", "ru-RU"]) {
  test(
    `${locale}: settings ru/en/auto persist through reload and fresh password login`,
    { timeout: 90_000 },
    async () => {
      const { h, origin } = harness;
      const account = await h.account();
      const other = await h.account();
      const otherBefore = await h.snapshot(other.id);
      const ownBefore = await h.snapshot(account.id);
      const session = await openContext(locale, account, "auto");
      try {
        await assertSettings(session, account, "auto", locale);
        // Finish with an explicit language opposite to the locale so switching
        // back to auto must remove that override, not merely retain the same copy.
        const choices =
          locale === "en-US" ? ["en", "ru", "auto"] : ["ru", "en", "auto"];
        for (const preference of choices) {
          await session.page
            .getByTestId(`button-language-${preference}`)
            .click();
          const saved = session.page.waitForResponse(
            (r) =>
              r.url() === `${origin}/api/auth/me` &&
              r.request().method() === "PATCH",
          );
          await session.page.getByTestId("button-save-language").click();
          const response = await saved;
          assert.equal(response.status(), 200);
          assert.deepEqual(response.request().postDataJSON(), {
            language: preference,
          });
          assert.equal((await response.json()).language, preference);
          const text = await assertSettings(
            session,
            account,
            preference,
            locale,
          );
          await assertNavigation(session, text);
          await assertSettings(session, account, preference, locale);
          await session.page.reload();
          await assertSettings(session, account, preference, locale);

          // A new session in a clean browser must obtain the choice from the
          // server, not localStorage; automatic follows the new browser's locale.
          const opposite = locale === "en-US" ? "ru-RU" : "en-US";
          const fresh = await openContext(opposite, account, preference);
          try {
            await assertSettings(fresh, account, preference, opposite);
            await fresh.page.reload();
            await assertSettings(fresh, account, preference, opposite);
          } finally {
            await fresh.context.close();
          }
        }
        // Logout invalidates the browser session before a genuine password login.
        const logout = await session.context.request.post(
          `${origin}/api/auth/logout`,
        );
        assert.equal(logout.status(), 200);
        await logout.body();
        const anonymous = await session.context.request.get(
          `${origin}/api/auth/me`,
        );
        assert.equal(anonymous.status(), 401);
        await anonymous.body();
        const login = await session.context.request.post(
          `${origin}/api/auth/login`,
          {
            headers: { "X-Forwarded-For": account.clientIp },
            data: { email: account.email, password: account.password },
          },
        );
        assert.equal(login.status(), 200);
        assert.equal((await login.json()).user.language, "auto");
        await session.page.reload();
        await assertSettings(session, account, "auto", locale);
        assert.deepEqual(await h.snapshot(account.id), ownBefore);
        assert.deepEqual(await h.snapshot(other.id), otherBefore);
        const untouched = await h.request(other.cookie, "/auth/me");
        assert.equal((await untouched.json()).language, "auto");
      } finally {
        await session.context.close();
      }
    },
  );
}

for (const locale of ["en-US", "ru-RU"]) {
  for (const failure of [
    "HTTP 500",
    "malformed JSON",
    "invalid language",
    "different user id",
  ]) {
    test(
      `${locale}: committed PATCH with lost response rejects ${failure} verification without polluting the profile`,
      { timeout: 90_000 },
      async () => {
        const { h, origin } = harness;
        const account = await h.account();
        const other = await h.account();
        const previous = locale === "ru-RU" ? "ru" : "en";
        const next = previous === "ru" ? "en" : "ru";
        await h.json(
          account.cookie,
          "/auth/me",
          { language: previous },
          200,
          "PATCH",
        );
        const ownBefore = await h.snapshot(account.id);
        const otherBefore = await h.snapshot(other.id);
        const originalResponse = await h.request(account.cookie, "/auth/me");
        const original = await originalResponse.json();
        const otherResponse = await h.request(other.cookie, "/auth/me");
        const otherProfile = await otherResponse.json();
        const session = await openContext(locale, account, previous);
        const { page } = session;
        const endpoint = `${origin}/api/auth/me`;
        let patches = 0;
        let checks = 0;
        let unavailable = true;
        const poison = {
          ...original,
          name: "Synthetic corrupt profile",
          email: "corrupt-profile@example.test",
          language: "fr",
        };
        const foreignProfile = {
          ...otherProfile,
          name: "Synthetic foreign profile",
          language: next,
        };
        const loseResponse = async (route) => {
          const method = route.request().method();
          if (method === "PATCH") {
            patches++;
            assert.deepEqual(route.request().postDataJSON(), {
              language: next,
            });
            // Commit and drain the real loopback API response; lose only its
            // delivery to the browser, never mock the successful write.
            const response = await route.fetch();
            assert.equal(response.status(), 200);
            const persisted = await response.json();
            assert.equal(persisted.id, account.id);
            assert.equal(persisted.language, next);
            await route.abort("connectionfailed");
          } else if (method === "GET") {
            checks++;
            if (!unavailable) return route.continue();
            await route.fulfill({
              status: failure === "HTTP 500" ? 500 : 200,
              contentType: "application/json",
              body:
                failure === "malformed JSON"
                  ? '{"id":'
                  : JSON.stringify(
                      failure === "HTTP 500"
                        ? { error: "Synthetic verification failure" }
                        : failure === "invalid language"
                          ? poison
                          : foreignProfile,
                    ),
            });
          } else {
            await route.fallback();
          }
        };
        try {
          const text = await assertSettings(session, account, previous, locale);
          const storageBefore = await page.evaluate(() => ({
            ...localStorage,
          }));
          // Detect even transient confirmations, including the other locale.
          await page.evaluate(
            (messages) => {
              window.__languageSuccessSeen = false;
              window.__languageVerificationSeen = false;
              const observer = new MutationObserver(() => {
                if (
                  messages.saved.some((s) =>
                    document.body.textContent.includes(s),
                  )
                )
                  window.__languageSuccessSeen = true;
                if (
                  messages.verified.some((s) =>
                    document.body.textContent.includes(s),
                  )
                )
                  window.__languageVerificationSeen = true;
              });
              observer.observe(document.body, {
                childList: true,
                subtree: true,
                characterData: true,
              });
              window.__languageToastObserver = observer;
            },
            {
              saved: [copy.en.settings.saved, copy.ru.settings.saved],
              verified: [
                copy.en.settings.languageVerified,
                copy.ru.settings.languageVerified,
              ],
            },
          );
          await page.route(endpoint, loseResponse);
          await page.getByTestId(`button-language-${next}`).click();
          await page.getByTestId("button-save-language").click();

          const assertUnverified = async () => {
            await expect(page.getByRole("alert")).toContainText(
              text.settings.languageUnverified,
            );
            await expect(
              page.getByTestId("button-verify-language"),
            ).toBeEnabled();
            await expect(
              page.getByTestId("button-save-language"),
            ).toBeEnabled();
            for (const choice of ["ru", "en", "auto"]) {
              await expect(
                page.getByTestId(`button-language-${choice}`),
              ).toBeEnabled();
              await expect(
                page.getByTestId(`button-language-${choice}`),
              ).toHaveAttribute("aria-pressed", String(choice === next));
            }
            await expect(
              page.getByRole("heading", {
                name: text.settings.title,
                exact: true,
              }),
            ).toBeVisible();
            await expect(
              page
                .locator("aside")
                .getByRole("link", { name: text.nav.inventory, exact: true }),
            ).toBeVisible();
            await expect(page.getByTestId("button-save-language")).toHaveText(
              text.settings.save,
            );
            // These subscribers render the React Query profile. Poisoned
            // cache data must not replace identity or change local language.
            const main = page.getByRole("main");
            for (const value of [
              original.name,
              original.email,
              `#${account.id}`,
            ])
              await expect(
                main.getByText(value, { exact: true }),
              ).toBeVisible();
            for (const value of [
              poison.name,
              poison.email,
              foreignProfile.name,
              otherProfile.email,
              `#${other.id}`,
            ])
              await expect(page.getByText(value, { exact: true })).toHaveCount(
                0,
              );
            assert.deepEqual(
              await page.evaluate(() => ({ ...localStorage })),
              storageBefore,
            );
            assert.equal(
              await page.evaluate(
                () =>
                  window.__languageSuccessSeen ||
                  window.__languageVerificationSeen,
              ),
              false,
              "Invalid verification never confirms the language",
            );
            assert.equal(patches, 1, "No automatic PATCH retry");
            assert.deepEqual(session.errors, [], "No uncaught browser errors");
          };
          await assertUnverified();
          assert.equal(checks, 1, "One automatic verification");

          const authoritative = await h.request(account.cookie, "/auth/me");
          assert.deepEqual(await authoritative.json(), {
            ...original,
            language: next,
          });
          const stored = await h.pool.query(
            "SELECT language FROM users WHERE id = $1",
            [account.id],
          );
          assert.equal(stored.rows[0].language, next);

          // The same invalid response must also preserve the warning when
          // verification is requested explicitly, without another write.
          await page.getByTestId("button-verify-language").click();
          await expect.poll(() => checks).toBe(2);
          await assertUnverified();

          unavailable = false;
          await page.getByTestId("button-verify-language").click();
          await expect(page.getByRole("alert")).toHaveCount(0);
          await assertSettings(session, account, next, locale);
          await expect(
            page.locator('li[data-state="open"]').filter({
              has: page
                .getByText(copy.en.settings.languageVerified, { exact: true })
                .or(
                  page.getByText(copy.ru.settings.languageVerified, {
                    exact: true,
                  }),
                ),
            }),
          ).toBeVisible();
          assert.equal(checks, 3, "Recovery uses one manual GET");
          assert.equal(patches, 1, "Recovery never repeats PATCH");
          assert.equal(
            await page.evaluate(() => window.__languageSuccessSeen),
            false,
          );
          assert.deepEqual(await h.snapshot(account.id), ownBefore);
          assert.deepEqual(await h.snapshot(other.id), otherBefore);
          const untouched = await h.request(other.cookie, "/auth/me");
          assert.deepEqual(await untouched.json(), otherProfile);
          await page.evaluate(() =>
            window.__languageToastObserver.disconnect(),
          );
          await page.unroute(endpoint, loseResponse);
          await page.reload();
          await assertSettings(session, account, next, locale);
        } finally {
          await session.context.close();
        }
      },
    );
  }
}

for (const locale of ["en-US", "ru-RU"]) {
  for (const recovery of ["immediate verification", "manual verification"]) {
    test(
      `${locale}: committed PATCH with lost response recovers by ${recovery}`,
      { timeout: 90_000 },
      async () => {
        const { h, origin } = harness;
        const account = await h.account();
        const previous = locale === "ru-RU" ? "ru" : "en";
        const next =
          recovery === "manual verification"
            ? "auto"
            : previous === "ru"
              ? "en"
              : "ru";
        await h.json(
          account.cookie,
          "/auth/me",
          { language: previous },
          200,
          "PATCH",
        );
        const other = await h.account();
        const otherBefore = await h.snapshot(other.id);
        const ownBefore = await h.snapshot(account.id);
        const session = await openContext(locale, account, previous);
        const { page } = session;
        const endpoint = `${origin}/api/auth/me`;
        let releasePatch;
        let releaseGet;
        let reportWrite;
        const patchGate = new Promise((resolve) => {
          releasePatch = resolve;
        });
        const getGate = new Promise((resolve) => {
          releaseGet = resolve;
        });
        const written = new Promise((resolve) => {
          reportWrite = resolve;
        });
        let patches = 0;
        let checks = 0;
        let unavailable = recovery === "manual verification";
        const loseResponse = async (route) => {
          if (route.request().method() === "PATCH") {
            patches++;
            // Send the real write to our isolated API, drain its successful
            // response, then lose only the browser-facing delivery.
            const response = await route.fetch();
            const body = await response.json();
            reportWrite({
              status: response.status(),
              body,
              data: route.request().postDataJSON(),
            });
            await patchGate;
            await route.abort("connectionfailed");
          } else if (route.request().method() === "GET") {
            checks++;
            await getGate;
            if (unavailable) await route.abort("connectionfailed");
            else await route.continue();
          } else {
            await route.fallback();
          }
        };
        try {
          const text = await assertSettings(session, account, previous, locale);
          await page.evaluate(
            (messages) => {
              window.__languageSuccessSeen = false;
              window.__languageVerificationSeen = false;
              const observer = new MutationObserver(() => {
                if (
                  messages.saved.some((s) =>
                    document.body.textContent.includes(s),
                  )
                )
                  window.__languageSuccessSeen = true;
                if (
                  messages.verified.some((s) =>
                    document.body.textContent.includes(s),
                  )
                )
                  window.__languageVerificationSeen = true;
              });
              observer.observe(document.body, {
                childList: true,
                subtree: true,
                characterData: true,
              });
              window.__languageToastObserver = observer;
            },
            {
              saved: [copy.en.settings.saved, copy.ru.settings.saved],
              verified: [
                copy.en.settings.languageVerified,
                copy.ru.settings.languageVerified,
              ],
            },
          );
          await page.route(endpoint, loseResponse);
          await page.getByTestId(`button-language-${next}`).click();
          await page.getByTestId("button-save-language").click();
          const committed = await written;
          assert.equal(committed.status, 200);
          assert.deepEqual(committed.data, { language: next });
          assert.equal(committed.body.language, next);
          assert.equal(committed.body.id, account.id);
          const stored = await h.pool.query(
            "SELECT language FROM users WHERE id = $1",
            [account.id],
          );
          assert.equal(stored.rows[0].language, next);
          const authoritative = await h.request(account.cookie, "/auth/me");
          assert.equal((await authoritative.json()).language, next);
          assert.equal(
            await page.evaluate(() => localStorage.getItem("sk_language")),
            previous,
          );
          await expect(
            page.getByRole("heading", {
              name: text.settings.title,
              exact: true,
            }),
          ).toBeVisible();
          for (const choice of ["ru", "en", "auto"])
            await expect(
              page.getByTestId(`button-language-${choice}`),
            ).toBeDisabled();
          await expect(page.getByTestId("button-save-language")).toBeDisabled();
          const checking = page.waitForRequest(
            (r) => r.url() === endpoint && r.method() === "GET",
          );
          releasePatch();
          await checking;
          // Even after the write committed, no confirmation or local update
          // is allowed until the authoritative GET reaches the browser.
          assert.equal(
            await page.evaluate(
              () =>
                window.__languageSuccessSeen ||
                window.__languageVerificationSeen,
            ),
            false,
          );
          assert.equal(
            await page.evaluate(() => localStorage.getItem("sk_language")),
            previous,
          );
          await expect(page.getByTestId("button-save-language")).toBeDisabled();
          releaseGet();
          if (unavailable) {
            await expect(page.getByRole("alert")).toContainText(
              text.settings.languageUnverified,
            );
            await expect(
              page.getByTestId("button-verify-language"),
            ).toBeEnabled();
            assert.equal(
              await page.evaluate(() => localStorage.getItem("sk_language")),
              previous,
            );
            assert.equal(
              await page.evaluate(
                () =>
                  window.__languageSuccessSeen ||
                  window.__languageVerificationSeen,
              ),
              false,
            );
            assert.equal(patches, 1);
            // Restore the connection and recheck without issuing another write.
            unavailable = false;
            await page.getByTestId("button-verify-language").click();
          }
          await expect(
            page.locator('li[data-state="open"]').filter({
              has: page
                .getByText(copy.en.settings.languageVerified, { exact: true })
                .or(
                  page.getByText(copy.ru.settings.languageVerified, {
                    exact: true,
                  }),
                ),
            }),
          ).toBeVisible();
          const recovered = await assertSettings(
            session,
            account,
            next,
            locale,
          );
          await expect(page.getByRole("alert")).toHaveCount(0);
          for (const choice of ["ru", "en", "auto"])
            await expect(
              page.getByTestId(`button-language-${choice}`),
            ).toBeEnabled();
          await expect(page.getByTestId("button-save-language")).toBeEnabled();
          assert.equal(patches, 1, "Reconciliation never repeats the write");
          assert.equal(checks, recovery === "manual verification" ? 2 : 1);
          assert.equal(
            await page.evaluate(() => window.__languageSuccessSeen),
            false,
            "No normal PATCH success toast for a lost response",
          );
          await page.evaluate(() =>
            window.__languageToastObserver.disconnect(),
          );
          await page.unroute(endpoint, loseResponse);
          await assertNavigation(session, recovered);
          await assertSettings(session, account, next, locale);
          await page.reload();
          await assertSettings(session, account, next, locale);
          assert.deepEqual(await h.snapshot(account.id), ownBefore);
          assert.deepEqual(await h.snapshot(other.id), otherBefore);
          const fresh = await openContext(
            locale === "en-US" ? "ru-RU" : "en-US",
            account,
            next,
          );
          try {
            await assertSettings(
              fresh,
              account,
              next,
              locale === "en-US" ? "ru-RU" : "en-US",
            );
          } finally {
            await fresh.context.close();
          }
        } finally {
          releasePatch();
          releaseGet();
          await session.context.close();
        }
      },
    );
  }
}

for (const locale of ["en-US", "ru-RU"]) {
  for (const outcome of ["committed", "not sent"]) {
    test(
      `${locale}: stalled PATCH (${outcome}) and repeated stalled GETs time out, unlock and reconcile without another write`,
      { timeout: 90_000 },
      async () => {
        const { h, origin } = harness;
        const account = await h.account();
        const previous = locale === "ru-RU" ? "ru" : "en";
        const next = previous === "ru" ? "en" : "ru";
        await h.json(
          account.cookie,
          "/auth/me",
          { language: previous },
          200,
          "PATCH",
        );
        const ownBefore = await h.snapshot(account.id);
        const other = await h.account();
        const otherBefore = await h.snapshot(other.id);
        const session = await openContext(locale, account, previous);
        const { page } = session;
        const endpoint = `${origin}/api/auth/me`;
        let release;
        const held = new Promise((resolve) => {
          release = resolve;
        });
        let reportPatch;
        const patchReady = new Promise((resolve) => {
          reportPatch = resolve;
        });
        let patches = 0;
        let checks = 0;
        let holdChecks = true;
        const stall = async (route) => {
          if (route.request().method() === "PATCH") {
            patches++;
            assert.deepEqual(route.request().postDataJSON(), {
              language: next,
            });
            if (outcome === "committed") {
              const response = await route.fetch();
              assert.equal(response.status(), 200);
              assert.equal((await response.json()).language, next);
            }
            reportPatch();
            // No response or explicit network failure until after the UI recovers.
            await held;
            await route.abort();
          } else if (route.request().method() === "GET") {
            checks++;
            if (holdChecks) {
              await held;
              await route.abort();
            } else {
              await route.continue();
            }
          } else {
            await route.fallback();
          }
        };
        try {
          const text = await assertSettings(session, account, previous, locale);
          // Advance only browser time: the production AbortController/deadline
          // runs unchanged; API writes still use the real isolated database.
          await page.clock.install();
          await page.clock.pauseAt(new Date());
          await page.evaluate(
            (messages) => {
              window.__languageSuccessSeen = false;
              window.__languageVerificationSeen = false;
              const observer = new MutationObserver(() => {
                if (
                  messages.saved.some((s) =>
                    document.body.textContent.includes(s),
                  )
                )
                  window.__languageSuccessSeen = true;
                if (
                  messages.verified.some((s) =>
                    document.body.textContent.includes(s),
                  )
                )
                  window.__languageVerificationSeen = true;
              });
              observer.observe(document.body, {
                childList: true,
                subtree: true,
                characterData: true,
              });
              window.__languageToastObserver = observer;
            },
            {
              saved: [copy.en.settings.saved, copy.ru.settings.saved],
              verified: [
                copy.en.settings.languageVerified,
                copy.ru.settings.languageVerified,
              ],
            },
          );
          await page.route(endpoint, stall);
          await page.getByTestId(`button-language-${next}`).click();
          const checking = page.waitForRequest(
            (r) => r.url() === endpoint && r.method() === "GET",
          );
          await page.getByTestId("button-save-language").click();
          await patchReady;
          await expect(page.getByTestId("button-save-language")).toBeDisabled();
          await page.clock.runFor(10_001);
          await checking;
          await expect(page.getByTestId("button-save-language")).toBeDisabled();
          await page.clock.runFor(10_001);
          const assertUnverified = async () => {
            await expect(page.getByRole("alert")).toContainText(
              text.settings.languageUnverified,
            );
            await expect(
              page.getByTestId("button-verify-language"),
            ).toBeEnabled();
            await expect(
              page.getByTestId("button-save-language"),
            ).toBeEnabled();
            for (const choice of ["ru", "en", "auto"])
              await expect(
                page.getByTestId(`button-language-${choice}`),
              ).toBeEnabled();
            assert.equal(
              await page.evaluate(() => localStorage.getItem("sk_language")),
              previous,
            );
            await expect(
              page.getByRole("heading", {
                name: text.settings.title,
                exact: true,
              }),
            ).toBeVisible();
            assert.equal(
              await page.evaluate(
                () =>
                  window.__languageSuccessSeen ||
                  window.__languageVerificationSeen,
              ),
              false,
            );
            assert.equal(patches, 1, "No automatic PATCH retry");
          };
          await assertUnverified();
          assert.equal(checks, 1);
          // An explicit verification that also hangs must release its own lock.
          const rechecking = page.waitForRequest(
            (r) => r.url() === endpoint && r.method() === "GET",
          );
          await page.getByTestId("button-verify-language").click();
          await rechecking;
          await expect(page.getByTestId("button-save-language")).toBeDisabled();
          await expect(
            page.getByTestId("button-verify-language"),
          ).toBeDisabled();
          await page.clock.runFor(10_001);
          await assertUnverified();
          assert.equal(checks, 2);
          // Connection restored: manual verification reads the actual server
          // outcome (including an unchanged language), never repeats the PATCH.
          holdChecks = false;
          await page.getByTestId("button-verify-language").click();
          const persisted = outcome === "committed" ? next : previous;
          await expect(page.getByRole("alert")).toHaveCount(0);
          await assertSettings(session, account, persisted, locale);
          await expect(
            page.locator('li[data-state="open"]').filter({
              has: page
                .getByText(copy.en.settings.languageVerified, { exact: true })
                .or(
                  page.getByText(copy.ru.settings.languageVerified, {
                    exact: true,
                  }),
                ),
            }),
          ).toBeVisible();
          assert.equal(patches, 1);
          assert.equal(checks, 3);
          assert.equal(
            await page.evaluate(() => window.__languageSuccessSeen),
            false,
          );
          await expect(page.getByTestId("button-save-language")).toBeEnabled();
          assert.deepEqual(await h.snapshot(account.id), ownBefore);
          assert.deepEqual(await h.snapshot(other.id), otherBefore);
          const untouched = await h.request(other.cookie, "/auth/me");
          assert.equal((await untouched.json()).language, "auto");
          await page.evaluate(() =>
            window.__languageToastObserver.disconnect(),
          );
          release();
          await page.unrouteAll({ behavior: "wait" });
          await page.clock.resume();
          await page.reload();
          await assertSettings(session, account, persisted, locale);
        } finally {
          release();
          await page.unrouteAll({ behavior: "wait" });
          await session.context.close();
        }
      },
    );
  }
}

for (const locale of ["en-US", "ru-RU"]) {
  for (const failure of ["HTTP 500", "connection abort"]) {
    test(
      `${locale}: ${failure} preserves saved language without success toast and allows explicit retry`,
      { timeout: 90_000 },
      async () => {
        const { h, origin } = harness;
        const account = await h.account();
        const previous = locale === "ru-RU" ? "ru" : "en";
        const next = previous === "ru" ? "en" : "ru";
        await h.json(
          account.cookie,
          "/auth/me",
          { language: previous },
          200,
          "PATCH",
        );
        const session = await openContext(locale, account, previous);
        const { page } = session;
        let release;
        const pending = new Promise((resolve) => {
          release = resolve;
        });
        const endpoint = `${origin}/api/auth/me`;
        let attempts = 0;
        page.on("request", (request) => {
          if (request.url() === endpoint && request.method() === "PATCH")
            attempts++;
        });
        const failPatch = async (route) => {
          if (route.request().method() !== "PATCH") return route.fallback();
          await pending;
          if (failure === "HTTP 500") {
            await route.fulfill({
              status: 500,
              contentType: "application/json",
              body: JSON.stringify({
                error: "Synthetic language save failure",
              }),
            });
          } else {
            await route.abort("connectionfailed");
          }
        };
        try {
          const text = await assertSettings(session, account, previous, locale);
          // Record even a transient success message, in either language, before
          // retry. A late DOM assertion alone could miss a replaced toast.
          await page.evaluate(
            (titles) => {
              window.__languageSuccessSeen = false;
              const observer = new MutationObserver(() => {
                if (
                  titles.some((title) =>
                    document.body.textContent.includes(title),
                  )
                )
                  window.__languageSuccessSeen = true;
              });
              observer.observe(document.body, {
                childList: true,
                subtree: true,
                characterData: true,
              });
              window.__languageToastObserver = observer;
            },
            [copy.en.settings.saved, copy.ru.settings.saved],
          );
          await page.route(endpoint, failPatch);
          await page.getByTestId(`button-language-${next}`).click();
          const requested = page.waitForRequest(
            (request) =>
              request.url() === endpoint && request.method() === "PATCH",
          );
          const settled =
            failure === "HTTP 500"
              ? page.waitForResponse(
                  (response) =>
                    response.url() === endpoint &&
                    response.request().method() === "PATCH",
                )
              : page.waitForEvent("requestfailed", {
                  predicate: (request) =>
                    request.url() === endpoint && request.method() === "PATCH",
                });
          await page.getByTestId("button-save-language").click();
          assert.deepEqual((await requested).postDataJSON(), {
            language: next,
          });
          for (const choice of ["ru", "en", "auto"])
            await expect(
              page.getByTestId(`button-language-${choice}`),
            ).toBeDisabled();
          await expect(page.getByTestId("button-save-language")).toBeDisabled();
          await assertPersistedLanguage(session, account, previous);
          release();
          const result = await settled;
          if (failure === "HTTP 500") assert.equal(result.status(), 500);
          else
            assert.equal(
              result.failure().errorText,
              "net::ERR_CONNECTION_FAILED",
            );

          await expect(
            page
              .locator('li[data-state="open"]')
              .filter({ hasText: text.settings.saveFailed }),
          ).toBeVisible();
          for (const choice of ["ru", "en", "auto"])
            await expect(
              page.getByTestId(`button-language-${choice}`),
            ).toBeEnabled();
          await expect(page.getByTestId("button-save-language")).toBeEnabled();
          await expect(
            page.getByTestId(`button-language-${next}`),
          ).toHaveAttribute("aria-pressed", "true");
          await expect(
            page.getByRole("heading", {
              name: text.settings.title,
              exact: true,
            }),
          ).toBeVisible();
          await assertPersistedLanguage(session, account, previous);
          // Remount settings without reloading: a polluted profile query cache
          // must not initialize the form with the failed, unsaved preference.
          await assertNavigation(session, text);
          await assertSettings(session, account, previous, locale);
          for (const language of ["en", "ru"])
            await expect(
              page.getByText(copy[language].settings.saved, { exact: true }),
            ).toHaveCount(0);
          assert.equal(
            await page.evaluate(() => window.__languageSuccessSeen),
            false,
          );
          assert.equal(attempts, 1, "No automatic retry after a failed save");
          await page.evaluate(() =>
            window.__languageToastObserver.disconnect(),
          );

          // Remove only our failure route, retaining the loopback network guard.
          await page.unroute(endpoint, failPatch);
          await page.getByTestId(`button-language-${next}`).click();
          const saved = page.waitForResponse(
            (response) =>
              response.url() === endpoint &&
              response.request().method() === "PATCH",
          );
          await page.getByTestId("button-save-language").click();
          const response = await saved;
          assert.equal(response.status(), 200);
          assert.deepEqual(response.request().postDataJSON(), {
            language: next,
          });
          assert.equal((await response.json()).language, next);
          // The success toast may use the saving render's translator while
          // the language change is causing React to rerender. Radix's status
          // role is the hidden announcement, not the visible toast.
          await expect(
            page.locator('li[data-state="open"]').filter({
              has: page
                .getByText(copy.en.settings.saved, { exact: true })
                .or(page.getByText(copy.ru.settings.saved, { exact: true })),
            }),
          ).toBeVisible();
          await assertSettings(session, account, next, locale);
          for (const choice of ["ru", "en", "auto"])
            await expect(
              page.getByTestId(`button-language-${choice}`),
            ).toBeEnabled();
          await expect(page.getByTestId("button-save-language")).toBeEnabled();
          assert.equal(attempts, 2, "Exactly one explicit retry");
          await page.reload();
          await assertSettings(session, account, next, locale);
        } finally {
          release();
          await session.context.close();
        }
      },
    );
  }
}

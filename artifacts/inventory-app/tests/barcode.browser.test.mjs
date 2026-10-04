/* global window, document, innerWidth */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { browserHarness } from "./helpers/browser-harness.mjs";

let harness;
before(async () => {
  harness = await browserHarness();
});
after(async () => {
  if (harness) await harness.close();
});

// A real EAN-13 frame, not a stubbed decoder result.
function ean13(value) {
  const left = [
    "0001101",
    "0011001",
    "0010011",
    "0111101",
    "0100011",
    "0110001",
    "0101111",
    "0111011",
    "0110111",
    "0001011",
  ];
  const parity = [
    "LLLLLL",
    "LLGLGG",
    "LLGGLG",
    "LLGGGL",
    "LGLLGG",
    "LGGLLG",
    "LGGGLL",
    "LGLGLG",
    "LGLGGL",
    "LGGLGL",
  ][Number(value[0])];
  const invert = (text) =>
    [...text].map((x) => (x === "0" ? "1" : "0")).join("");
  return (
    "101" +
    [...value.slice(1, 7)]
      .map((digit, n) => {
        const bits = left[Number(digit)];
        return parity[n] === "L" ? bits : invert([...bits].reverse().join(""));
      })
      .join("") +
    "01010" +
    [...value.slice(7)].map((digit) => invert(left[Number(digit)])).join("") +
    "101"
  );
}

test("mobile: actual camera frames fill/create/search; manual zeros and permission/cancellation are preserved", async () => {
  const { h, browser, origin } = harness;
  const account = await h.account();
  const context = await browser.newContext({
    locale: "ru-RU",
    viewport: { width: 390, height: 844 },
  });
  try {
    const [name, ...value] = account.cookie.split("=");
    await context.addCookies([
      {
        name,
        value: value.join("="),
        url: origin,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await context.route("**/*", (route) =>
      new URL(route.request().url()).origin === origin
        ? route.continue()
        : route.abort(),
    );
    await context.addInitScript(
      ({ bits }) => {
        const state = (window.cameraQA = {
          requests: 0,
          mode: "barcode",
          stream: null,
        });
        navigator.mediaDevices.getUserMedia = async (constraints) => {
          state.requests++;
          state.constraints = constraints;
          if (state.mode === "denied")
            throw new DOMException("QA denied", "NotAllowedError");
          if (state.mode === "pending")
            await new Promise((resolve) => {
              state.release = resolve;
            });
          const canvas = document.createElement("canvas");
          canvas.width = 640;
          canvas.height = 480;
          const draw = () => {
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, 640, 480);
            if (state.mode !== "barcode") return;
            ctx.fillStyle = "black";
            [...bits].forEach((bit, n) => {
              if (bit === "1") ctx.fillRect(130 + n * 4, 170, 4, 140);
            });
          };
          draw();
          const stream = canvas.captureStream(15);
          const timer = setInterval(draw, 60);
          for (const track of stream.getTracks()) {
            const stop = track.stop.bind(track);
            track.stop = () => {
              clearInterval(timer);
              stop();
            };
          }
          state.stream = stream;
          return stream;
        };
      },
      { bits: ean13("5901234123457") },
    );
    const page = await context.newPage();
    await page.goto(`${origin}/items/new`);
    await page.locator("#name").fill("Camera barcode QA");
    await page
      .getByRole("button", { name: "Сканировать штрихкод", exact: true })
      .click();
    await expect(page.locator("#barcode")).toHaveValue("5901234123457", {
      timeout: 20000,
    });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.cameraQA.stream
            .getTracks()
            .every((t) => t.readyState === "ended"),
        ),
      )
      .toBe(true);
    const constraints = await page.evaluate(() => window.cameraQA.constraints);
    assert.equal(constraints.audio, false);
    assert.equal(constraints.video.facingMode.ideal, "environment");
    const saved = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        new URL(r.url()).pathname === "/api/items",
    );
    await page
      .getByRole("button", { name: "Сохранить товар", exact: true })
      .click();
    const createdResponse = await saved;
    assert.equal(createdResponse.status(), 201);
    const created = await createdResponse.json();
    assert.equal(created.barcode, "5901234123457");
    await expect(page).toHaveURL(`${origin}/items/${created.id}`);
    await page.reload();
    await expect(
      page.getByText("5901234123457", { exact: true }),
    ).toBeVisible();

    await h.json(
      account.cookie,
      "/items",
      { name: "Manual zero barcode QA", quantity: 1, barcode: "0012345678905" },
      201,
    );
    await page.goto(`${origin}/inventory`);
    const search = page.getByRole("textbox", { name: /Поиск/ });
    await search.fill("0012345678905");
    await expect(
      page.getByRole("link", { name: "Manual zero barcode QA", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Camera barcode QA", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Сканировать штрихкод", exact: true })
      .click();
    await expect(search).toHaveValue("5901234123457");
    await expect(
      page.getByRole("link", { name: "Camera barcode QA", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Manual zero barcode QA", exact: true }),
    ).toHaveCount(0);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );

    await page.evaluate(() => {
      window.cameraQA.mode = "denied";
    });
    await page
      .getByRole("button", { name: "Сканировать штрихкод", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText("Нет доступа к камере");
    await page
      .getByRole("button", { name: "Закрыть и ввести вручную" })
      .click();
    await expect(search).toHaveValue("5901234123457");

    await page.evaluate(() => {
      window.cameraQA.mode = "pending";
    });
    await page
      .getByRole("button", { name: "Сканировать штрихкод", exact: true })
      .click();
    await expect
      .poll(() => page.evaluate(() => typeof window.cameraQA.release))
      .toBe("function");
    await page
      .getByRole("button", { name: "Закрыть и ввести вручную" })
      .click();
    await page.evaluate(() => {
      window.cameraQA.mode = "blank";
      window.cameraQA.release();
    });
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.cameraQA.stream
            .getTracks()
            .every((t) => t.readyState === "ended"),
        ),
      )
      .toBe(true);
    await expect(search).toHaveValue("5901234123457");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  } finally {
    await context.close();
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSearchUrl,
  validateTemplateSyntax,
  assertPublicHttpUrl,
  fetchValidated,
  extractResults,
  parsePrice,
  searchDataSource,
  SourceSearchError,
} from "../src/services/source-search.ts";

const publicLookup = async () => [{ address: "93.184.216.34" }];
const privateLookup = async () => [{ address: "10.0.0.5" }];
const mixedLookup = async () => [
  { address: "93.184.216.34" },
  { address: "192.168.1.10" },
];

const expectCode = async (fn, code) => {
  await assert.rejects(fn, (err) => {
    assert.ok(
      err instanceof SourceSearchError,
      `expected SourceSearchError, got ${err}`,
    );
    assert.equal(err.code, code);
    return true;
  });
};

test("template placeholders are substituted and URL-encoded", () => {
  assert.equal(
    buildSearchUrl("https://shop.test/search?q={sku}", "a&b 1"),
    "https://shop.test/search?q=a%26b%201",
  );
  assert.equal(
    buildSearchUrl("https://shop.test/?code={barcode}", "4600000000000"),
    "https://shop.test/?code=4600000000000",
  );
  assert.equal(
    buildSearchUrl("https://shop.test/?s={sku}&b={barcode}", "x"),
    "https://shop.test/?s=x&b=x",
  );
});

test("template without a placeholder is rejected", async () => {
  await expectCode(
    async () => buildSearchUrl("https://shop.test/search", "x"),
    "bad-template",
  );
});

test("template syntax allows only http(s) public URLs", async () => {
  validateTemplateSyntax("https://shop.test/search?q={sku}");
  validateTemplateSyntax("http://shop.test/{barcode}");
  await expectCode(
    async () => validateTemplateSyntax("ftp://shop.test/?q={sku}"),
    "blocked",
  );
  await expectCode(
    async () => validateTemplateSyntax("https://user:pass@shop.test/?q={sku}"),
    "blocked",
  );
  await expectCode(
    async () => validateTemplateSyntax("http://localhost/?q={sku}"),
    "blocked",
  );
  await expectCode(
    async () => validateTemplateSyntax("http://127.0.0.1/?q={sku}"),
    "blocked",
  );
  await expectCode(
    async () => validateTemplateSyntax("http://192.168.0.10/?q={sku}"),
    "blocked",
  );
  await expectCode(
    async () => validateTemplateSyntax("not a url {sku}"),
    "invalid-url",
  );
  await expectCode(
    async () => validateTemplateSyntax("https://shop.test/search?q=static"),
    "bad-template",
  );
});

test("URL guard blocks private and local targets", async () => {
  for (const url of [
    "http://127.0.0.1/x",
    "http://10.1.2.3/x",
    "http://169.254.169.254/latest/meta-data",
    "http://192.168.1.1/x",
    "http://172.16.0.1/x",
    "http://100.64.0.1/x",
    "http://[::1]/x",
    "http://[fd00::1]/x",
    "http://localhost/x",
    "http://db.local/x",
  ]) {
    await expectCode(
      async () => assertPublicHttpUrl(url, publicLookup),
      "blocked",
    );
  }
  await assertPublicHttpUrl("https://example.com/x", publicLookup);
  await assertPublicHttpUrl("http://93.184.216.34/x", publicLookup);
});

test("DNS answers with private or mixed addresses are blocked", async () => {
  await expectCode(
    async () => assertPublicHttpUrl("https://evil.test/x", privateLookup),
    "blocked",
  );
  await expectCode(
    async () => assertPublicHttpUrl("https://evil.test/x", mixedLookup),
    "blocked",
  );
  await expectCode(
    async () =>
      assertPublicHttpUrl("https://down.test/x", async () => {
        throw new Error("nxdomain");
      }),
    "network",
  );
  await expectCode(
    async () => assertPublicHttpUrl("https://down.test/x", async () => []),
    "network",
  );
});

test("protocols other than http(s) and credentials are rejected", async () => {
  await expectCode(
    async () => assertPublicHttpUrl("file:///etc/passwd"),
    "blocked",
  );
  await expectCode(
    async () => assertPublicHttpUrl("https://u:p@example.com/"),
    "blocked",
  );
  await expectCode(async () => assertPublicHttpUrl("not-a-url"), "invalid-url");
});

test("prices parse from numbers, localized strings and nested objects", () => {
  assert.equal(parsePrice(1299), 1299);
  assert.equal(parsePrice(0), 0);
  assert.equal(parsePrice("1 234,56"), 1234.56);
  assert.equal(parsePrice("45.90"), 45.9);
  assert.equal(parsePrice("цена: 99 руб."), 99);
  assert.equal(parsePrice({ u: 750 }), 750);
  assert.equal(parsePrice({ value: "10.5" }), 10.5);
  assert.equal(parsePrice("дорого"), null);
  assert.equal(parsePrice(null), null);
  assert.equal(parsePrice(-5), null);
});

test("extracts marketplace JSON (WB hits, generic products, offers)", () => {
  const wb = JSON.stringify({
    hits: [
      {
        name: "Дрель аккумуляторная",
        salePrice: { u: 4590 },
        url: "https://www.wildberries.ru/catalog/1/detail.aspx",
        imageURL: "https://images.wb.ru/x.jpg",
      },
    ],
  });
  const wbResults = extractResults("application/json", wb);
  assert.equal(wbResults.length, 1);
  assert.equal(wbResults[0].title, "Дрель аккумуляторная");
  assert.equal(wbResults[0].price, 4590);
  assert.equal(
    wbResults[0].url,
    "https://www.wildberries.ru/catalog/1/detail.aspx",
  );

  const ozon = JSON.stringify({
    results: [
      {
        title: "Свёрло 6 мм",
        price: "299 ₽",
        link: "https://www.ozon.ru/product/1",
        image: "https://cdn1.ozon.ru/x.png",
      },
    ],
  });
  const ozonResults = extractResults("application/json", ozon);
  assert.equal(ozonResults[0].price, 299);
  assert.equal(ozonResults[0].url, "https://www.ozon.ru/product/1");

  const offers = JSON.stringify([
    {
      name: "Кабель USB",
      offers: { price: 150, url: "https://shop.test/1" },
    },
  ]);
  const offerResults = extractResults("application/json", offers);
  assert.equal(offerResults[0].price, 150);
  assert.equal(offerResults[0].url, "https://shop.test/1");
});

test("extracts JSON-LD products and item lists from HTML", () => {
  const html = `
    <html><head>
    <script type="application/ld+json">
    {"@type":"Product","name":"Пылесос","image":"https://img.test/p.jpg",
     "offers":{"@type":"Offer","price":"12990","url":"https://shop.test/p"}}
    </script>
    <title>ignored</title>
    </head><body></body></html>`;
  const results = extractResults("text/html; charset=utf-8", html);
  assert.equal(results.length, 1);
  assert.equal(results[0].title, "Пылесос");
  assert.equal(results[0].price, 12990);
  assert.equal(results[0].url, "https://shop.test/p");
  assert.equal(results[0].imageUrl, "https://img.test/p.jpg");

  const list = `
    <script type="application/ld+json">
    {"@type":"ItemList","itemListElement":[
      {"@type":"ListItem","item":{"@type":"Product","name":"Лампа","url":"https://shop.test/l","offers":{"price":500}}}
    ]}
    </script>`;
  const listResults = extractResults("text/html", list);
  assert.equal(listResults[0].title, "Лампа");
  assert.equal(listResults[0].price, 500);
});

test("falls back to Open Graph metadata when no JSON-LD is present", () => {
  const html = `
    <head>
      <meta property="og:title" content="Шуруповёрт CDR-750" />
      <meta property="og:image" content="https://img.test/d.jpg" />
      <meta property="og:url" content="https://shop.test/d" />
      <meta property="og:price:amount" content="7 499.00" />
    </head>`;
  const results = extractResults("text/html", html);
  assert.equal(results.length, 1);
  assert.equal(results[0].title, "Шуруповёрт CDR-750");
  assert.equal(results[0].price, 7499);
  assert.equal(results[0].url, "https://shop.test/d");
  assert.equal(results[0].imageUrl, "https://img.test/d.jpg");
});

test("falls back to plain HTML table listings with prices", () => {
  const html = `
    <html><body>
    <table class="b-tbl-items">
      <tr><td align="center">Код</td><td align="center">Наименование</td>
          <td align="center">Цена***</td></tr>
      <tr class="t1">
        <td align="right">8918</td>
        <td><a href="/catalog/itempage/8918/" style="text-decoration: none;"> 6,5*18 анкер с конич. болтом</a></td>
        <td align="right">5.98</td>
        <td class="tara-">шт</td>
        <td class="tara-">0.005</td>
      </tr>
      <tr class="t1">
        <td align="right">8919</td>
        <td><a href="/catalog/itempage/8919/">Гайка М8 оцинк. DIN 934</a></td>
        <td align="right">1 234,56</td>
      </tr>
      <tr class="t1">
        <td><a href="/catalog/itempage/9999/">Товар без цены</a></td>
        <td>&nbsp;</td>
      </tr>
      <tr><td><a href="/about/">О компании</a></td><td>текст без числа</td></tr>
    </table>
    </body></html>`;
  const results = extractResults(
    "text/html; charset=utf-8",
    html,
    "https://krepika.ru/search/?query=x",
  );
  assert.equal(results.length, 2);
  assert.equal(results[0].title, "6,5*18 анкер с конич. болтом");
  assert.equal(results[0].price, 5.98);
  assert.equal(results[0].url, "https://krepika.ru/catalog/itempage/8918/");
  assert.equal(results[1].title, "Гайка М8 оцинк. DIN 934");
  assert.equal(results[1].price, 1234.56);

  const relative = extractResults("text/html", html);
  assert.equal(relative[0].url, "/catalog/itempage/8918/");
});

test("HTML table rows never override JSON-LD results", () => {
  const html = `
    <script type="application/ld+json">
    {"@type":"Product","name":"Пылесос","offers":{"price":"12990","url":"https://shop.test/p"}}
    </script>
    <table><tr><td><a href="/x/1/">Стол</a></td><td>999</td></tr></table>`;
  const results = extractResults("text/html", html, "https://shop.test/");
  assert.equal(results.length, 1);
  assert.equal(results[0].title, "Пылесос");
});

test("malformed JSON without HTML structure yields no results", () => {
  assert.deepEqual(extractResults("application/json", "{broken"), []);
  assert.deepEqual(
    extractResults("text/html", "<html><body>maintenance</body></html>"),
    [],
  );
});

test("fetchValidated follows validated redirects and reads limited bodies", async () => {
  const calls = [];
  const okFetch = async (url) => {
    calls.push(url.toString());
    if (calls.length === 1) {
      return new Response(null, {
        status: 302,
        headers: { location: "https://example.com/final" },
      });
    }
    return new Response("<html>ok</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  };
  const res = await fetchValidated(
    new URL("https://example.com/start"),
    okFetch,
    publicLookup,
  );
  assert.equal(res.finalUrl, "https://example.com/final");
  assert.match(res.body, /ok/);
  assert.deepEqual(calls, [
    "https://example.com/start",
    "https://example.com/final",
  ]);
});

test("redirect to a private address is blocked mid-flight", async () => {
  const redirectFetch = async () =>
    new Response(null, {
      status: 301,
      headers: { location: "http://169.254.169.254/latest/meta-data" },
    });
  await expectCode(
    async () =>
      fetchValidated(
        new URL("https://example.com/start"),
        redirectFetch,
        publicLookup,
      ),
    "blocked",
  );
});

test("too many redirects and error statuses map to stable codes", async () => {
  const loopFetch = async (url) =>
    new Response(null, {
      status: 302,
      headers: { location: `${url.pathname}/next` },
    });
  await expectCode(
    async () =>
      fetchValidated(new URL("https://example.com/a"), loopFetch, publicLookup),
    "redirect-loop",
  );

  const notFound = async () => new Response("nope", { status: 404 });
  await expectCode(
    async () =>
      fetchValidated(new URL("https://example.com/a"), notFound, publicLookup),
    "network",
  );

  const big = async () =>
    new Response("x", {
      status: 200,
      headers: { "content-length": String(50 * 1024 * 1024) },
    });
  await expectCode(
    async () =>
      fetchValidated(new URL("https://example.com/a"), big, publicLookup),
    "too-large",
  );

  const slow = async () => {
    const err = new Error("t");
    err.name = "TimeoutError";
    throw err;
  };
  await expectCode(
    async () =>
      fetchValidated(new URL("https://example.com/a"), slow, publicLookup),
    "timeout",
  );
});

test("searchDataSource returns results, source errors and hard blocks", async () => {
  const htmlFetch = async () =>
    new Response(
      `<script type="application/ld+json">{"@type":"Product","name":"Компрессор","offers":{"price":"30000","url":"https://shop.test/k"}}</script>`,
      { status: 200, headers: { "content-type": "text/html" } },
    );
  const ok = await searchDataSource(
    "https://shop.test/search?q={sku}",
    "AB-123",
    {
      fetchFn: htmlFetch,
      lookupFn: publicLookup,
    },
  );
  assert.equal(ok.results.length, 1);
  assert.equal(ok.results[0].price, 30000);
  assert.equal(ok.sourceError, undefined);

  const slowFetch = async () => {
    const err = new Error("t");
    err.name = "TimeoutError";
    throw err;
  };
  const timedOut = await searchDataSource(
    "https://shop.test/?q={sku}",
    "AB-123",
    {
      fetchFn: slowFetch,
      lookupFn: publicLookup,
    },
  );
  assert.deepEqual(timedOut.results, []);
  assert.equal(timedOut.sourceError, "timeout");

  await expectCode(
    async () =>
      searchDataSource("http://10.0.0.7/search?q={sku}", "AB-123", {
        fetchFn: htmlFetch,
        lookupFn: publicLookup,
      }),
    "blocked",
  );
  await expectCode(
    async () =>
      searchDataSource("https://shop.test/search", "AB-123", {
        fetchFn: htmlFetch,
        lookupFn: publicLookup,
      }),
    "bad-template",
  );
});

test("search query is encoded into the target URL", async () => {
  const seen = [];
  const spyFetch = async (url) => {
    seen.push(url.toString());
    return new Response("[]", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  await searchDataSource("https://shop.test/search?q={sku}", "a b&c", {
    fetchFn: spyFetch,
    lookupFn: publicLookup,
  });
  assert.equal(seen[0], "https://shop.test/search?q=a%20b%26c");
});

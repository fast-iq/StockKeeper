import { lookup as dnsLookup } from "node:dns/promises";

export type SourceSearchResultItem = {
  title: string;
  price: number | null;
  url: string | null;
  imageUrl: string | null;
};

export type SourceSearchOutcome = {
  results: SourceSearchResultItem[];
  sourceError?: string;
};

export type SourceSearchErrorCode =
  | "invalid-url"
  | "blocked"
  | "bad-template"
  | "timeout"
  | "network"
  | "too-large"
  | "bad-format"
  | "redirect-loop";

export class SourceSearchError extends Error {
  readonly code: SourceSearchErrorCode;

  constructor(code: SourceSearchErrorCode, message: string) {
    super(message);
    this.name = "SourceSearchError";
    this.code = code;
  }
}

export type LookupFn = (
  hostname: string,
) => Promise<Array<{ address: string }>>;

const MAX_HOPS = 3;
const TIMEOUT_MS = 8_000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_RESULTS = 10;

const USER_AGENT = "StockKeeper/1.0 (data-source search)";

const defaultLookup: LookupFn = (hostname) =>
  dnsLookup(hostname, { all: true, verbatim: true });

// ---------------------------------------------------------------- SSRF guard

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  ) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase().split("%")[0];
  if (normalized === "::1" || normalized === "::") return true;
  if (normalized.startsWith("::ffff:")) {
    return isPrivateIPv4(normalized.slice("::ffff:".length));
  }
  if (/^f[cd]/.test(normalized)) return true; // fc00::/7 unique local
  if (/^fe[89ab]/.test(normalized)) return true; // fe80::/10 link-local
  return false;
}

function isDottedQuad(bare: string): boolean {
  const parts = bare.split(".");
  return (
    parts.length === 4 &&
    parts.every(
      (part) => part.length >= 1 && part.length <= 3 && /^\d+$/.test(part),
    )
  );
}

function isIpLiteral(hostname: string): boolean {
  const bare = hostname.replace(/^\[|\]$/g, "");
  if (bare.includes(":")) return true;
  return isDottedQuad(bare);
}

function ipLiteralIsPrivate(hostname: string): boolean {
  const bare = hostname.replace(/^\[|\]$/g, "");
  if (bare.includes(":")) return isPrivateIPv6(bare);
  if (isDottedQuad(bare)) return isPrivateIPv4(bare);
  return false;
}

function hostnameLooksLocal(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  );
}

export async function assertPublicHttpUrl(
  rawUrl: string,
  lookupFn: LookupFn = defaultLookup,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SourceSearchError("invalid-url", `Invalid URL: ${rawUrl}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SourceSearchError(
      "blocked",
      `Protocol not allowed: ${url.protocol}`,
    );
  }
  if (url.username || url.password) {
    throw new SourceSearchError(
      "blocked",
      "Credentials in URL are not allowed",
    );
  }
  if (hostnameLooksLocal(url.hostname)) {
    throw new SourceSearchError("blocked", "Local hostnames are not allowed");
  }
  if (isIpLiteral(url.hostname)) {
    if (ipLiteralIsPrivate(url.hostname)) {
      throw new SourceSearchError(
        "blocked",
        "Private network addresses are not allowed",
      );
    }
    return url;
  }
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookupFn(url.hostname);
  } catch {
    throw new SourceSearchError(
      "network",
      `DNS lookup failed for ${url.hostname}`,
    );
  }
  if (addresses.length === 0) {
    throw new SourceSearchError(
      "network",
      `DNS returned no addresses for ${url.hostname}`,
    );
  }
  for (const { address } of addresses) {
    const isV6 = address.includes(":");
    if (isV6 ? isPrivateIPv6(address) : isPrivateIPv4(address)) {
      throw new SourceSearchError(
        "blocked",
        "Resolved to a private network address",
      );
    }
  }
  return url;
}

// ---------------------------------------------------------------- template

export function buildSearchUrl(template: string, query: string): string {
  if (!template.includes("{sku}") && !template.includes("{barcode}")) {
    throw new SourceSearchError(
      "bad-template",
      "Template must contain {sku} or {barcode} placeholder",
    );
  }
  const encoded = encodeURIComponent(query);
  return template.split("{sku}").join(encoded).split("{barcode}").join(encoded);
}

export function validateTemplateSyntax(template: string): URL {
  if (!template.includes("{sku}") && !template.includes("{barcode}")) {
    throw new SourceSearchError(
      "bad-template",
      "Template must contain {sku} or {barcode} placeholder",
    );
  }
  const probe = template
    .split("{sku}")
    .join("probe")
    .split("{barcode}")
    .join("probe");
  let url: URL;
  try {
    url = new URL(probe);
  } catch {
    throw new SourceSearchError("invalid-url", "Template is not a valid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SourceSearchError(
      "blocked",
      "Only http and https templates are allowed",
    );
  }
  if (url.username || url.password) {
    throw new SourceSearchError(
      "blocked",
      "Credentials in URL are not allowed",
    );
  }
  if (hostnameLooksLocal(url.hostname)) {
    throw new SourceSearchError("blocked", "Local hostnames are not allowed");
  }
  if (isIpLiteral(url.hostname) && ipLiteralIsPrivate(url.hostname)) {
    throw new SourceSearchError(
      "blocked",
      "Private network addresses are not allowed",
    );
  }
  return url;
}

// ---------------------------------------------------------------- fetching

function timeoutSignal(): AbortSignal {
  return AbortSignal.timeout(TIMEOUT_MS);
}

async function readLimitedBody(res: Response): Promise<string> {
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    throw new SourceSearchError("too-large", "Response is too large");
  }
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new SourceSearchError("too-large", "Response is too large");
    }
    out += decoder.decode(value, { stream: true });
  }
  out += decoder.decode();
  return out;
}

function isRedirect(status: number): boolean {
  return (
    status === 301 ||
    status === 302 ||
    status === 303 ||
    status === 307 ||
    status === 308
  );
}

export async function fetchValidated(
  startUrl: URL,
  fetchFn: typeof fetch = fetch,
  lookupFn: LookupFn = defaultLookup,
): Promise<{ finalUrl: string; contentType: string; body: string }> {
  let current = startUrl;
  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    let res: Response;
    try {
      res = await fetchFn(current, {
        redirect: "manual",
        signal: timeoutSignal(),
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
        },
      });
    } catch (error) {
      if (error instanceof SourceSearchError) throw error;
      const name = error instanceof Error ? error.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        throw new SourceSearchError("timeout", "Request timed out");
      }
      throw new SourceSearchError("network", "Network request failed");
    }

    if (isRedirect(res.status)) {
      const location = res.headers.get("location");
      if (!location) {
        throw new SourceSearchError(
          "network",
          "Redirect without Location header",
        );
      }
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        throw new SourceSearchError("network", "Invalid redirect target");
      }
      current = await assertPublicHttpUrl(next.toString(), lookupFn);
      continue;
    }

    if (!res.ok) {
      throw new SourceSearchError(
        "network",
        `Upstream responded with HTTP ${res.status}`,
      );
    }
    const body = await readLimitedBody(res);
    return {
      finalUrl: current.toString(),
      contentType: res.headers.get("content-type") ?? "",
      body,
    };
  }
  throw new SourceSearchError("redirect-loop", "Too many redirects");
}

async function readLimitedBytes(
  res: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new SourceSearchError("too-large", "Response is too large");
  }
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new SourceSearchError("too-large", "Response is too large");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

// Guarded image download for the photo proxy: same SSRF rules as search,
// Referer set to the image's own origin because catalogues hotlink-protect
// their product photos (krepika.ru answers 403 for any foreign Referer).
export async function fetchImage(
  rawUrl: string,
  fetchFn: typeof fetch = fetch,
  lookupFn: LookupFn = defaultLookup,
): Promise<{ contentType: string; body: Uint8Array }> {
  let current = await assertPublicHttpUrl(rawUrl, lookupFn);
  for (let hop = 0; hop < MAX_HOPS; hop += 1) {
    let res: Response;
    try {
      res = await fetchFn(current, {
        redirect: "manual",
        signal: timeoutSignal(),
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          Referer: `${current.origin}/`,
        },
      });
    } catch (error) {
      if (error instanceof SourceSearchError) throw error;
      const name = error instanceof Error ? error.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        throw new SourceSearchError("timeout", "Request timed out");
      }
      throw new SourceSearchError("network", "Network request failed");
    }

    if (isRedirect(res.status)) {
      const location = res.headers.get("location");
      if (!location) {
        throw new SourceSearchError(
          "network",
          "Redirect without Location header",
        );
      }
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        throw new SourceSearchError("network", "Invalid redirect target");
      }
      current = await assertPublicHttpUrl(next.toString(), lookupFn);
      continue;
    }

    if (!res.ok) {
      throw new SourceSearchError(
        "network",
        `Upstream responded with HTTP ${res.status}`,
      );
    }

    const contentType = (res.headers.get("content-type") ?? "").trim();
    if (!/^image\//i.test(contentType.split(";")[0]!.trim())) {
      await res.body?.cancel().catch(() => undefined);
      throw new SourceSearchError(
        "bad-format",
        "URL does not point to an image",
      );
    }

    const body = await readLimitedBytes(res, MAX_BYTES);
    return { contentType, body };
  }
  throw new SourceSearchError("redirect-loop", "Too many redirects");
}

// ---------------------------------------------------------------- parsing

export function parsePrice(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value * 100) / 100;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/\s/g, "");
    let buf = "";
    let started = false;
    let hasSep = false;
    for (const ch of cleaned) {
      if (ch >= "0" && ch <= "9") {
        buf += ch;
        started = true;
      } else if (started && (ch === "." || ch === ",") && !hasSep) {
        buf += ch;
        hasSep = true;
      } else if (started) {
        break;
      }
    }
    if (buf) {
      const parsed = Number(buf.replace(",", "."));
      if (Number.isFinite(parsed)) return Math.round(parsed * 100) / 100;
    }
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const inner = record.u ?? record.value ?? record.amount;
    if (inner !== undefined) return parsePrice(inner);
  }
  return null;
}

function pickString(
  record: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function pickPrice(
  record: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const key of keys) {
    if (key in record) {
      const parsed = parsePrice(record[key]);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

function candidateFromRecord(
  record: Record<string, unknown>,
): SourceSearchResultItem | null {
  const title = pickString(record, ["name", "title", "productName", "label"]);
  if (!title) return null;
  let price = pickPrice(record, [
    "salePrice",
    "price",
    "currentPrice",
    "finalPrice",
  ]);
  let image = pickString(record, ["imageURL", "image", "photo", "picUrl"]);
  let url = pickString(record, [
    "url",
    "productUrl",
    "pimUrl",
    "link",
    "productURL",
  ]);
  if (price === null || !image || !url) {
    const offers = record.offers;
    const offerRecord =
      offers && typeof offers === "object" && !Array.isArray(offers)
        ? (offers as Record<string, unknown>)
        : Array.isArray(offers) && offers[0] && typeof offers[0] === "object"
          ? (offers[0] as Record<string, unknown>)
          : null;
    if (offerRecord) {
      price =
        price ?? pickPrice(offerRecord, ["price", "lowPrice", "highPrice"]);
      url = url ?? pickString(offerRecord, ["url"]);
      image = image ?? pickString(offerRecord, ["image"]);
    }
  }
  return { title, price, url, imageUrl: image };
}

function jsonResults(json: unknown): SourceSearchResultItem[] {
  const results: SourceSearchResultItem[] = [];

  const pushCandidate = (candidate: unknown): void => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
      return;
    const item = candidateFromRecord(candidate as Record<string, unknown>);
    if (item) results.push(item);
  };

  const visit = (node: unknown, depth: number): void => {
    if (depth > 6 || results.length >= MAX_RESULTS * 3) return;
    if (Array.isArray(node)) {
      for (const entry of node) visit(entry, depth + 1);
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    pushCandidate(record);
    for (const key of Object.keys(record)) visit(record[key], depth + 1);
  };

  if (json && typeof json === "object") {
    const record = json as Record<string, unknown>;
    for (const key of ["hits", "products", "items", "results", "data"]) {
      const bucket = record[key];
      if (Array.isArray(bucket)) {
        for (const entry of bucket) pushCandidate(entry);
        if (results.length > 0) break;
      }
    }
  }
  if (results.length === 0) visit(json, 0);

  return dedupe(results);
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function collectJsonLd(
  node: unknown,
  results: SourceSearchResultItem[],
  depth: number,
): void {
  if (depth > 10 || results.length >= MAX_RESULTS * 3) return;
  if (Array.isArray(node)) {
    for (const entry of node) collectJsonLd(entry, results, depth + 1);
    return;
  }
  if (!node || typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  const rawType = record["@type"];
  const typeText = Array.isArray(rawType)
    ? rawType.join(" ")
    : typeof rawType === "string"
      ? rawType
      : "";
  const isTargetType = /Product|Offer|SearchResult|ListItem/i.test(typeText);
  if (isTargetType) {
    const item = candidateFromRecord(record);
    if (item) results.push(item);
  }
  for (const key of Object.keys(record))
    collectJsonLd(record[key], results, depth + 1);
}

function jsonLdResults(html: string): SourceSearchResultItem[] {
  const results: SourceSearchResultItem[] = [];
  const pattern =
    /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    try {
      collectJsonLd(JSON.parse(match[1]), results, 0);
    } catch {
      // ignore malformed JSON-LD blocks
    }
    if (results.length >= MAX_RESULTS) break;
  }
  return results;
}

function metaContent(html: string, names: string[]): string | null {
  const metaPattern = /<meta\s[^>]*>/gi;
  let tag: RegExpExecArray | null;
  while ((tag = metaPattern.exec(html)) !== null) {
    const attrs = tag[0];
    const nameMatch = /(?:property|name)="([^"]+)"/i.exec(attrs);
    if (!nameMatch) continue;
    if (!names.includes(nameMatch[1].toLowerCase())) continue;
    const contentMatch = /content="([^"]*)"/i.exec(attrs);
    if (contentMatch && contentMatch[1].trim()) {
      return decodeEntities(contentMatch[1]).trim();
    }
  }
  return null;
}

function metaResults(html: string): SourceSearchResultItem[] {
  const title = metaContent(html, ["og:title", "twitter:title"]);
  if (!title) return [];
  const price =
    parsePrice(
      metaContent(html, ["og:price:amount", "product:price:amount", "price"]),
    ) ?? null;
  return [
    {
      title,
      price,
      url: metaContent(html, ["og:url"]),
      imageUrl: metaContent(html, ["og:image", "twitter:image"]),
    },
  ];
}

function stripTags(value: string): string {
  return decodeEntities(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function resolveHref(href: string, baseUrl?: string): string {
  if (!baseUrl) return href;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}

const ASSET_HREF = /\.(?:jpe?g|png|gif|svg|webp|css|js|ico|woff2?)$/i;

function httpImage(value: string, baseUrl?: string): string | null {
  const resolved = resolveHref(value, baseUrl);
  if (!/^https?:\/\//i.test(resolved)) return null;
  let pathname: string;
  try {
    pathname = new URL(resolved).pathname;
  } catch {
    return null;
  }
  // Placeholders and icons (gif/svg) are skipped on purpose: a wrong photo is
  // worse than none, and catalogues that ship real photos use raster formats.
  return /\.(?:jpe?g|png|webp|avif)$/i.test(pathname) ? resolved : null;
}

// Product photo from a plain-HTML listing row: catalogues either keep the real
// photo URL in an anchor's rel (hover zoom, e.g. krepika itemFoto) or put an
// <img> into a cell whose class mentions photo/foto/image/thumb.
function rowImage(rowHtml: string, baseUrl?: string): string | null {
  const relPattern = /<a\s[^>]*rel="([^"]*)"[^>]*>/gi;
  let rel: RegExpExecArray | null;
  while ((rel = relPattern.exec(rowHtml)) !== null) {
    const found = httpImage(decodeEntities(rel[1]).trim(), baseUrl);
    if (found) return found;
  }
  const cellPattern =
    /<td[^>]*class="[^"]*(?:photo|foto|image|thumb)[^"]*"[^>]*>([\s\S]*?)<\/td>/gi;
  let cell: RegExpExecArray | null;
  while ((cell = cellPattern.exec(rowHtml)) !== null) {
    const img = /<img[^>]+src="([^"]+)"/i.exec(cell[1]);
    if (!img) continue;
    const found = httpImage(decodeEntities(img[1]).trim(), baseUrl);
    if (found) return found;
  }
  return null;
}

function isStandaloneNumber(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  let digits = 0;
  let separators = 0;
  for (const ch of text) {
    if (ch >= "0" && ch <= "9") {
      digits += 1;
      continue;
    }
    if ((ch === "." || ch === ",") && separators === 0) {
      separators += 1;
      continue;
    }
    if (ch === " " && digits > 0) continue;
    return false;
  }
  return digits > 0;
}

// Fallback for plain-HTML catalogue listings (no JSON-LD/og): finds table rows
// that contain both a product link and a standalone numeric price cell after it.
function htmlRowResults(
  html: string,
  baseUrl?: string,
): SourceSearchResultItem[] {
  const results: SourceSearchResultItem[] = [];
  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let row: RegExpExecArray | null;
  while ((row = rowPattern.exec(html)) !== null) {
    if (results.length >= MAX_RESULTS * 3) break;
    const cells: string[] = [];
    const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cell: RegExpExecArray | null;
    while ((cell = cellPattern.exec(row[1])) !== null) cells.push(cell[1]);
    if (cells.length < 2) continue;

    let anchorIndex = -1;
    let title = "";
    let href = "";
    for (let i = 0; i < cells.length; i += 1) {
      const anchor = /<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(
        cells[i],
      );
      if (!anchor) continue;
      const text = stripTags(anchor[2]);
      if (text.length < 4 || text.length > 300) continue;
      anchorIndex = i;
      title = text;
      href = anchor[1].trim();
      break;
    }
    if (anchorIndex < 0) continue;
    if (/^(?:#|javascript:|mailto:|data:)/i.test(href)) continue;
    if (ASSET_HREF.test(href)) continue;

    let price: number | null = null;
    for (let i = anchorIndex + 1; i < cells.length; i += 1) {
      const text = stripTags(cells[i]);
      if (!isStandaloneNumber(text)) continue;
      const parsed = parsePrice(text);
      if (parsed !== null) {
        price = parsed;
        break;
      }
    }
    if (price === null) continue;
    results.push({
      title,
      price,
      url: resolveHref(href, baseUrl),
      imageUrl: rowImage(row[1], baseUrl),
    });
  }
  return results;
}

function dedupe(results: SourceSearchResultItem[]): SourceSearchResultItem[] {
  const seen = new Set<string>();
  const out: SourceSearchResultItem[] = [];
  for (const item of results) {
    const key = item.url ?? item.title;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= MAX_RESULTS) break;
  }
  return out;
}

export function extractResults(
  contentType: string,
  body: string,
  baseUrl?: string,
): SourceSearchResultItem[] {
  const trimmed = body.trim();
  const looksJson =
    contentType.includes("json") ||
    trimmed.startsWith("{") ||
    trimmed.startsWith("[");
  if (looksJson) {
    try {
      return dedupe(jsonResults(JSON.parse(trimmed)));
    } catch {
      // fall through to HTML parsing (some sites label HTML as json)
    }
  }
  const results = jsonLdResults(body);
  if (results.length > 0) return dedupe(results);
  const rows = htmlRowResults(body, baseUrl);
  if (rows.length > 0) return dedupe(rows);
  return dedupe(metaResults(body));
}

// ---------------------------------------------------------------- orchestration

export async function searchDataSource(
  template: string,
  query: string,
  options?: { fetchFn?: typeof fetch; lookupFn?: LookupFn },
): Promise<SourceSearchOutcome> {
  const fetchFn = options?.fetchFn ?? fetch;
  const lookupFn = options?.lookupFn ?? defaultLookup;

  let startUrl: URL;
  try {
    startUrl = await assertPublicHttpUrl(
      buildSearchUrl(template, query),
      lookupFn,
    );
  } catch (error) {
    if (error instanceof SourceSearchError) {
      if (
        error.code === "blocked" ||
        error.code === "invalid-url" ||
        error.code === "bad-template"
      ) {
        throw error;
      }
      return { results: [], sourceError: error.code };
    }
    throw error;
  }

  try {
    const response = await fetchValidated(startUrl, fetchFn, lookupFn);
    return {
      results: extractResults(
        response.contentType,
        response.body,
        startUrl.toString(),
      ),
    };
  } catch (error) {
    if (error instanceof SourceSearchError) {
      if (
        error.code === "blocked" ||
        error.code === "invalid-url" ||
        error.code === "bad-template"
      ) {
        throw error;
      }
      return { results: [], sourceError: error.code };
    }
    return { results: [], sourceError: "network" };
  }
}

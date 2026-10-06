import { Router, type IRouter } from "express";
import { db, dataSourcesTable } from "@workspace/db";
import { and, asc, eq } from "drizzle-orm";
import {
  CreateDataSourceBody,
  SearchDataSourcesBody,
  DeleteDataSourceParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { rateLimit } from "../middlewares/rate-limit";
import {
  searchDataSource,
  validateTemplateSyntax,
  SourceSearchError,
} from "../services/source-search";

const router: IRouter = Router();

const BUILTIN_SOURCES: ReadonlyArray<{ name: string; urlTemplate: string }> = [
  {
    name: "Wildberries",
    urlTemplate:
      "https://www.wildberries.ru/catalog/0/search.aspx?search={sku}",
  },
  { name: "Ozon", urlTemplate: "https://www.ozon.ru/search/?text={sku}" },
  { name: "Авито", urlTemplate: "https://www.avito.ru/all?q={sku}" },
  {
    name: "Мегамаркет",
    urlTemplate: "https://megamarket.ru/search/?query={sku}",
  },
  {
    name: "Яндекс.Маркет",
    urlTemplate: "https://market.yandex.ru/search?text={sku}",
  },
  {
    name: "Крепика (krepika.ru)",
    urlTemplate: "https://krepika.ru/search/?query={sku}",
  },
];

function isUniqueViolation(error: unknown): boolean {
  const err = error as { code?: string; cause?: { code?: string } } | null;
  return err?.code === "23505" || err?.cause?.code === "23505";
}

function serialize(row: { createdAt: Date }) {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

async function listSources(userId: number) {
  return db
    .select()
    .from(dataSourcesTable)
    .where(eq(dataSourcesTable.userId, userId))
    .orderBy(asc(dataSourcesTable.id));
}

router.get("/data-sources", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  let rows = await listSources(userId);
  if (rows.length === 0) {
    await db
      .insert(dataSourcesTable)
      .values(BUILTIN_SOURCES.map((source) => ({ ...source, userId })))
      .onConflictDoNothing({
        target: [dataSourcesTable.userId, dataSourcesTable.name],
      });
    rows = await listSources(userId);
  }
  res.json(rows.map(serialize));
});

router.post("/data-sources", requireAuth, async (req, res) => {
  const parsed = CreateDataSourceBody.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Name (1-60) and URL template (10-500) are required" });
    return;
  }
  try {
    validateTemplateSyntax(parsed.data.urlTemplate);
  } catch (error) {
    if (error instanceof SourceSearchError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }
  const userId = req.session.userId!;
  try {
    const [row] = await db
      .insert(dataSourcesTable)
      .values({
        userId,
        name: parsed.data.name,
        urlTemplate: parsed.data.urlTemplate,
      })
      .returning();
    res.status(201).json(serialize(row!));
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "A source with this name already exists" });
      return;
    }
    throw error;
  }
});

router.post(
  "/data-sources/search",
  requireAuth,
  rateLimit({
    name: "source-search",
    windowMs: 60_000,
    max: 30,
    key: (req) => String(req.session.userId ?? req.ip ?? "unknown"),
  }),
  async (req, res) => {
    const parsed = SearchDataSourcesBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "sourceId and query (1-100) are required" });
      return;
    }
    const userId = req.session.userId!;
    const [source] = await db
      .select()
      .from(dataSourcesTable)
      .where(
        and(
          eq(dataSourcesTable.id, parsed.data.sourceId),
          eq(dataSourcesTable.userId, userId),
        ),
      );
    if (!source) {
      res.status(404).json({ error: "Source not found" });
      return;
    }
    try {
      const outcome = await searchDataSource(
        source.urlTemplate,
        parsed.data.query,
      );
      res.json(outcome);
    } catch (error) {
      if (error instanceof SourceSearchError) {
        res.status(400).json({ error: error.message });
        return;
      }
      throw error;
    }
  },
);

router.delete("/data-sources/:id", requireAuth, async (req, res) => {
  const parsed = DeleteDataSourceParams.safeParse(req.params);
  if (
    !parsed.success ||
    !Number.isInteger(parsed.data.id) ||
    parsed.data.id < 1 ||
    parsed.data.id > 2147483647
  ) {
    res.status(400).json({ error: "Invalid source ID" });
    return;
  }
  const [row] = await db
    .delete(dataSourcesTable)
    .where(
      and(
        eq(dataSourcesTable.id, parsed.data.id),
        eq(dataSourcesTable.userId, req.session.userId!),
      ),
    )
    .returning({ id: dataSourcesTable.id });
  if (!row) {
    res.status(404).json({ error: "Source not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;

import { Router, type IRouter } from "express";
import { db, itemsTable, categoriesTable } from "@workspace/db";
import { eq, count, sum, sql, desc } from "drizzle-orm";
import { GetRecentItemsQueryParams } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/dashboard/stats", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  const [itemStats] = await db
    .select({
      totalItems: count(itemsTable.id),
      totalQuantity: sum(itemsTable.quantity),
    })
    .from(itemsTable)
    .where(eq(itemsTable.userId, userId));

  const [catStats] = await db
    .select({ totalCategories: count(categoriesTable.id) })
    .from(categoriesTable)
    .where(eq(categoriesTable.userId, userId));

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [recentStats] = await db
    .select({ recentlyAdded: count(itemsTable.id) })
    .from(itemsTable)
    .where(
      sql`${itemsTable.userId} = ${userId} AND ${itemsTable.createdAt} >= ${sevenDaysAgo.toISOString()}`,
    );

  const [lowStockStats] = await db
    .select({ lowStockItems: count(itemsTable.id) })
    .from(itemsTable)
    .where(
      sql`${itemsTable.userId} = ${userId} AND ${itemsTable.quantity} <= 2`,
    );

  res.json({
    totalItems: Number(itemStats?.totalItems ?? 0),
    totalCategories: Number(catStats?.totalCategories ?? 0),
    totalQuantity: Number(itemStats?.totalQuantity ?? 0),
    lowStockItems: Number(lowStockStats?.lowStockItems ?? 0),
    recentlyAdded: Number(recentStats?.recentlyAdded ?? 0),
  });
});

router.get("/dashboard/recent", requireAuth, async (req, res): Promise<void> => {
  const queryParsed = GetRecentItemsQueryParams.safeParse(req.query);
  const limit = queryParsed.success && queryParsed.data.limit ? queryParsed.data.limit : 10;

  const userId = req.session.userId!;

  const rows = await db
    .select({
      id: itemsTable.id,
      name: itemsTable.name,
      description: itemsTable.description,
      quantity: itemsTable.quantity,
      unit: itemsTable.unit,
      location: itemsTable.location,
      sku: itemsTable.sku,
      barcode: itemsTable.barcode,
      tags: itemsTable.tags,
      notes: itemsTable.notes,
      categoryId: itemsTable.categoryId,
      userId: itemsTable.userId,
      createdAt: itemsTable.createdAt,
      updatedAt: itemsTable.updatedAt,
      categoryName: categoriesTable.name,
    })
    .from(itemsTable)
    .leftJoin(categoriesTable, eq(itemsTable.categoryId, categoriesTable.id))
    .where(eq(itemsTable.userId, userId))
    .orderBy(desc(itemsTable.createdAt))
    .limit(limit);

  res.json(
    rows.map((r) => ({
      ...r,
      categoryName: r.categoryName ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  );
});

router.get("/dashboard/category-counts", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  const rows = await db
    .select({
      categoryId: categoriesTable.id,
      categoryName: categoriesTable.name,
      color: categoriesTable.color,
      itemCount: count(itemsTable.id),
    })
    .from(categoriesTable)
    .leftJoin(itemsTable, eq(itemsTable.categoryId, categoriesTable.id))
    .where(eq(categoriesTable.userId, userId))
    .groupBy(categoriesTable.id, categoriesTable.name, categoriesTable.color)
    .orderBy(desc(count(itemsTable.id)));

  res.json(
    rows.map((r) => ({
      categoryId: r.categoryId,
      categoryName: r.categoryName,
      color: r.color,
      itemCount: Number(r.itemCount),
    })),
  );
});

export default router;

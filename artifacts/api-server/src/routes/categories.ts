import { Router, type IRouter } from "express";
import { db, categoriesTable, itemsTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import {
  CreateCategoryBody,
  UpdateCategoryBody,
  GetCategoryParams,
  UpdateCategoryParams,
  DeleteCategoryParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

type CategoryRow = {
  id: number;
  name: string;
  description: string | null;
  parentId: number | null;
  userId: number;
  color: string | null;
  icon: string | null;
  createdAt: Date;
};

type CategoryNode = CategoryRow & {
  children: CategoryNode[];
  itemCount: number;
};

function buildTree(cats: CategoryRow[], itemCounts: Map<number, number>): CategoryNode[] {
  const map = new Map<number, CategoryNode>();
  const roots: CategoryNode[] = [];

  for (const cat of cats) {
    map.set(cat.id, { ...cat, children: [], itemCount: itemCounts.get(cat.id) ?? 0 });
  }

  for (const cat of cats) {
    const node = map.get(cat.id)!;
    if (cat.parentId && map.has(cat.parentId)) {
      map.get(cat.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function serializeNode(node: CategoryNode): object {
  return {
    ...node,
    createdAt: node.createdAt.toISOString(),
    children: node.children.map(serializeNode),
  };
}

router.get("/categories", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  const cats = await db
    .select()
    .from(categoriesTable)
    .where(eq(categoriesTable.userId, userId))
    .orderBy(categoriesTable.name);

  const counts = await db
    .select({ categoryId: itemsTable.categoryId, count: count() })
    .from(itemsTable)
    .where(eq(itemsTable.userId, userId))
    .groupBy(itemsTable.categoryId);

  const countMap = new Map<number, number>();
  for (const row of counts) {
    if (row.categoryId != null) {
      countMap.set(row.categoryId, Number(row.count));
    }
  }

  const tree = buildTree(cats, countMap);
  res.json(tree.map(serializeNode));
});

router.post("/categories", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = req.session.userId!;
  const [cat] = await db
    .insert(categoriesTable)
    .values({ ...parsed.data, userId })
    .returning();

  res.status(201).json({ ...cat, createdAt: cat.createdAt.toISOString() });
});

router.get("/categories/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetCategoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const userId = req.session.userId!;
  const [cat] = await db
    .select()
    .from(categoriesTable)
    .where(and(eq(categoriesTable.id, params.data.id), eq(categoriesTable.userId, userId)));

  if (!cat) {
    res.status(404).json({ error: "Category not found" });
    return;
  }

  res.json({ ...cat, createdAt: cat.createdAt.toISOString() });
});

router.patch("/categories/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateCategoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = req.session.userId!;
  const [cat] = await db
    .update(categoriesTable)
    .set(parsed.data)
    .where(and(eq(categoriesTable.id, params.data.id), eq(categoriesTable.userId, userId)))
    .returning();

  if (!cat) {
    res.status(404).json({ error: "Category not found" });
    return;
  }

  res.json({ ...cat, createdAt: cat.createdAt.toISOString() });
});

router.delete("/categories/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteCategoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const userId = req.session.userId!;
  const [cat] = await db
    .delete(categoriesTable)
    .where(and(eq(categoriesTable.id, params.data.id), eq(categoriesTable.userId, userId)))
    .returning();

  if (!cat) {
    res.status(404).json({ error: "Category not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;

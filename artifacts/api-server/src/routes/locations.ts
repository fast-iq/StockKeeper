import { Router, type IRouter } from "express";
import { db, locationsTable, itemsTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/locations", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  const rows = await db
    .select({
      id: locationsTable.id,
      name: locationsTable.name,
      description: locationsTable.description,
      icon: locationsTable.icon,
      userId: locationsTable.userId,
      createdAt: locationsTable.createdAt,
      itemCount: count(itemsTable.id),
    })
    .from(locationsTable)
    .leftJoin(itemsTable, eq(itemsTable.locationId, locationsTable.id))
    .where(eq(locationsTable.userId, userId))
    .groupBy(locationsTable.id)
    .orderBy(locationsTable.name);

  res.json(rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    itemCount: Number(r.itemCount),
  })));
});

router.post("/locations", requireAuth, async (req, res): Promise<void> => {
  const { name, description, icon } = req.body || {};
  if (!name?.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const [loc] = await db
    .insert(locationsTable)
    .values({
      name: name.trim(),
      description: description?.trim() || null,
      icon: icon?.trim() || "warehouse",
      userId: req.session.userId!,
    })
    .returning();

  res.status(201).json({ ...loc, createdAt: loc.createdAt.toISOString(), itemCount: 0 });
});

router.patch("/locations/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { name, description, icon } = req.body || {};
  if (!name?.trim()) { res.status(400).json({ error: "name is required" }); return; }

  const [loc] = await db
    .update(locationsTable)
    .set({ name: name.trim(), description: description?.trim() || null, icon: icon?.trim() || "warehouse" })
    .where(eq(locationsTable.id, id))
    .returning();

  if (!loc || loc.userId !== req.session.userId!) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json({ ...loc, createdAt: loc.createdAt.toISOString() });
});

router.delete("/locations/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [loc] = await db
    .delete(locationsTable)
    .where(eq(locationsTable.id, id))
    .returning();

  if (!loc || loc.userId !== req.session.userId!) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;

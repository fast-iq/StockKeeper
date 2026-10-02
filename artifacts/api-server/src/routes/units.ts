import { Router, type IRouter } from "express";
import { db, unitsTable } from "@workspace/db";
import { eq, and, isNull, or } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/units", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  const units = await db
    .select()
    .from(unitsTable)
    .where(or(isNull(unitsTable.userId), eq(unitsTable.userId, userId)))
    .orderBy(unitsTable.id);

  res.json(
    units.map((u) => ({
      id: u.id,
      name: u.name,
      symbol: u.symbol,
      isCustom: u.userId !== null,
    })),
  );
});

router.post("/units", requireAuth, async (req, res): Promise<void> => {
  const { name, symbol } = req.body || {};
  if (!name?.trim() || !symbol?.trim()) {
    res.status(400).json({ error: "name and symbol are required" });
    return;
  }

  const [unit] = await db
    .insert(unitsTable)
    .values({
      name: name.trim(),
      symbol: symbol.trim(),
      userId: req.session.userId!,
    })
    .returning();

  res.status(201).json({
    id: unit.id,
    name: unit.name,
    symbol: unit.symbol,
    isCustom: true,
  });
});

router.delete("/units/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [unit] = await db
    .delete(unitsTable)
    .where(
      and(eq(unitsTable.id, id), eq(unitsTable.userId, req.session.userId!)),
    )
    .returning();

  if (!unit) {
    res.status(404).json({ error: "Unit not found or not yours" });
    return;
  }

  res.sendStatus(204);
});

export default router;

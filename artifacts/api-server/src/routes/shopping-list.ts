import { Router, type IRouter } from "express";
import { db, shoppingListTable, itemsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import {
  AddToShoppingListBody,
  UpdateShoppingListItemBody,
  UpdateShoppingListItemParams,
  DeleteShoppingListItemParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/shopping-list", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const rows = await db
    .select()
    .from(shoppingListTable)
    .where(eq(shoppingListTable.userId, userId))
    .orderBy(shoppingListTable.createdAt);

  res.json(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));
});

router.post("/shopping-list", requireAuth, async (req, res): Promise<void> => {
  const parsed = AddToShoppingListBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = req.session.userId!;

  if (parsed.data.itemId != null) {
    const [item] = await db
      .select({ id: itemsTable.id })
      .from(itemsTable)
      .where(
        and(
          eq(itemsTable.id, parsed.data.itemId),
          eq(itemsTable.userId, userId),
        ),
      );
    if (!item) {
      res.status(400).json({ error: "itemId does not exist" });
      return;
    }
  }

  const [row] = await db
    .insert(shoppingListTable)
    .values({
      userId,
      itemId: parsed.data.itemId ?? null,
      name: parsed.data.name,
      quantity: parsed.data.quantity ?? 1,
      unit: parsed.data.unit ?? null,
      note: parsed.data.note ?? null,
    })
    .returning();

  res.status(201).json({ ...row, createdAt: row.createdAt.toISOString() });
});

router.delete(
  "/shopping-list/checked",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = req.session.userId!;
    await db
      .delete(shoppingListTable)
      .where(
        and(
          eq(shoppingListTable.userId, userId),
          eq(shoppingListTable.checked, true),
        ),
      );
    res.sendStatus(204);
  },
);

router.patch(
  "/shopping-list/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = UpdateShoppingListItemParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = UpdateShoppingListItemBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const userId = req.session.userId!;
    const updates: Record<string, unknown> = {};
    if (parsed.data.checked !== undefined)
      updates.checked = parsed.data.checked;
    if (parsed.data.quantity !== undefined)
      updates.quantity = parsed.data.quantity;
    if ("note" in parsed.data && parsed.data.note !== undefined)
      updates.note = parsed.data.note;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    const [row] = await db
      .update(shoppingListTable)
      .set(updates)
      .where(
        and(
          eq(shoppingListTable.id, params.data.id),
          eq(shoppingListTable.userId, userId),
        ),
      )
      .returning();

    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ ...row, createdAt: row.createdAt.toISOString() });
  },
);

router.delete(
  "/shopping-list/:id",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = DeleteShoppingListItemParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const userId = req.session.userId!;
    const [row] = await db
      .delete(shoppingListTable)
      .where(
        and(
          eq(shoppingListTable.id, params.data.id),
          eq(shoppingListTable.userId, userId),
        ),
      )
      .returning();

    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.sendStatus(204);
  },
);

export default router;

import { Router, type IRouter } from "express";
import {
  db,
  shopsTable,
  itemPricesTable,
  itemsTable,
  priceSettingsTable,
} from "@workspace/db";
import { and, eq, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAuth } from "../middlewares/auth";
import { validPrice } from "../services/transfer-validation";
import { validPriceDate, shopName, shopKey } from "../services/price-selection";
import { getPriceMode } from "../services/item-prices";

const router: IRouter = Router();
const idSchema = z.coerce.number().int().positive().max(2147483647);
const inputSchema = z.object({
  shopId: z.number().int().positive().max(2147483647),
  price: z
    .number()
    .refine(validPrice, "Invalid price")
    .refine((n) => n >= 0 && n <= 999999999999.99),
  priceDate: z.string().refine(validPriceDate, "Invalid date"),
});
const shopSchema = z.object({
  name: z
    .string()
    .transform(shopName)
    .pipe(
      z
        .string()
        .min(1)
        .max(120)
        .refine((name) => !name.includes("\0")),
    ),
});
const serialize = <T extends { createdAt: Date }>(row: T) => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
});

router.get("/price-settings", requireAuth, async (req, res) => {
  res.json({ mode: await getPriceMode(req.session.userId!) });
});
router.patch("/price-settings", requireAuth, async (req, res) => {
  const parsed = z
    .object({ mode: z.enum(["lowest", "latest"]) })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid price display mode" });
    return;
  }
  const userId = req.session.userId!;
  await db
    .insert(priceSettingsTable)
    .values({ userId, mode: parsed.data.mode })
    .onConflictDoUpdate({
      target: priceSettingsTable.userId,
      set: { mode: parsed.data.mode },
    });
  res.json(parsed.data);
});
router.get("/shops", requireAuth, async (req, res) => {
  res.json(
    await db
      .select({ id: shopsTable.id, name: shopsTable.name })
      .from(shopsTable)
      .where(eq(shopsTable.userId, req.session.userId!))
      .orderBy(shopsTable.name),
  );
});
router.post("/shops", requireAuth, async (req, res) => {
  const parsed = shopSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Shop name required (max 120 characters)" });
    return;
  }
  const userId = req.session.userId!;
  const nameKey = shopKey(parsed.data.name);
  await db
    .insert(shopsTable)
    .values({ userId, nameKey, name: parsed.data.name })
    .onConflictDoNothing({ target: [shopsTable.userId, shopsTable.nameKey] });
  const [row] = await db
    .select({ id: shopsTable.id, name: shopsTable.name })
    .from(shopsTable)
    .where(and(eq(shopsTable.userId, userId), eq(shopsTable.nameKey, nameKey)));
  res.status(201).json(row);
});
router.get("/items/:id/prices", requireAuth, async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) {
    res.status(400).json({ error: "Invalid item ID" });
    return;
  }
  const userId = req.session.userId!;
  const [item] = await db
    .select({ id: itemsTable.id })
    .from(itemsTable)
    .where(and(eq(itemsTable.id, id.data), eq(itemsTable.userId, userId)));
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  const rows = await db
    .select({
      id: itemPricesTable.id,
      itemId: itemPricesTable.itemId,
      shopId: itemPricesTable.shopId,
      shopName: shopsTable.name,
      price: itemPricesTable.price,
      priceDate: itemPricesTable.priceDate,
      createdAt: itemPricesTable.createdAt,
    })
    .from(itemPricesTable)
    .innerJoin(
      shopsTable,
      and(
        eq(shopsTable.id, itemPricesTable.shopId),
        eq(shopsTable.userId, userId),
      ),
    )
    .where(
      and(
        eq(itemPricesTable.itemId, id.data),
        eq(itemPricesTable.userId, userId),
      ),
    )
    .orderBy(
      desc(itemPricesTable.priceDate),
      desc(itemPricesTable.createdAt),
      desc(itemPricesTable.id),
    );
  res.json(rows.map(serialize));
});

for (const method of ["post", "patch"] as const) {
  router[method](
    method === "post" ? "/items/:id/prices" : "/items/:id/prices/:priceId",
    requireAuth,
    async (req, res) => {
      const id = idSchema.safeParse(req.params.id);
      const priceId =
        method === "patch" ? idSchema.safeParse(req.params.priceId) : null;
      const input = inputSchema.safeParse(req.body);
      if (!id.success || (priceId && !priceId.success) || !input.success) {
        res.status(400).json({ error: "Invalid shop, price or date" });
        return;
      }
      const userId = req.session.userId!;
      const result = await db.transaction(async (tx) => {
        const [item] = await tx
          .select({ id: itemsTable.id })
          .from(itemsTable)
          .where(and(eq(itemsTable.id, id.data), eq(itemsTable.userId, userId)))
          .for("key share");
        const [shop] = await tx
          .select({ id: shopsTable.id, name: shopsTable.name })
          .from(shopsTable)
          .where(
            and(
              eq(shopsTable.id, input.data.shopId),
              eq(shopsTable.userId, userId),
            ),
          )
          .for("key share");
        if (!item || !shop) return null;
        const [row] =
          method === "post"
            ? await tx
                .insert(itemPricesTable)
                .values({ ...input.data, itemId: id.data, userId })
                .returning()
            : await tx
                .update(itemPricesTable)
                .set(input.data)
                .where(
                  and(
                    eq(itemPricesTable.id, priceId!.data!),
                    eq(itemPricesTable.itemId, id.data),
                    eq(itemPricesTable.userId, userId),
                  ),
                )
                .returning();
        return row
          ? {
              id: row.id,
              itemId: row.itemId,
              shopId: row.shopId,
              shopName: shop.name,
              price: row.price,
              priceDate: row.priceDate,
              createdAt: row.createdAt,
            }
          : null;
      });
      if (!result) {
        res.status(404).json({ error: "Item, shop or price not found" });
        return;
      }
      res.status(method === "post" ? 201 : 200).json(serialize(result));
    },
  );
}
router.delete("/items/:id/prices/:priceId", requireAuth, async (req, res) => {
  const id = idSchema.safeParse(req.params.id),
    priceId = idSchema.safeParse(req.params.priceId);
  if (!id.success || !priceId.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }
  const [row] = await db
    .delete(itemPricesTable)
    .where(
      and(
        eq(itemPricesTable.id, priceId.data),
        eq(itemPricesTable.itemId, id.data),
        eq(itemPricesTable.userId, req.session.userId!),
      ),
    )
    .returning({ id: itemPricesTable.id });
  if (!row) {
    res.status(404).json({ error: "Price not found" });
    return;
  }
  res.sendStatus(204);
});
export default router;

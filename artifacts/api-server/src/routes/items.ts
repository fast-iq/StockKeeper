import { Router, type IRouter } from "express";
import {
  db,
  itemsTable,
  categoriesTable,
  unitsTable,
  locationsTable,
} from "@workspace/db";
import { eq, and, like, inArray, or, isNull } from "drizzle-orm";
import {
  CreateItemBody,
  UpdateItemBody,
  GetItemParams,
  UpdateItemParams,
  DeleteItemParams,
  ListItemsQueryParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

async function getAllDescendantIds(
  userId: number,
  parentId: number,
): Promise<number[]> {
  const allCats = await db
    .select({ id: categoriesTable.id, parentId: categoriesTable.parentId })
    .from(categoriesTable)
    .where(eq(categoriesTable.userId, userId));

  const ownIds = new Set(allCats.map((c) => c.id));
  if (!ownIds.has(parentId)) return [];

  const childrenOf = new Map<number, number[]>();
  for (const cat of allCats) {
    if (cat.parentId == null) continue;
    const siblings = childrenOf.get(cat.parentId);
    if (siblings) siblings.push(cat.id);
    else childrenOf.set(cat.parentId, [cat.id]);
  }

  const result: number[] = [];
  const queue = [parentId];
  const visited = new Set<number>([parentId]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);
    for (const child of childrenOf.get(current) ?? []) {
      if (visited.has(child)) continue;
      visited.add(child);
      queue.push(child);
    }
  }

  return result;
}

type ItemRefs = {
  categoryId?: number | null;
  unitId?: number | null;
  locationId?: number | null;
};

async function validateItemRefs(
  userId: number,
  refs: ItemRefs,
): Promise<string | null> {
  if (refs.categoryId != null) {
    const [cat] = await db
      .select({ id: categoriesTable.id })
      .from(categoriesTable)
      .where(
        and(
          eq(categoriesTable.id, refs.categoryId),
          eq(categoriesTable.userId, userId),
        ),
      );
    if (!cat) return "categoryId does not exist";
  }

  if (refs.unitId != null) {
    const [unit] = await db
      .select({ id: unitsTable.id })
      .from(unitsTable)
      .where(
        and(
          eq(unitsTable.id, refs.unitId),
          or(isNull(unitsTable.userId), eq(unitsTable.userId, userId)),
        ),
      );
    if (!unit) return "unitId does not exist";
  }

  if (refs.locationId != null) {
    const [loc] = await db
      .select({ id: locationsTable.id })
      .from(locationsTable)
      .where(
        and(
          eq(locationsTable.id, refs.locationId),
          eq(locationsTable.userId, userId),
        ),
      );
    if (!loc) return "locationId does not exist";
  }

  return null;
}

function serializeItem(item: {
  id: number;
  name: string;
  description: string | null;
  photoUrl?: string | null;
  quantity: number;
  unitId?: number | null;
  unitSymbol?: string | null;
  unitName?: string | null;
  unit: string | null;
  locationId?: number | null;
  locationName?: string | null;
  location: string | null;
  sku: string | null;
  barcode: string | null;
  tags: string | null;
  notes: string | null;
  categoryId: number | null;
  userId: number;
  createdAt: Date;
  updatedAt: Date;
  categoryName?: string | null;
}) {
  return {
    ...item,
    photoUrl: item.photoUrl ?? null,
    unitId: item.unitId ?? null,
    unitSymbol: item.unitSymbol ?? null,
    unitName: item.unitName ?? null,
    locationId: item.locationId ?? null,
    locationName: item.locationName ?? null,
    categoryName: item.categoryName ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

async function resolveUnit(unitId: number | null | undefined) {
  if (!unitId) return { unitSymbol: null, unitName: null };
  const [unit] = await db
    .select()
    .from(unitsTable)
    .where(eq(unitsTable.id, unitId));
  return { unitSymbol: unit?.symbol ?? null, unitName: unit?.name ?? null };
}

async function resolveLocation(locationId: number | null | undefined) {
  if (!locationId) return { locationName: null };
  const [loc] = await db
    .select()
    .from(locationsTable)
    .where(eq(locationsTable.id, locationId));
  return { locationName: loc?.name ?? null };
}

router.get("/items", requireAuth, async (req, res): Promise<void> => {
  const queryParsed = ListItemsQueryParams.safeParse(req.query);
  if (!queryParsed.success) {
    res.status(400).json({ error: queryParsed.error.message });
    return;
  }

  const userId = req.session.userId!;
  const { categoryId, locationId, search, includeSubcategories } =
    queryParsed.data;

  let categoryIds: number[] | null = null;
  if (categoryId != null) {
    if (includeSubcategories) {
      categoryIds = await getAllDescendantIds(userId, categoryId);
    } else {
      categoryIds = [categoryId];
    }
  }

  const rows = await db
    .select({
      id: itemsTable.id,
      name: itemsTable.name,
      description: itemsTable.description,
      photoUrl: itemsTable.photoUrl,
      quantity: itemsTable.quantity,
      unitId: itemsTable.unitId,
      unitSymbol: unitsTable.symbol,
      unitName: unitsTable.name,
      unit: itemsTable.unit,
      locationId: itemsTable.locationId,
      locationName: locationsTable.name,
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
    .leftJoin(
      categoriesTable,
      and(
        eq(itemsTable.categoryId, categoriesTable.id),
        eq(categoriesTable.userId, userId),
      ),
    )
    .leftJoin(
      unitsTable,
      and(
        eq(itemsTable.unitId, unitsTable.id),
        or(isNull(unitsTable.userId), eq(unitsTable.userId, userId)),
      ),
    )
    .leftJoin(
      locationsTable,
      and(
        eq(itemsTable.locationId, locationsTable.id),
        eq(locationsTable.userId, userId),
      ),
    )
    .where(
      and(
        eq(itemsTable.userId, userId),
        categoryIds != null
          ? inArray(itemsTable.categoryId, categoryIds)
          : undefined,
        locationId != null ? eq(itemsTable.locationId, locationId) : undefined,
        search
          ? or(
              like(itemsTable.name, `%${search}%`),
              like(itemsTable.description, `%${search}%`),
              like(itemsTable.sku, `%${search}%`),
              like(itemsTable.tags, `%${search}%`),
            )
          : undefined,
      ),
    )
    .orderBy(itemsTable.name);

  res.json(rows.map(serializeItem));
});

router.post("/items", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = req.session.userId!;

  const refError = await validateItemRefs(userId, parsed.data);
  if (refError) {
    res.status(400).json({ error: refError });
    return;
  }

  const [item] = await db
    .insert(itemsTable)
    .values({ ...parsed.data, userId })
    .returning();

  let categoryName: string | null = null;
  if (item.categoryId) {
    const [cat] = await db
      .select({ name: categoriesTable.name })
      .from(categoriesTable)
      .where(
        and(
          eq(categoriesTable.id, item.categoryId),
          eq(categoriesTable.userId, userId),
        ),
      );
    categoryName = cat?.name ?? null;
  }

  const { unitSymbol, unitName } = await resolveUnit(item.unitId);
  const { locationName } = await resolveLocation(item.locationId);
  res.status(201).json(
    serializeItem({
      ...item,
      categoryName,
      unitSymbol,
      unitName,
      locationName,
    }),
  );
});

router.get("/items/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const userId = req.session.userId!;
  const [row] = await db
    .select({
      id: itemsTable.id,
      name: itemsTable.name,
      description: itemsTable.description,
      photoUrl: itemsTable.photoUrl,
      quantity: itemsTable.quantity,
      unitId: itemsTable.unitId,
      unitSymbol: unitsTable.symbol,
      unitName: unitsTable.name,
      unit: itemsTable.unit,
      locationId: itemsTable.locationId,
      locationName: locationsTable.name,
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
    .leftJoin(
      categoriesTable,
      and(
        eq(itemsTable.categoryId, categoriesTable.id),
        eq(categoriesTable.userId, userId),
      ),
    )
    .leftJoin(
      unitsTable,
      and(
        eq(itemsTable.unitId, unitsTable.id),
        or(isNull(unitsTable.userId), eq(unitsTable.userId, userId)),
      ),
    )
    .leftJoin(
      locationsTable,
      and(
        eq(itemsTable.locationId, locationsTable.id),
        eq(locationsTable.userId, userId),
      ),
    )
    .where(
      and(eq(itemsTable.id, params.data.id), eq(itemsTable.userId, userId)),
    );

  if (!row) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  res.json(serializeItem(row));
});

router.patch("/items/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = req.session.userId!;

  const refError = await validateItemRefs(userId, parsed.data);
  if (refError) {
    res.status(400).json({ error: refError });
    return;
  }

  const [item] = await db
    .update(itemsTable)
    .set(parsed.data)
    .where(
      and(eq(itemsTable.id, params.data.id), eq(itemsTable.userId, userId)),
    )
    .returning();

  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  let categoryName: string | null = null;
  if (item.categoryId) {
    const [cat] = await db
      .select({ name: categoriesTable.name })
      .from(categoriesTable)
      .where(
        and(
          eq(categoriesTable.id, item.categoryId),
          eq(categoriesTable.userId, userId),
        ),
      );
    categoryName = cat?.name ?? null;
  }

  const { unitSymbol, unitName } = await resolveUnit(item.unitId);
  const { locationName } = await resolveLocation(item.locationId);
  res.json(
    serializeItem({
      ...item,
      categoryName,
      unitSymbol,
      unitName,
      locationName,
    }),
  );
});

router.delete("/items/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const userId = req.session.userId!;
  const [item] = await db
    .delete(itemsTable)
    .where(
      and(eq(itemsTable.id, params.data.id), eq(itemsTable.userId, userId)),
    )
    .returning();

  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;

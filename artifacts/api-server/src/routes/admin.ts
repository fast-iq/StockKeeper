import { Router, type IRouter } from "express";
import { db, usersTable, itemsTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

async function requireAdmin(req: any, res: any, next: any): Promise<void> {
  const [user] = await db
    .select({ isAdmin: usersTable.isAdmin })
    .from(usersTable)
    .where(eq(usersTable.id, req.session.userId!));

  if (!user?.isAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}

router.get(
  "/admin/users",
  requireAuth,
  requireAdmin,
  async (req, res): Promise<void> => {
    const users = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
        language: usersTable.language,
        isAdmin: usersTable.isAdmin,
        createdAt: usersTable.createdAt,
        itemCount: count(itemsTable.id),
      })
      .from(usersTable)
      .leftJoin(itemsTable, eq(itemsTable.userId, usersTable.id))
      .groupBy(usersTable.id)
      .orderBy(usersTable.createdAt);

    res.json(
      users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        language: u.language,
        isAdmin: u.isAdmin,
        createdAt: u.createdAt.toISOString(),
        itemCount: Number(u.itemCount),
      })),
    );
  },
);

router.patch(
  "/admin/users/:id",
  requireAuth,
  requireAdmin,
  async (req, res): Promise<void> => {
    const targetId = parseInt(String(req.params.id), 10);
    if (isNaN(targetId)) {
      res.status(400).json({ error: "Invalid user id" });
      return;
    }

    const { language, isAdmin, name } = req.body || {};
    const updates: Partial<typeof usersTable.$inferInsert> = {};

    if (language === "en" || language === "ru" || language === "auto") {
      updates.language = language;
    }
    if (typeof isAdmin === "boolean") {
      if (targetId === req.session.userId && !isAdmin) {
        res.status(400).json({ error: "Cannot remove your own admin rights" });
        return;
      }
      updates.isAdmin = isAdmin;
    }
    if (typeof name === "string" && name.trim().length > 0) {
      updates.name = name.trim();
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No valid fields to update" });
      return;
    }

    const [user] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, targetId))
      .returning();

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      language: user.language,
      isAdmin: user.isAdmin,
      createdAt: user.createdAt.toISOString(),
    });
  },
);

export default router;

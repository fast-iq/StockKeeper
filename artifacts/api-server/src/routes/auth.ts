import { Router, type IRouter, type Request } from "express";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { db, usersTable, passwordResetTokensTable } from "@workspace/db";
import { eq, and, gt, isNull } from "drizzle-orm";
import {
  RegisterBody,
  LoginBody,
  GoogleLoginBody,
  ChangePasswordBody,
  ForgotPasswordBody,
  ResetPasswordBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { rateLimit } from "../middlewares/rate-limit";
import { sendPasswordResetEmail } from "../services/email";
import { resolveGoogleUser } from "../services/google-auth";

const router: IRouter = Router();
const googleClient = new OAuth2Client();

const AUTH_RATE_LIMITS = {
  register: { name: "auth-register", windowMs: 15 * 60 * 1000, max: 10 },
  login: { name: "auth-login", windowMs: 15 * 60 * 1000, max: 10 },
  google: { name: "auth-google", windowMs: 15 * 60 * 1000, max: 10 },
  forgotIp: { name: "auth-forgot-ip", windowMs: 15 * 60 * 1000, max: 10 },
  forgotEmail: { name: "auth-forgot-email", windowMs: 15 * 60 * 1000, max: 5 },
  reset: { name: "auth-reset", windowMs: 15 * 60 * 1000, max: 10 },
} as const;

async function regenerateSession(req: Request): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

function isUniqueViolation(error: unknown): boolean {
  const err = error as { code?: string; cause?: { code?: string } } | null;
  return err?.code === "23505" || err?.cause?.code === "23505";
}

function serializeUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    language: user.language,
    isAdmin: user.isAdmin,
    createdAt: user.createdAt.toISOString(),
  };
}

router.post(
  "/auth/register",
  rateLimit(AUTH_RATE_LIMITS.register),
  async (req, res): Promise<void> => {
    const parsed = RegisterBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { email, password, name } = parsed.data;

    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase()));

    if (existing) {
      res.status(409).json({ error: "Email already in use" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    let user: typeof usersTable.$inferSelect;
    try {
      const [inserted] = await db
        .insert(usersTable)
        .values({ email: email.toLowerCase(), passwordHash, name })
        .returning();
      user = inserted;
    } catch (error) {
      if (isUniqueViolation(error)) {
        res.status(409).json({ error: "Email already in use" });
        return;
      }
      throw error;
    }

    await regenerateSession(req);
    req.session.userId = user.id;

    res.status(201).json({
      user: serializeUser(user),
      message: "Registration successful",
    });
  },
);

router.post(
  "/auth/login",
  rateLimit(AUTH_RATE_LIMITS.login),
  async (req, res): Promise<void> => {
    const parsed = LoginBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { email, password } = parsed.data;

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase()));

    if (!user) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    await regenerateSession(req);
    req.session.userId = user.id;

    res.json({
      user: serializeUser(user),
      message: "Login successful",
    });
  },
);

router.post(
  "/auth/google",
  rateLimit(AUTH_RATE_LIMITS.google),
  async (req, res): Promise<void> => {
    const parsed = GoogleLoginBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Google credential is required" });
      return;
    }

    const result = await resolveGoogleUser(
      parsed.data.idToken,
      process.env.GOOGLE_CLIENT_ID,
      {
        verifyIdToken: async (idToken, audience) => {
          const ticket = await googleClient.verifyIdToken({
            idToken,
            audience,
          });
          return ticket.getPayload();
        },
        findUserByEmail: async (email) => {
          const [user] = await db
            .select()
            .from(usersTable)
            .where(eq(usersTable.email, email));
          return user;
        },
        createUser: async ({ email, name }) => {
          const passwordHash = await bcrypt.hash(
            randomBytes(32).toString("hex"),
            12,
          );
          const [user] = await db
            .insert(usersTable)
            .values({ email, passwordHash, name })
            .returning();
          return user;
        },
      },
    );

    if (result.status === "not_configured") {
      req.log.error("GOOGLE_CLIENT_ID is not configured");
      res
        .status(400)
        .json({ error: "Google authentication is not configured" });
      return;
    }
    if (result.status === "invalid_credential") {
      req.log.warn(
        { err: result.error },
        "Google credential verification failed",
      );
      res.status(401).json({ error: "Invalid Google credential" });
      return;
    }
    if (result.status === "email_unverified") {
      res.status(401).json({ error: "Google account email is not verified" });
      return;
    }

    await regenerateSession(req);
    req.session.userId = result.user.id;
    res.json({
      user: serializeUser(result.user),
      message: "Google login successful",
    });
  },
);

router.post("/auth/logout", (req, res): void => {
  req.session.destroy(() => {
    res.json({ message: "Logged out" });
  });
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.session.userId!));

  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  res.json(serializeUser(user));
});

router.post(
  "/auth/change-password",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = ChangePasswordBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "New password must be at least 8 characters" });
      return;
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.session.userId!));

    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const currentPasswordValid = await bcrypt.compare(
      parsed.data.currentPassword,
      user.passwordHash,
    );
    if (!currentPasswordValid) {
      res.status(400).json({ error: "Current password is incorrect" });
      return;
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    const now = new Date();

    await db.transaction(async (tx) => {
      await tx
        .update(usersTable)
        .set({ passwordHash })
        .where(eq(usersTable.id, user.id));

      await tx
        .update(passwordResetTokensTable)
        .set({ usedAt: now })
        .where(
          and(
            eq(passwordResetTokensTable.userId, user.id),
            isNull(passwordResetTokensTable.usedAt),
          ),
        );
    });

    res.json({ message: "Password updated successfully" });
  },
);

router.post(
  "/auth/forgot-password",
  rateLimit(AUTH_RATE_LIMITS.forgotIp),
  rateLimit({
    ...AUTH_RATE_LIMITS.forgotEmail,
    key: (req) => String(req.body?.email ?? "").toLowerCase(),
  }),
  async (req, res): Promise<void> => {
    const parsed = ForgotPasswordBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid email" });
      return;
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, parsed.data.email.toLowerCase()));

    if (!user) {
      res.json({
        message: "If this email exists, a reset link has been sent.",
      });
      return;
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await db
      .update(passwordResetTokensTable)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(passwordResetTokensTable.userId, user.id),
          isNull(passwordResetTokensTable.usedAt),
        ),
      );

    await db
      .insert(passwordResetTokensTable)
      .values({ userId: user.id, token, expiresAt });

    const origin = process.env.REPLIT_DOMAINS
      ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
      : `http://localhost:${process.env.PORT || 8080}`;

    const resetUrl = `${origin}/reset-password?token=${token}`;

    try {
      await sendPasswordResetEmail(user.email, resetUrl);
    } catch (error) {
      req.log.error(
        { err: error },
        "Password reset email could not be delivered",
      );
      res.status(503).json({ error: "Email service unavailable" });
      return;
    }

    res.json({ message: "If this email exists, a reset link has been sent." });
  },
);

router.post(
  "/auth/reset-password",
  rateLimit(AUTH_RATE_LIMITS.reset),
  async (req, res): Promise<void> => {
    const parsed = ResetPasswordBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }

    const now = new Date();
    const [row] = await db
      .select()
      .from(passwordResetTokensTable)
      .where(
        and(
          eq(passwordResetTokensTable.token, parsed.data.token),
          gt(passwordResetTokensTable.expiresAt, now),
        ),
      );

    if (!row || row.usedAt) {
      res.status(400).json({ error: "Invalid or expired token" });
      return;
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);

    await db
      .update(usersTable)
      .set({ passwordHash })
      .where(eq(usersTable.id, row.userId));

    await db
      .update(passwordResetTokensTable)
      .set({ usedAt: now })
      .where(
        and(
          eq(passwordResetTokensTable.userId, row.userId),
          isNull(passwordResetTokensTable.usedAt),
        ),
      );

    res.json({ message: "Password updated successfully" });
  },
);

router.patch("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const { language, name } = req.body || {};

  const updates: Partial<typeof usersTable.$inferInsert> = {};

  if (language === "en" || language === "ru" || language === "auto") {
    updates.language = language;
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
    .where(eq(usersTable.id, req.session.userId!))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(serializeUser(user));
});

export default router;

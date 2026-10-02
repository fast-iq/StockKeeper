import express, { type Express, type ErrorRequestHandler } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/db";
import router from "./routes";
import { logger } from "./lib/logger";

const PgStore = connectPgSimple(session);

function splitOrigins(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => (/^https?:\/\//i.test(entry) ? entry : `https://${entry}`));
}

const explicitOrigins = [
  ...splitOrigins(process.env.REPLIT_DOMAINS),
  ...splitOrigins(process.env.CORS_ORIGINS),
];

const isProduction = process.env.NODE_ENV === "production";

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (explicitOrigins.includes(origin)) return true;
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return true;
  if (!isProduction && /\.(replit\.(?:dev|app)|repl\.co)$/i.test(url.hostname))
    return true;
  return false;
}

const app: Express = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  next();
});
app.use(
  cors({
    origin: (origin, callback) => {
      callback(null, isAllowedOrigin(origin));
    },
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error("SESSION_SECRET must be set.");
}

app.use(
  session({
    store: new PgStore({
      pool,
      tableName: "session",
      createTableIfMissing: false,
    }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  }),
);

app.use("/api", router);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((_req, res) => {
  res
    .status(404)
    .set({
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Security-Policy":
        "default-src 'none'; frame-ancestors 'none'; form-action 'none'",
    })
    .send("Not Found");
});

const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const anyErr = (typeof err === "object" && err !== null ? err : {}) as {
    status?: number;
    statusCode?: number;
    type?: string;
    message?: string;
  };
  const status = anyErr.status ?? anyErr.statusCode ?? 500;

  if (status >= 500) {
    req.log.error({ err }, "Unhandled request error");
    res.status(500).json({ error: "Internal server error" });
    return;
  }

  if (anyErr.type === "entity.parse.failed") {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }
  if (anyErr.type === "entity.too.large") {
    res.status(413).json({ error: "Request body too large" });
    return;
  }

  req.log.debug({ err }, "Request failed");
  res.status(status).json({ error: anyErr.message || "Bad request" });
};

app.use(errorHandler);

export default app;

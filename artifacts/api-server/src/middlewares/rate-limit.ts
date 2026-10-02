import type { Request, Response, NextFunction } from "express";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function cleanupExpired(): void {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

const sweeper = setInterval(cleanupExpired, 60_000);
sweeper.unref();

export function rateLimit(options: {
  name: string;
  windowMs: number;
  max: number;
  key?: (req: Request) => string;
}) {
  const { name, windowMs, max, key } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const bucketKey = `${name}:${key ? key(req) : (req.ip ?? "unknown")}`;
    const now = Date.now();

    let bucket = buckets.get(bucketKey);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(bucketKey, bucket);
    }

    bucket.count += 1;
    if (bucket.count > max) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      res
        .status(429)
        .json({ error: "Too many requests. Please try again later." });
      return;
    }

    next();
  };
}

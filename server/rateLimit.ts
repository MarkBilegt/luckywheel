import type { NextFunction, Request, Response } from 'express';

/** Simple in-memory fixed-window limiter, keyed by IP. Enough for a single server process. */
export function rateLimit(opts: { windowMs: number; max: number; message: string }) {
  const hits = new Map<string, { count: number; reset: number }>();

  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, opts.windowMs).unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + opts.windowMs };
      hits.set(key, entry);
    }
    entry.count++;
    if (entry.count > opts.max) {
      res.setHeader('Retry-After', Math.ceil((entry.reset - now) / 1000));
      res.status(429).json({ error: opts.message });
      return;
    }
    next();
  };
}

// FluxGuard Express example: metrics, benchmark routes for NFR load tests, and optional global rate limiting.
import express from "express";
import { Redis } from "ioredis";
import {
  FluxGuard,
  Algorithm,
  fluxGuardMiddleware,
  createFluxGuardPrometheusMetrics,
} from "fluxguard";

function createRedisClient() {
  if (process.env.REDIS_URL) {
    return new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
    });
  }
  const host = process.env.REDIS_HOST ?? "localhost";
  const port = Number(process.env.REDIS_PORT ?? 6379);
  const commandTimeout = Number(process.env.REDIS_COMMAND_TIMEOUT_MS ?? 100);
  return new Redis({
    host,
    port,
    maxRetriesPerRequest: 2,
    commandTimeout,
    connectTimeout: Math.min(commandTimeout, 200),
    enableReadyCheck: true,
  });
}

const redis = createRedisClient();

const benchLimit = Number(process.env.BENCH_LIMIT ?? 500);
const benchWindowMs = Number(process.env.BENCH_WINDOW_MS ?? 1000);

function benchKey(req) {
  return String(req.headers["x-api-key"] ?? req.ip ?? "anon");
}

const fixedWindowLimiter = new FluxGuard({
  algorithm: Algorithm.FIXED_WINDOW,
  limit: benchLimit,
  windowMs: benchWindowMs,
  redis,
  failOpen: true,
  keyPrefix: "bench:fw:",
});

const slidingWindowLimiter = new FluxGuard({
  algorithm: Algorithm.SLIDING_WINDOW_COUNTER,
  limit: benchLimit,
  windowMs: benchWindowMs,
  redis,
  failOpen: true,
  keyPrefix: "bench:sw:",
});

const tokenBucketLimiter = new FluxGuard({
  algorithm: Algorithm.TOKEN_BUCKET,
  limit: benchLimit,
  windowMs: benchWindowMs,
  redis,
  failOpen: true,
  keyPrefix: "bench:tb:",
});

const chaosFailOpenLimiter = new FluxGuard({
  algorithm: Algorithm.SLIDING_WINDOW_COUNTER,
  limit: 100,
  windowMs: 60_000,
  redis,
  failOpen: true,
  keyPrefix: "bench:chaos:open:",
});

const chaosFailClosedLimiter = new FluxGuard({
  algorithm: Algorithm.SLIDING_WINDOW_COUNTER,
  limit: 100,
  windowMs: 60_000,
  redis,
  failOpen: false,
  keyPrefix: "bench:chaos:closed:",
});

const limiter = new FluxGuard({
  algorithm: Algorithm.SLIDING_WINDOW_COUNTER,
  limit: Number(process.env.LIMIT ?? 100),
  windowMs: Number(process.env.WINDOW_MS ?? 60_000),
  redis,
  failOpen: true,
});

const prom = createFluxGuardPrometheusMetrics(limiter, { collectDefault: true });

const app = express();

app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", prom.registry.contentType);
  res.end(await prom.registry.metrics());
});

app.get("/api/benchmark/ping", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.get(
  "/api/benchmark/test",
  fluxGuardMiddleware(fixedWindowLimiter, { keyExtract: benchKey }),
  (_req, res) => {
    res.status(200).json({ ok: true });
  },
);

app.get(
  "/api/benchmark/test/sliding-window-counter",
  fluxGuardMiddleware(slidingWindowLimiter, { keyExtract: benchKey }),
  (_req, res) => {
    res.status(200).json({ ok: true });
  },
);

app.get(
  "/api/benchmark/test/token-bucket",
  fluxGuardMiddleware(tokenBucketLimiter, { keyExtract: benchKey }),
  (_req, res) => {
    res.status(200).json({ ok: true });
  },
);

app.get(
  "/api/benchmark/chaos/fail-open",
  fluxGuardMiddleware(chaosFailOpenLimiter, { keyExtract: benchKey }),
  (_req, res) => {
    res.status(200).json({ ok: true });
  },
);

app.get("/api/benchmark/chaos/fail-closed", async (req, res) => {
  const key = benchKey(req);
  try {
    const result = await chaosFailClosedLimiter.check(key);
    if (!result.allowed) {
      res.status(429).json({ error: "Too Many Requests" });
      return;
    }
    res.status(200).json({ ok: true });
  } catch {
    res.status(429).json({ error: "Too Many Requests" });
  }
});

app.use(
  "/api",
  fluxGuardMiddleware(limiter, {
    keyExtract: (req) => req.headers["x-api-key"] ?? req.ip ?? "anon",
  }),
);

app.get("/api/hello", (_req, res) => {
  res.json({ ok: true });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`listening on ${port}`);
});

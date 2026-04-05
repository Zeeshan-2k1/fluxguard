import { randomBytes } from "node:crypto";
import { Algorithm, type RateLimitResult } from "../types.js";
import type { RedisStore } from "../store/RedisStore.js";

function toResult(
  algorithm: Algorithm,
  limit: number,
  row: unknown[],
  now: number,
): RateLimitResult {
  const allowed = Number(row[0]) === 1;
  const remaining = Number(row[1]);
  const resetMs = Number(row[3]);
  const retryAfterMs = row[4] != null && Number(row[4]) > 0 ? Number(row[4]) : undefined;
  return {
    allowed,
    limit,
    remaining: Math.max(0, Math.min(limit, remaining)),
    resetMs: Number.isFinite(resetMs) ? resetMs : now,
    retryAfterMs,
    algorithm,
  };
}

export async function runRedisCheck(
  store: RedisStore,
  prefix: string,
  id: string,
  algorithm: Algorithm,
  limit: number,
  windowMs: number,
  now: number,
): Promise<RateLimitResult> {
  switch (algorithm) {
    case Algorithm.FIXED_WINDOW:
      return fixedWindow(store, prefix, id, limit, windowMs, now);
    case Algorithm.TOKEN_BUCKET:
      return tokenBucket(store, prefix, id, limit, windowMs, now);
    case Algorithm.SLIDING_WINDOW_LOG:
      return slidingLog(store, prefix, id, limit, windowMs, now);
    case Algorithm.SLIDING_WINDOW_COUNTER:
      return slidingCounter(store, prefix, id, limit, windowMs, now);
    default:
      throw new Error(`Unsupported algorithm: ${String(algorithm)}`);
  }
}

async function fixedWindow(
  store: RedisStore,
  prefix: string,
  id: string,
  limit: number,
  windowMs: number,
  now: number,
): Promise<RateLimitResult> {
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const key = `${prefix}${id}:${windowStart}`;
  const script = store.loadScriptFile("fixed_window.lua");
  const raw = await store.evalScript(script, [key], [limit, windowMs, now, windowStart]);
  return toResult(Algorithm.FIXED_WINDOW, limit, raw, now);
}

async function tokenBucket(
  store: RedisStore,
  prefix: string,
  id: string,
  limit: number,
  windowMs: number,
  now: number,
): Promise<RateLimitResult> {
  const k1 = `${prefix}${id}:tokens`;
  const k2 = `${prefix}${id}:last_refill`;
  const script = store.loadScriptFile("token_bucket.lua");
  const raw = await store.evalScript(script, [k1, k2], [limit, windowMs, now]);
  return toResult(Algorithm.TOKEN_BUCKET, limit, raw, now);
}

async function slidingLog(
  store: RedisStore,
  prefix: string,
  id: string,
  limit: number,
  windowMs: number,
  now: number,
): Promise<RateLimitResult> {
  const key = `${prefix}${id}:log`;
  const member = `${now}-${randomBytes(8).toString("hex")}`;
  const script = store.loadScriptFile("sliding_window_log.lua");
  const raw = await store.evalScript(script, [key], [limit, windowMs, now, member]);
  return toResult(Algorithm.SLIDING_WINDOW_LOG, limit, raw, now);
}

async function slidingCounter(
  store: RedisStore,
  prefix: string,
  id: string,
  limit: number,
  windowMs: number,
  now: number,
): Promise<RateLimitResult> {
  const currStart = Math.floor(now / windowMs) * windowMs;
  const prevStart = currStart - windowMs;
  const kPrev = `${prefix}${id}:${prevStart}`;
  const kCurr = `${prefix}${id}:${currStart}`;
  const script = store.loadScriptFile("sliding_window_counter.lua");
  const raw = await store.evalScript(script, [kPrev, kCurr], [limit, windowMs, now]);
  return toResult(Algorithm.SLIDING_WINDOW_COUNTER, limit, raw, now);
}

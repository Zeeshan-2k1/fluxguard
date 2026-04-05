import type { Store } from "../store/Store.js";
import { Algorithm, type RateLimitResult } from "../types.js";

function baseResult(
  algorithm: Algorithm,
  limit: number,
  allowed: boolean,
  remaining: number,
  resetMs: number,
  retryAfterMs?: number,
): RateLimitResult {
  return {
    allowed,
    limit,
    remaining: Math.max(0, remaining),
    resetMs,
    retryAfterMs,
    algorithm,
  };
}

export async function checkFixedWindowLocal(
  store: Store,
  prefix: string,
  id: string,
  limit: number,
  windowMs: number,
  now: number,
): Promise<RateLimitResult> {
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const k = `${prefix}${id}:${windowStart}`;
  const raw = await store.get(k);
  const count = raw ? parseInt(raw, 10) : 0;
  const next = count + 1;
  const resetMs = windowStart + windowMs;
  if (next > limit) {
    return baseResult(Algorithm.FIXED_WINDOW, limit, false, 0, resetMs, resetMs - now);
  }
  await store.set(k, String(next), windowMs * 2);
  return baseResult(Algorithm.FIXED_WINDOW, limit, true, limit - next, resetMs);
}

export async function checkTokenBucketLocal(
  store: Store,
  prefix: string,
  id: string,
  limit: number,
  windowMs: number,
  now: number,
): Promise<RateLimitResult> {
  const capacity = limit;
  const refillPerMs = limit / windowMs;
  const tokensKey = `${prefix}${id}:tokens`;
  const lastKey = `${prefix}${id}:last_refill`;
  const rawT = await store.get(tokensKey);
  const rawL = await store.get(lastKey);
  let tokens = rawT != null ? parseFloat(rawT) : capacity;
  const last = rawL != null ? parseInt(rawL, 10) : now;
  const delta = Math.max(0, now - last);
  tokens = Math.min(capacity, tokens + delta * refillPerMs);
  if (tokens < 1) {
    const need = 1 - tokens;
    const retryAfterMs = Math.ceil(need / refillPerMs);
    const fullReset = now + Math.ceil(capacity / refillPerMs);
    return baseResult(
      Algorithm.TOKEN_BUCKET,
      limit,
      false,
      0,
      fullReset,
      retryAfterMs,
    );
  }
  tokens -= 1;
  await store.set(tokensKey, String(tokens), windowMs * 3);
  await store.set(lastKey, String(now), windowMs * 3);
  const remaining = Math.floor(tokens);
  const fullReset = now + Math.ceil((capacity - tokens) / refillPerMs);
  return baseResult(Algorithm.TOKEN_BUCKET, limit, true, remaining, fullReset);
}

export async function checkSlidingWindowLogLocal(
  store: Store,
  prefix: string,
  id: string,
  limit: number,
  windowMs: number,
  now: number,
): Promise<RateLimitResult> {
  const k = `${prefix}${id}:log`;
  const raw = await store.get(k);
  let entries: number[] = [];
  if (raw) {
    try {
      entries = JSON.parse(raw) as number[];
    } catch {
      entries = [];
    }
  }
  const cutoff = now - windowMs;
  entries = entries.filter((t) => t > cutoff).sort((a, b) => a - b);
  const resetMs = entries.length > 0 ? entries[0]! + windowMs : now + windowMs;
  if (entries.length >= limit) {
    const oldest = entries[0]!;
    return baseResult(
      Algorithm.SLIDING_WINDOW_LOG,
      limit,
      false,
      0,
      oldest + windowMs,
      oldest + windowMs - now,
    );
  }
  entries.push(now);
  await store.set(k, JSON.stringify(entries), windowMs * 2);
  return baseResult(Algorithm.SLIDING_WINDOW_LOG, limit, true, limit - entries.length, resetMs);
}

export async function checkSlidingWindowCounterLocal(
  store: Store,
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
  const prev = parseInt((await store.get(kPrev)) ?? "0", 10) || 0;
  const curr = parseInt((await store.get(kCurr)) ?? "0", 10) || 0;
  const elapsed = now % windowMs;
  const weight = 1 - elapsed / windowMs;
  const estimated = Math.floor(prev * weight) + curr;
  const resetMs = currStart + windowMs;
  if (estimated >= limit) {
    return baseResult(
      Algorithm.SLIDING_WINDOW_COUNTER,
      limit,
      false,
      0,
      resetMs,
      resetMs - now,
    );
  }
  await store.set(kCurr, String(curr + 1), windowMs * 2);
  await store.set(kPrev, String(prev), windowMs * 2);
  const nextEstimated = estimated + 1;
  return baseResult(
    Algorithm.SLIDING_WINDOW_COUNTER,
    limit,
    true,
    Math.max(0, limit - nextEstimated),
    resetMs,
  );
}

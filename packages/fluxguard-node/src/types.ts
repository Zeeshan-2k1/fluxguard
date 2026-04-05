import type { Redis as RedisClient, RedisOptions } from "ioredis";

export enum Algorithm {
  FIXED_WINDOW = "FIXED_WINDOW",
  SLIDING_WINDOW_LOG = "SLIDING_WINDOW_LOG",
  SLIDING_WINDOW_COUNTER = "SLIDING_WINDOW_COUNTER",
  TOKEN_BUCKET = "TOKEN_BUCKET",
}

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Epoch ms when the current window resets or limit fully replenishes (best effort). */
  resetMs: number;
  /** Suggested retry-after in ms when throttled. */
  retryAfterMs?: number;
  algorithm: Algorithm;
};

export type FluxGuardMetricsSnapshot = {
  totalChecks: number;
  allowed: number;
  throttled: number;
  redisErrors: number;
};

export type FluxGuardEvents = {
  onAllowed?: (key: string, result: RateLimitResult) => void;
  onThrottled?: (key: string, result: RateLimitResult) => void;
  onRedisError?: (err: unknown) => void;
};

export type FluxGuardConfig = {
  algorithm: Algorithm;
  /** Max requests (or burst capacity for token bucket). */
  limit: number;
  windowMs: number;
  /** Redis connection — omit for in-memory limiting. */
  redis?: RedisOptions | RedisClient;
  keyPrefix?: string;
  /** Injected clock — default `Date.now`. */
  nowFn?: () => number;
  failOpen?: boolean;
  /** Optional external metrics hook — receives snapshot after each successful check path. */
  metrics?: { record?: (s: FluxGuardMetricsSnapshot) => void };
  events?: FluxGuardEvents;
};

import {
  checkFixedWindowLocal,
  checkSlidingWindowCounterLocal,
  checkSlidingWindowLogLocal,
  checkTokenBucketLocal,
} from "./engine/localChecks.js";
import { runRedisCheck } from "./engine/redisChecks.js";
import { LocalStore } from "./store/LocalStore.js";
import { RedisStore } from "./store/RedisStore.js";
import type { Store } from "./store/Store.js";
import {
  Algorithm,
  type FluxGuardConfig,
  type FluxGuardMetricsSnapshot,
  type RateLimitResult,
} from "./types.js";

export class FluxGuard {
  private readonly store: Store;
  private readonly prefix: string;
  private readonly nowFn: () => number;
  private readonly config: FluxGuardConfig;
  private metrics: FluxGuardMetricsSnapshot = {
    totalChecks: 0,
    allowed: 0,
    throttled: 0,
    redisErrors: 0,
  };

  constructor(private readonly cfg: FluxGuardConfig) {
    this.config = cfg;
    this.prefix = cfg.keyPrefix ?? "fluxguard:";
    this.nowFn = cfg.nowFn ?? (() => Date.now());
    if (cfg.redis) {
      const r = cfg.redis as object;
      const isClient = "connect" in r && typeof (r as { connect?: unknown }).connect === "function";
      this.store = new RedisStore(cfg.redis, !isClient);
    } else {
      this.store = new LocalStore(this.nowFn);
    }
  }

  getMetrics(): FluxGuardMetricsSnapshot {
    return { ...this.metrics };
  }

  /** Merge event recording for external metrics (e.g. Prometheus). */
  onMetricsRecord(fn: (snapshot: FluxGuardMetricsSnapshot) => void): void {
    const prev = this.config.metrics?.record;
    this.config.metrics = {
      ...this.config.metrics,
      record: (s) => {
        prev?.(s);
        fn(s);
      },
    };
  }

  async check(key: string): Promise<RateLimitResult> {
    this.metrics.totalChecks += 1;
    try {
      let result: RateLimitResult;
      if (this.store instanceof RedisStore) {
        result = await runRedisCheck(
          this.store,
          this.prefix,
          key,
          this.cfg.algorithm,
          this.cfg.limit,
          this.cfg.windowMs,
          this.nowFn(),
        );
      } else {
        result = await this.checkLocal(key);
      }
      if (result.allowed) {
        this.metrics.allowed += 1;
        this.config.events?.onAllowed?.(key, result);
      } else {
        this.metrics.throttled += 1;
        this.config.events?.onThrottled?.(key, result);
      }
      this.config.metrics?.record?.(this.getMetrics());
      return result;
    } catch (err) {
      if (this.store instanceof RedisStore) {
        this.metrics.redisErrors += 1;
        this.config.events?.onRedisError?.(err);
        if (this.cfg.failOpen !== false) {
          const now = this.nowFn();
          const allowed: RateLimitResult = {
            allowed: true,
            limit: this.cfg.limit,
            remaining: this.cfg.limit,
            resetMs: now + this.cfg.windowMs,
            algorithm: this.cfg.algorithm,
          };
          this.metrics.allowed += 1;
          this.config.metrics?.record?.(this.getMetrics());
          return allowed;
        }
      }
      throw err;
    }
  }

  private async checkLocal(key: string): Promise<RateLimitResult> {
    const now = this.nowFn();
    const { algorithm, limit, windowMs } = this.cfg;
    switch (algorithm) {
      case Algorithm.FIXED_WINDOW:
        return checkFixedWindowLocal(this.store, this.prefix, key, limit, windowMs, now);
      case Algorithm.TOKEN_BUCKET:
        return checkTokenBucketLocal(this.store, this.prefix, key, limit, windowMs, now);
      case Algorithm.SLIDING_WINDOW_LOG:
        return checkSlidingWindowLogLocal(this.store, this.prefix, key, limit, windowMs, now);
      case Algorithm.SLIDING_WINDOW_COUNTER:
        return checkSlidingWindowCounterLocal(this.store, this.prefix, key, limit, windowMs, now);
      default:
        throw new Error(`Unsupported algorithm: ${String(algorithm)}`);
    }
  }
}

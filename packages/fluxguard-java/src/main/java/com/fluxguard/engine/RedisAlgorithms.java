package com.fluxguard.engine;

import com.fluxguard.core.Algorithm;
import com.fluxguard.core.RateLimitResult;
import com.fluxguard.store.RedisStore;
import java.util.List;
import java.util.OptionalLong;
import java.util.UUID;

public final class RedisAlgorithms {

  private RedisAlgorithms() {}

  public static RateLimitResult run(
      RedisStore store,
      String prefix,
      String id,
      Algorithm algorithm,
      int limit,
      long windowMs,
      long now) {
    return switch (algorithm) {
      case FIXED_WINDOW -> fixedWindow(store, prefix, id, limit, windowMs, now);
      case TOKEN_BUCKET -> tokenBucket(store, prefix, id, limit, windowMs, now);
      case SLIDING_WINDOW_LOG -> slidingLog(store, prefix, id, limit, windowMs, now);
      case SLIDING_WINDOW_COUNTER -> slidingCounter(store, prefix, id, limit, windowMs, now);
    };
  }

  private static RateLimitResult fixedWindow(
      RedisStore store, String prefix, String id, int limit, long windowMs, long now) {
    long windowStart = (now / windowMs) * windowMs;
    String key = prefix + id + ":" + windowStart;
    List<Object> row =
        store.evalScriptFile(
            "fixed_window.lua",
            List.of(key),
            List.of(
                String.valueOf(limit),
                String.valueOf(windowMs),
                String.valueOf(now),
                String.valueOf(windowStart)));
    return toResult(Algorithm.FIXED_WINDOW, limit, row, now);
  }

  private static RateLimitResult tokenBucket(
      RedisStore store, String prefix, String id, int limit, long windowMs, long now) {
    String k1 = prefix + id + ":tokens";
    String k2 = prefix + id + ":last_refill";
    List<Object> row =
        store.evalScriptFile(
            "token_bucket.lua",
            List.of(k1, k2),
            List.of(String.valueOf(limit), String.valueOf(windowMs), String.valueOf(now)));
    return toResult(Algorithm.TOKEN_BUCKET, limit, row, now);
  }

  private static RateLimitResult slidingLog(
      RedisStore store, String prefix, String id, int limit, long windowMs, long now) {
    String key = prefix + id + ":log";
    String member = now + "-" + UUID.randomUUID();
    List<Object> row =
        store.evalScriptFile(
            "sliding_window_log.lua",
            List.of(key),
            List.of(
                String.valueOf(limit),
                String.valueOf(windowMs),
                String.valueOf(now),
                member));
    return toResult(Algorithm.SLIDING_WINDOW_LOG, limit, row, now);
  }

  private static RateLimitResult slidingCounter(
      RedisStore store, String prefix, String id, int limit, long windowMs, long now) {
    long currStart = (now / windowMs) * windowMs;
    long prevStart = currStart - windowMs;
    String kPrev = prefix + id + ":" + prevStart;
    String kCurr = prefix + id + ":" + currStart;
    List<Object> row =
        store.evalScriptFile(
            "sliding_window_counter.lua",
            List.of(kPrev, kCurr),
            List.of(String.valueOf(limit), String.valueOf(windowMs), String.valueOf(now)));
    return toResult(Algorithm.SLIDING_WINDOW_COUNTER, limit, row, now);
  }

  private static RateLimitResult toResult(Algorithm algorithm, int limit, List<Object> row, long now) {
    long allowed = toLong(row.get(0));
    long remaining = toLong(row.get(1));
    long resetMs = toLong(row.get(3));
    OptionalLong retry =
        row.size() > 4 && toLong(row.get(4)) > 0
            ? OptionalLong.of(toLong(row.get(4)))
            : OptionalLong.empty();
    return new RateLimitResult(
        allowed == 1,
        limit,
        (int) Math.max(0, Math.min(limit, remaining)),
        resetMs,
        retry,
        algorithm);
  }

  private static long toLong(Object o) {
    if (o == null) return 0;
    if (o instanceof Number n) return n.longValue();
    return Long.parseLong(o.toString());
  }
}

package io.github.zeeshan2k1.engine;

import io.github.zeeshan2k1.core.Algorithm;
import io.github.zeeshan2k1.core.RateLimitResult;
import io.github.zeeshan2k1.store.Store;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.OptionalLong;

public final class LocalAlgorithms {

  private LocalAlgorithms() {}

  public static RateLimitResult fixedWindow(
      Store store, String prefix, String id, int limit, long windowMs, long now) {
    long windowStart = (now / windowMs) * windowMs;
    String k = prefix + id + ":" + windowStart;
    String raw = store.get(k);
    int count = raw == null ? 0 : Integer.parseInt(raw);
    int next = count + 1;
    long resetMs = windowStart + windowMs;
    if (next > limit) {
      return new RateLimitResult(
          false, limit, 0, resetMs, OptionalLong.of(resetMs - now), Algorithm.FIXED_WINDOW);
    }
    store.set(k, String.valueOf(next), windowMs * 2);
    return new RateLimitResult(
        true, limit, limit - next, resetMs, OptionalLong.empty(), Algorithm.FIXED_WINDOW);
  }

  public static RateLimitResult tokenBucket(
      Store store, String prefix, String id, int limit, long windowMs, long now) {
    int capacity = limit;
    double refillPerMs = (double) limit / (double) windowMs;
    String tokensKey = prefix + id + ":tokens";
    String lastKey = prefix + id + ":last_refill";
    String rawT = store.get(tokensKey);
    String rawL = store.get(lastKey);
    double tokens = rawT == null ? capacity : Double.parseDouble(rawT);
    long last = rawL == null ? now : Long.parseLong(rawL);
    long delta = Math.max(0, now - last);
    tokens = Math.min(capacity, tokens + delta * refillPerMs);
    long fullReset = now + (long) Math.ceil(capacity / refillPerMs);
    if (tokens < 1) {
      double need = 1 - tokens;
      long retryAfter = (long) Math.ceil(need / refillPerMs);
      return new RateLimitResult(
          false, limit, 0, fullReset, OptionalLong.of(retryAfter), Algorithm.TOKEN_BUCKET);
    }
    tokens -= 1;
    store.set(tokensKey, String.valueOf(tokens), windowMs * 3);
    store.set(lastKey, String.valueOf(now), windowMs * 3);
    int remaining = (int) Math.floor(tokens);
    return new RateLimitResult(
        true, limit, remaining, fullReset, OptionalLong.empty(), Algorithm.TOKEN_BUCKET);
  }

  public static RateLimitResult slidingWindowLog(
      Store store, String prefix, String id, int limit, long windowMs, long now) {
    String k = prefix + id + ":log";
    String raw = store.get(k);
    List<Long> entries = new ArrayList<>();
    if (raw != null && !raw.isEmpty()) {
      String[] parts = raw.split(",");
      for (String p : parts) {
        if (!p.isEmpty()) {
          entries.add(Long.parseLong(p));
        }
      }
    }
    long cutoff = now - windowMs;
    entries.removeIf(t -> t <= cutoff);
    entries.sort(Comparator.naturalOrder());
    long resetMs = entries.isEmpty() ? now + windowMs : entries.get(0) + windowMs;
    if (entries.size() >= limit) {
      long oldest = entries.get(0);
      long r = oldest + windowMs;
      return new RateLimitResult(
          false, limit, 0, r, OptionalLong.of(r - now), Algorithm.SLIDING_WINDOW_LOG);
    }
    entries.add(now);
    StringBuilder sb = new StringBuilder();
    for (int i = 0; i < entries.size(); i++) {
      if (i > 0) sb.append(',');
      sb.append(entries.get(i));
    }
    store.set(k, sb.toString(), windowMs * 2);
    return new RateLimitResult(
        true,
        limit,
        limit - entries.size(),
        resetMs,
        OptionalLong.empty(),
        Algorithm.SLIDING_WINDOW_LOG);
  }

  public static RateLimitResult slidingWindowCounter(
      Store store, String prefix, String id, int limit, long windowMs, long now) {
    long currStart = (now / windowMs) * windowMs;
    long prevStart = currStart - windowMs;
    String kPrev = prefix + id + ":" + prevStart;
    String kCurr = prefix + id + ":" + currStart;
    int prev = parseInt(store.get(kPrev));
    int curr = parseInt(store.get(kCurr));
    long elapsed = now % windowMs;
    double weight = 1 - (elapsed / (double) windowMs);
    int estimated = (int) Math.floor(prev * weight) + curr;
    long resetMs = currStart + windowMs;
    if (estimated >= limit) {
      return new RateLimitResult(
          false, limit, 0, resetMs, OptionalLong.of(resetMs - now), Algorithm.SLIDING_WINDOW_COUNTER);
    }
    store.set(kCurr, String.valueOf(curr + 1), windowMs * 2);
    store.set(kPrev, String.valueOf(prev), windowMs * 2);
    int nextEstimated = estimated + 1;
    return new RateLimitResult(
        true,
        limit,
        Math.max(0, limit - nextEstimated),
        resetMs,
        OptionalLong.empty(),
        Algorithm.SLIDING_WINDOW_COUNTER);
  }

  private static int parseInt(String s) {
    if (s == null || s.isEmpty()) return 0;
    return Integer.parseInt(s);
  }
}

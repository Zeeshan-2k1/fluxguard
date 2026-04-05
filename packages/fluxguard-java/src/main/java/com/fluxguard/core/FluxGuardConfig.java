package com.fluxguard.core;

import io.lettuce.core.RedisClient;
import java.util.function.LongSupplier;

public record FluxGuardConfig(
    Algorithm algorithm,
    int limit,
    long windowMs,
    String keyPrefix,
    LongSupplier nowFn,
    boolean failOpen,
    RedisClient redisClient) {

  public FluxGuardConfig {
    if (keyPrefix == null || keyPrefix.isEmpty()) {
      keyPrefix = "fluxguard:";
    }
    if (nowFn == null) {
      nowFn = System::currentTimeMillis;
    }
  }

  public static FluxGuardConfig local(
      Algorithm algorithm, int limit, long windowMs, LongSupplier nowFn) {
    return new FluxGuardConfig(algorithm, limit, windowMs, "fluxguard:", nowFn, true, null);
  }
}

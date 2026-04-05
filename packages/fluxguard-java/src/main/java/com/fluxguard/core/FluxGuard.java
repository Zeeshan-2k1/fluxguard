package com.fluxguard.core;

import com.fluxguard.engine.LocalAlgorithms;
import com.fluxguard.engine.RedisAlgorithms;
import com.fluxguard.store.LocalStore;
import com.fluxguard.store.RedisStore;
import com.fluxguard.store.Store;
import io.lettuce.core.RedisClient;
import io.lettuce.core.api.StatefulRedisConnection;

public final class FluxGuard implements AutoCloseable {
  private final FluxGuardConfig config;
  private final Store store;
  private final RedisStore redisStore;
  private final boolean useRedis;
  private final java.util.function.LongSupplier nowFn;
  private final String prefix;
  private final StatefulRedisConnection<String, String> redisConnection;
  private final RedisClient redisClient;

  private long totalChecks;
  private long allowed;
  private long throttled;
  private long redisErrors;

  public FluxGuard(FluxGuardConfig config) {
    this.config = config;
    this.prefix = config.keyPrefix();
    this.nowFn = config.nowFn();
    if (config.redisClient() != null) {
      this.redisClient = config.redisClient();
      this.redisConnection = redisClient.connect();
      this.redisStore = new RedisStore(redisConnection.sync());
      this.store = redisStore;
      this.useRedis = true;
    } else {
      this.redisClient = null;
      this.redisConnection = null;
      this.redisStore = null;
      this.store = new LocalStore(config.nowFn());
      this.useRedis = false;
    }
  }

  @Override
  public void close() {
    if (redisConnection != null) {
      redisConnection.close();
    }
    if (redisClient != null) {
      redisClient.shutdown();
    }
  }

  public RateLimitResult check(String key) {
    totalChecks++;
    long now = nowFn.getAsLong();
    try {
      RateLimitResult result;
      if (useRedis) {
        result =
            RedisAlgorithms.run(
                redisStore,
                prefix,
                key,
                config.algorithm(),
                config.limit(),
                config.windowMs(),
                now);
      } else {
        result = checkLocal(key, now);
      }
      if (result.allowed()) {
        allowed++;
      } else {
        throttled++;
      }
      return result;
    } catch (Exception e) {
      if (useRedis) {
        redisErrors++;
        if (config.failOpen()) {
          allowed++;
          return new RateLimitResult(
              true,
              config.limit(),
              config.limit(),
              now + config.windowMs(),
              java.util.OptionalLong.empty(),
              config.algorithm());
        }
      }
      throw new RuntimeException(e);
    }
  }

  private RateLimitResult checkLocal(String key, long now) {
    int limit = config.limit();
    long windowMs = config.windowMs();
    Algorithm a = config.algorithm();
    if (a == Algorithm.FIXED_WINDOW) {
      return LocalAlgorithms.fixedWindow(store, prefix, key, limit, windowMs, now);
    }
    if (a == Algorithm.TOKEN_BUCKET) {
      return LocalAlgorithms.tokenBucket(store, prefix, key, limit, windowMs, now);
    }
    if (a == Algorithm.SLIDING_WINDOW_LOG) {
      return LocalAlgorithms.slidingWindowLog(store, prefix, key, limit, windowMs, now);
    }
    if (a == Algorithm.SLIDING_WINDOW_COUNTER) {
      return LocalAlgorithms.slidingWindowCounter(store, prefix, key, limit, windowMs, now);
    }
    throw new IllegalStateException("Unhandled algorithm: " + a);
  }

  public long getTotalChecks() {
    return totalChecks;
  }

  public long getAllowed() {
    return allowed;
  }

  public long getThrottled() {
    return throttled;
  }

  public long getRedisErrors() {
    return redisErrors;
  }
}

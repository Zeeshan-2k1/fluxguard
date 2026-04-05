// Registers one FluxGuard bean per benchmark algorithm (shared Redis cluster, distinct key prefixes).
package com.fluxguard.example;

import com.fluxguard.core.Algorithm;
import com.fluxguard.core.FluxGuard;
import com.fluxguard.core.FluxGuardConfig;
import io.lettuce.core.RedisClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class BenchmarkFluxGuardsConfig {

  private static final int BENCH_LIMIT = 500;
  private static final long BENCH_WINDOW_MS = 1000L;

  @Bean(destroyMethod = "close")
  public FluxGuard benchmarkFixedWindow(@Value("${fluxguard.redis.uri}") String redisUri) {
    RedisClient client = RedisClient.create(redisUri);
    FluxGuardConfig cfg =
        new FluxGuardConfig(
            Algorithm.FIXED_WINDOW,
            BENCH_LIMIT,
            BENCH_WINDOW_MS,
            "bench:java:fw:",
            System::currentTimeMillis,
            true,
            client);
    return new FluxGuard(cfg);
  }

  @Bean(destroyMethod = "close")
  public FluxGuard benchmarkSlidingWindowCounter(@Value("${fluxguard.redis.uri}") String redisUri) {
    RedisClient client = RedisClient.create(redisUri);
    FluxGuardConfig cfg =
        new FluxGuardConfig(
            Algorithm.SLIDING_WINDOW_COUNTER,
            BENCH_LIMIT,
            BENCH_WINDOW_MS,
            "bench:java:sw:",
            System::currentTimeMillis,
            true,
            client);
    return new FluxGuard(cfg);
  }

  @Bean(destroyMethod = "close")
  public FluxGuard benchmarkTokenBucket(@Value("${fluxguard.redis.uri}") String redisUri) {
    RedisClient client = RedisClient.create(redisUri);
    FluxGuardConfig cfg =
        new FluxGuardConfig(
            Algorithm.TOKEN_BUCKET,
            BENCH_LIMIT,
            BENCH_WINDOW_MS,
            "bench:java:tb:",
            System::currentTimeMillis,
            true,
            client);
    return new FluxGuard(cfg);
  }
}

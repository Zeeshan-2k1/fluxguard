// REST endpoints used by JMeter benchmark plans (ping + algorithm routes).
package com.fluxguard.example;

import com.fluxguard.core.FluxGuard;
import com.fluxguard.core.RateLimitResult;
import java.util.Map;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class BenchmarkController {

  private final FluxGuard fixedWindow;
  private final FluxGuard slidingWindowCounter;
  private final FluxGuard tokenBucket;

  public BenchmarkController(
      @Qualifier("benchmarkFixedWindow") FluxGuard fixedWindow,
      @Qualifier("benchmarkSlidingWindowCounter") FluxGuard slidingWindowCounter,
      @Qualifier("benchmarkTokenBucket") FluxGuard tokenBucket) {
    this.fixedWindow = fixedWindow;
    this.slidingWindowCounter = slidingWindowCounter;
    this.tokenBucket = tokenBucket;
  }

  @GetMapping("/api/benchmark/ping")
  public Map<String, Object> ping() {
    return Map.of("ok", true);
  }

  @GetMapping("/api/benchmark/test/fixed-window")
  public ResponseEntity<?> fixedWindow(
      @RequestHeader(value = "x-api-key", defaultValue = "anon") String apiKey) {
    return respond(fixedWindow.check(apiKey));
  }

  @GetMapping("/api/benchmark/test/sliding-window-counter")
  public ResponseEntity<?> slidingWindow(
      @RequestHeader(value = "x-api-key", defaultValue = "anon") String apiKey) {
    return respond(slidingWindowCounter.check(apiKey));
  }

  @GetMapping("/api/benchmark/test/token-bucket")
  public ResponseEntity<?> tokenBucket(
      @RequestHeader(value = "x-api-key", defaultValue = "anon") String apiKey) {
    return respond(tokenBucket.check(apiKey));
  }

  private static ResponseEntity<?> respond(RateLimitResult r) {
    if (!r.allowed()) {
      return ResponseEntity.status(429).body(Map.of("error", "Too Many Requests"));
    }
    return ResponseEntity.ok(Map.of("ok", true));
  }
}

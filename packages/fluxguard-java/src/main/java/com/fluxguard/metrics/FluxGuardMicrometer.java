package com.fluxguard.metrics;

import com.fluxguard.core.FluxGuard;
import io.micrometer.core.instrument.MeterRegistry;

public final class FluxGuardMicrometer {

  private FluxGuardMicrometer() {}

  /** Register gauges that read current counters from {@link FluxGuard}. */
  public static void bindGauges(MeterRegistry registry, FluxGuard guard, String namePrefix) {
    registry.gauge(namePrefix + ".checks.total", guard, FluxGuard::getTotalChecks);
    registry.gauge(namePrefix + ".allowed.total", guard, FluxGuard::getAllowed);
    registry.gauge(namePrefix + ".throttled.total", guard, FluxGuard::getThrottled);
    registry.gauge(namePrefix + ".redis.errors.total", guard, FluxGuard::getRedisErrors);
  }
}

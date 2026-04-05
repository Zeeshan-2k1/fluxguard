import type { Counter, Registry } from "prom-client";
import { collectDefaultMetrics, Counter as PCounter, Registry as PRegistry } from "prom-client";
import type { FluxGuard } from "../FluxGuard.js";

export type PrometheusMetrics = {
  registry: Registry;
  checksTotal: Counter<string>;
  allowedTotal: Counter<string>;
  throttledTotal: Counter<string>;
  redisErrorsTotal: Counter<string>;
};

export function createFluxGuardPrometheusMetrics(
  limiter: FluxGuard,
  options: { prefix?: string; collectDefault?: boolean } = {},
): PrometheusMetrics {
  const prefix = options.prefix ?? "fluxguard_";
  const registry = new PRegistry();
  if (options.collectDefault !== false) {
    collectDefaultMetrics({ register: registry });
  }

  const checksTotal = new PCounter({
    name: `${prefix}checks_total`,
    help: "Total rate limit checks",
    registers: [registry],
  });

  const allowedTotal = new PCounter({
    name: `${prefix}allowed_total`,
    help: "Allowed requests",
    registers: [registry],
  });

  const throttledTotal = new PCounter({
    name: `${prefix}throttled_total`,
    help: "Throttled requests",
    registers: [registry],
  });

  const redisErrorsTotal = new PCounter({
    name: `${prefix}redis_errors_total`,
    help: "Redis errors in rate limiter",
    registers: [registry],
  });

  let last = limiter.getMetrics();
  limiter.onMetricsRecord((s) => {
    const dCheck = s.totalChecks - last.totalChecks;
    const dAllowed = s.allowed - last.allowed;
    const dThrottled = s.throttled - last.throttled;
    const dErr = s.redisErrors - last.redisErrors;
    last = { ...s };
    if (dCheck > 0) checksTotal.inc(dCheck);
    if (dAllowed > 0) allowedTotal.inc(dAllowed);
    if (dThrottled > 0) throttledTotal.inc(dThrottled);
    if (dErr > 0) redisErrorsTotal.inc(dErr);
  });

  return {
    registry,
    checksTotal,
    allowedTotal,
    throttledTotal,
    redisErrorsTotal,
  };
}

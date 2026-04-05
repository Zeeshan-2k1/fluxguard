// Artillery processor: per-request latency and status tracking, end-of-run percentile summary and NFR-01 check vs baseline p99.
const fs = require("fs");
const path = require("path");

const latencies = [];
const statusCounts = { ok: 0, throttle: 0, err: 0 };

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

function stampRequest(requestParams, context, ee, next) {
  context.vars._fgStart = Date.now();
  return next();
}

function afterResponse(requestParams, response, context, ee, next) {
  const start = context.vars._fgStart;
  let ms = 0;
  if (typeof start === "number") {
    ms = Math.max(0, Date.now() - start);
  } else if (response && response.timings && response.timings.phases) {
    const ph = response.timings.phases;
    ms =
      Number(ph.response ?? ph.firstByte ?? ph.total ?? ph.ws ?? 0) ||
      Number(ph.socket ?? 0) + Number(ph.lookup ?? 0);
  }
  latencies.push(ms);

  const code = response && response.statusCode;
  if (code === 200) statusCounts.ok += 1;
  else if (code === 429) statusCounts.throttle += 1;
  else statusCounts.err += 1;

  return next();
}

function readBaselineP99() {
  const p = path.join(__dirname, "..", "results", "baseline_node_latest.json");
  try {
    const raw = fs.readFileSync(p, "utf8");
    const data = JSON.parse(raw);
    const agg = data.aggregate || data;
    const sum = (agg.summaries && agg.summaries["http.response_time"]) || {};
    const p99 = sum.p99 != null ? sum.p99 : sum["99th"] ?? sum.p99;
    if (typeof p99 === "number" && !Number.isNaN(p99)) return p99;
  } catch {
    /* missing or invalid baseline */
  }
  return null;
}

function onComplete(stats) {
  const sorted = [...latencies].sort((a, b) => a - b);
  const p50 = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  const p99 = percentile(sorted, 99);

  const total = statusCounts.ok + statusCounts.throttle + statusCounts.err || 1;
  const pct = (n) => ((n / total) * 100).toFixed(1);

  let nfr = "SKIP";
  if (process.env.FG_SKIP_NFR === "1") {
    nfr = "SKIP";
  } else {
    const baselineP99 = readBaselineP99();
    if (baselineP99 != null) {
      const delta = p99 - baselineP99;
      nfr = delta < 2 ? "PASS" : "FAIL";
      if (delta >= 2) {
        console.warn(
          `[NFR-01] p99 overhead ${delta.toFixed(2)}ms vs baseline p99 ${baselineP99.toFixed(2)}ms (threshold <2ms)`,
        );
      }
    } else {
      console.warn("[NFR-01] Skipped: results/baseline_node_latest.json not found or has no p99.");
    }
  }

  const line = "─".repeat(43);
  const row = (a, b) => `│  ${a.padEnd(12)} │  ${String(b).padEnd(24)} │`;
  console.log(`┌${line}┐`);
  console.log(`│  FluxGuard Benchmark Results            │`);
  console.log(`├──────────────┬──────────────────────────┤`);
  console.log(row("p50", `${p50.toFixed(1)}ms`));
  console.log(row("p95", `${p95.toFixed(1)}ms`));
  console.log(row("p99", `${p99.toFixed(1)}ms`));
  console.log(row("Allowed", `${statusCounts.ok} (${pct(statusCounts.ok)}%)`));
  console.log(row("Throttled", `${statusCounts.throttle} (${pct(statusCounts.throttle)}%)`));
  console.log(row("Errors", `${statusCounts.err} (${pct(statusCounts.err)}%)`));
  console.log(row("NFR-01", nfr));
  console.log(`└──────────────┴──────────────────────────┘`);
}

module.exports = {
  stampRequest,
  afterResponse,
  onComplete,
};

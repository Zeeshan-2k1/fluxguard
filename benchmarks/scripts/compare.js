#!/usr/bin/env node
// Compare two Artillery JSON reports: latency deltas, throttle/error rates, CI-friendly exit codes (1 = hard FAIL).
const fs = require("fs");
const path = require("path");

function loadReport(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function extractMetrics(data) {
  const agg = data.aggregate || data;
  const c = agg.counters || {};
  const requests = Number(c["http.requests"] || 0);
  const c200 = Number(c["http.codes.200"] || 0);
  const c429 = Number(c["http.codes.429"] || 0);
  const throttle_rate = requests ? (c429 / requests) * 100 : 0;
  const errCount = Math.max(0, requests - c200 - c429);
  const error_rate = requests ? (errCount / requests) * 100 : 0;
  const sum = (agg.summaries && agg.summaries["http.response_time"]) || {};
  return {
    p50: Number(sum.p50 ?? sum.median ?? 0),
    p95: Number(sum.p95 ?? 0),
    p99: Number(sum.p99 ?? 0),
    median: Number(sum.median ?? sum.p50 ?? 0),
    error_rate,
    throttle_rate,
  };
}

function fmtMs(n) {
  if (Number.isNaN(n)) return "n/a";
  return `${n.toFixed(1)}ms`;
}

function fmtPct(n) {
  if (Number.isNaN(n)) return "n/a";
  return `${n.toFixed(1)}%`;
}

function formatFileTime(filePath) {
  try {
    const st = fs.statSync(filePath);
    const d = st.mtime;
    const pad = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "(unknown)";
  }
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length < 2) {
    console.error("Usage: node compare.js <runA.json> <runB.json>");
    process.exit(1);
  }
  const fileA = path.resolve(argv[0]);
  const fileB = path.resolve(argv[1]);
  const dataA = loadReport(fileA);
  const dataB = loadReport(fileB);
  const a = extractMetrics(dataA);
  const b = extractMetrics(dataB);

  const dP50 = b.p50 - a.p50;
  const dP95 = b.p95 - a.p95;
  const dP99 = b.p99 - a.p99;
  const dErr = b.error_rate - a.error_rate;
  const dThr = b.throttle_rate - a.throttle_rate;

  /** Latency regression WARN: Run B is worse than Run A by more than 10%. */
  function latRegressionPct(a, b) {
    if (a === 0) return b > 0 ? 100 : 0;
    return ((b - a) / Math.abs(a)) * 100;
  }

  const regP50 = latRegressionPct(a.p50, b.p50);
  const regP95 = latRegressionPct(a.p95, b.p95);
  const regP99 = latRegressionPct(a.p99, b.p99);

  function latStatus(reg) {
    if (reg > 10) return "⚠ WARN";
    return "✓ OK";
  }

  let fail = false;
  let warnCount = 0;

  if (b.error_rate > a.error_rate) fail = true;
  if (b.p99 > 2) fail = true;

  if (regP50 > 10) warnCount++;
  if (regP95 > 10) warnCount++;
  if (regP99 > 10) warnCount++;

  const errStatus = b.error_rate > a.error_rate ? "✗ FAIL" : "✓ OK";
  const thrStatus = "✓ OK";

  console.log("FluxGuard Benchmark Comparison");
  console.log(`Run A: ${fileA}  (${formatFileTime(fileA)})`);
  console.log(`Run B: ${fileB}  (${formatFileTime(fileB)})`);
  console.log("");
  const dMs = (d) => `${d >= 0 ? "+" : ""}${d.toFixed(1)}ms`;
  const dPct = (d) => `${d >= 0 ? "+" : ""}${d.toFixed(1)}%`;

  console.log("Metric          Run A     Run B     Delta     Status");
  console.log("──────────────────────────────────────────────────────");
  console.log(
    `p50 latency     ${fmtMs(a.p50).padEnd(9)} ${fmtMs(b.p50).padEnd(9)} ${dMs(dP50).padEnd(9)} ${latStatus(regP50)}`,
  );
  console.log(
    `p95 latency     ${fmtMs(a.p95).padEnd(9)} ${fmtMs(b.p95).padEnd(9)} ${dMs(dP95).padEnd(9)} ${latStatus(regP95)}`,
  );
  console.log(
    `p99 latency     ${fmtMs(a.p99).padEnd(9)} ${fmtMs(b.p99).padEnd(9)} ${dMs(dP99).padEnd(9)} ${latStatus(regP99)}`,
  );
  console.log(
    `error rate      ${fmtPct(a.error_rate).padEnd(9)} ${fmtPct(b.error_rate).padEnd(9)} ${dPct(dErr).padEnd(9)} ${errStatus}`,
  );
  console.log(
    `throttle rate   ${fmtPct(a.throttle_rate).padEnd(9)} ${fmtPct(b.throttle_rate).padEnd(9)} ${dPct(dThr).padEnd(9)} ${thrStatus}`,
  );
  console.log("");

  if (fail) {
    const reasons = [];
    if (b.error_rate > a.error_rate) reasons.push("error rate increased");
    if (b.p99 > 2) reasons.push("p99 absolute > 2ms on Run B");
    console.log(`Overall: FAIL — ${reasons.join("; ")}`);
    process.exit(1);
  }
  if (warnCount > 0) {
    console.log(`Overall: WARN — ${warnCount} metric(s) exceeded 10% regression threshold`);
    process.exit(0);
  }
  console.log("Overall: PASS");
  process.exit(0);
}

main();

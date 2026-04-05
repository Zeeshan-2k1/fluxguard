#!/usr/bin/env bash
# Drops Redis connections at Toxiproxy and asserts failOpen=200 vs failClosed=429 on the Node chaos routes (chmod +x).
set -euo pipefail

echo "=== Chaos Test: Redis Connection Drop ==="

TOXI_API="${TOXI_API:-http://localhost:8474}"
PROXY_NAME="${PROXY_NAME:-redis}"
BASE="${BASE_URL:-http://localhost:3000}"

curl -sf "${TOXI_API}/version" >/dev/null || {
  echo "FAIL: Toxiproxy API not reachable at ${TOXI_API}"
  exit 1
}

echo "Adding timeout toxic (timeout=0 — drop connections immediately)..."
curl -sf -X POST "${TOXI_API}/proxies/${PROXY_NAME}/toxics" -H "Content-Type: application/json" \
  -d '{"name":"conn_drop","type":"timeout","stream":"upstream","toxicity":1,"attributes":{"timeout":0}}'

sleep 0.5

echo "failOpen=true endpoint (${BASE}/api/benchmark/chaos/fail-open) — expect 200..."
for i in $(seq 1 10); do
  code="$(curl -s -o /dev/null -w "%{http_code}" -H "x-api-key: bench-user-${i}" "${BASE}/api/benchmark/chaos/fail-open")"
  if [[ "${code}" != "200" ]]; then
    echo "FAIL: request ${i} expected HTTP 200, got ${code} (failOpen should allow when Redis is down)"
    curl -sf -X DELETE "${TOXI_API}/proxies/${PROXY_NAME}/toxics/conn_drop" || true
    exit 1
  fi
done

echo "failOpen=false endpoint (${BASE}/api/benchmark/chaos/fail-closed) — expect 429..."
for i in $(seq 1 10); do
  code="$(curl -s -o /dev/null -w "%{http_code}" -H "x-api-key: bench-user-${i}" "${BASE}/api/benchmark/chaos/fail-closed")"
  if [[ "${code}" != "429" ]]; then
    echo "FAIL: request ${i} expected HTTP 429, got ${code} (failClosed should deny when Redis is down)"
    curl -sf -X DELETE "${TOXI_API}/proxies/${PROXY_NAME}/toxics/conn_drop" || true
    exit 1
  fi
done

curl -sf -X DELETE "${TOXI_API}/proxies/${PROXY_NAME}/toxics/conn_drop" || true

echo "PASS: Redis connection drop chaos test"

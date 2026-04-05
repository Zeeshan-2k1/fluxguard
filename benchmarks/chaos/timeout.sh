#!/usr/bin/env bash
# Stalls Redis with a Toxiproxy timeout toxic and asserts responses stay fast with no HTTP 500 (chmod +x).
set -euo pipefail

echo "=== Chaos Test: Redis Timeout ==="

TOXI_API="${TOXI_API:-http://localhost:8474}"
PROXY_NAME="${PROXY_NAME:-redis}"
URL="${BENCH_URL:-http://localhost:3000/api/benchmark/test/sliding-window-counter}"

curl -sf "${TOXI_API}/version" >/dev/null || {
  echo "FAIL: Toxiproxy API not reachable at ${TOXI_API}"
  exit 1
}

echo "Adding timeout toxic (5000ms)..."
curl -sf -X POST "${TOXI_API}/proxies/${PROXY_NAME}/toxics" -H "Content-Type: application/json" \
  -d '{"name":"redis_timeout","type":"timeout","stream":"upstream","toxicity":1,"attributes":{"timeout":5000}}'

sleep 0.5

FAIL=0
for i in $(seq 1 20); do
  out="$(curl -s -o /tmp/fg_chaos_body.txt -w "%{http_code} %{time_total}" -H "x-api-key: bench-user-${i}" "${URL}")"
  code="$(echo "${out}" | awk '{print $1}')"
  t="$(echo "${out}" | awk '{print $2}')"
  # 100ms = 0.1 seconds — compare as float
  awk -v t="${t}" 'BEGIN { exit !(t < 0.101) }' || {
    echo "FAIL: response time ${t}s exceeds 100ms"
    FAIL=1
    break
  }
  if [[ "${code}" == "500" ]]; then
    echo "FAIL: received HTTP 500"
    FAIL=1
    break
  fi
done

curl -sf -X DELETE "${TOXI_API}/proxies/${PROXY_NAME}/toxics/redis_timeout" || true

if [[ "${FAIL}" -ne 0 ]]; then
  echo "FAIL: Redis timeout chaos test"
  exit 1
fi

echo "PASS: Redis timeout chaos test"

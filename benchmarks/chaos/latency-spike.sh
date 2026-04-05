#!/usr/bin/env bash
# Injects Redis latency via Toxiproxy and runs a short Artillery sliding-window load test (chmod +x).
set -euo pipefail

echo "=== Chaos Test: Redis Latency Spike ==="

TOXI_API="${TOXI_API:-http://localhost:8474}"
PROXY_NAME="${PROXY_NAME:-redis}"
REDIS_UPSTREAM="${REDIS_UPSTREAM:-host.docker.internal:6379}"

if ! curl -sf "${TOXI_API}/version" >/dev/null; then
  echo "Starting Toxiproxy (docker)..."
  docker rm -f toxiproxy-chaos 2>/dev/null || true
  docker run -d --rm --name toxiproxy-chaos -p 8474:8474 -p 6380:6380 ghcr.io/shopify/toxiproxy:latest
  for _ in $(seq 1 30); do
    if curl -sf "${TOXI_API}/version" >/dev/null; then
      break
    fi
    sleep 1
  done
fi

if ! curl -sf "${TOXI_API}/proxies/${PROXY_NAME}" >/dev/null; then
  echo "Creating Toxiproxy proxy '${PROXY_NAME}' -> ${REDIS_UPSTREAM}"
  curl -sf -X POST "${TOXI_API}/proxies" -H "Content-Type: application/json" \
    -d "{\"name\":\"${PROXY_NAME}\",\"listen\":\"0.0.0.0:6380\",\"upstream\":\"${REDIS_UPSTREAM}\",\"enabled\":true}"
fi

echo "Adding latency toxic (200ms + 50ms jitter)..."
curl -sf -X POST "${TOXI_API}/proxies/${PROXY_NAME}/toxics" -H "Content-Type: application/json" \
  -d '{"name":"latency_spike","type":"latency","stream":"upstream","toxicity":1,"attributes":{"latency":200,"jitter":50}}'

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export PATH="${ROOT}/node_modules/.bin:${PATH}"
OUT="${ROOT}/benchmarks/results/chaos_latency_spike_${RANDOM}.json"
mkdir -p "${ROOT}/benchmarks/results"

set +e
FG_SKIP_NFR=1 artillery run "${ROOT}/benchmarks/artillery/sliding-window.yml" \
  --overrides '{"config":{"phases":[{"duration":30,"arrivalRate":500,"name":"short"}]}}' \
  --output "${OUT}"
ART_EXIT=$?
set -e

echo "Removing latency toxic..."
curl -sf -X DELETE "${TOXI_API}/proxies/${PROXY_NAME}/toxics/latency_spike" || true

if [[ "${ART_EXIT}" -ne 0 ]]; then
  echo "FAIL: Artillery exited with code ${ART_EXIT}"
  exit 1
fi

# Assert no HTTP 500 in Artillery aggregate counters
node -e "
const fs = require('fs');
const j = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
const c = (j.aggregate && j.aggregate.counters) || {};
const n500 = Number(c['http.codes.500'] || 0);
if (n500 > 0) { console.error('FAIL: saw', n500, 'HTTP 500 responses'); process.exit(1); }
console.log('PASS: no HTTP 500 in report; Artillery exit 0');
" "${OUT}"

echo "PASS: Redis latency spike chaos test"

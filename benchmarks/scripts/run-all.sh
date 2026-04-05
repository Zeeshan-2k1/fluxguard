#!/usr/bin/env bash
# Runs the full benchmark pipeline (Docker, Artillery, optional JMeter, chaos, compare.js, teardown; chmod +x).
set -euo pipefail

SKIP_JAVA=0
for arg in "$@"; do
  if [[ "${arg}" == "--skip-java" ]]; then
    SKIP_JAVA=1
  fi
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export PATH="${ROOT}/node_modules/.bin:${PATH}"
RESULTS="${ROOT}/benchmarks/results"
COMPOSE="${ROOT}/benchmarks/scripts/docker-compose.yml"
COMPARE="${ROOT}/benchmarks/scripts/compare.js"
ART_DIR="${ROOT}/benchmarks/artillery"
JMETER_DIR="${ROOT}/benchmarks/jmeter"
CHAOS_DIR="${ROOT}/benchmarks/chaos"

die() {
  echo "ERROR: $*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

need_cmd docker
need_cmd node
need_cmd curl
if ! command -v artillery >/dev/null 2>&1; then
  die "Artillery not found. From the repo root run: pnpm install (installs devDependency artillery), or: npm install -g artillery"
fi

if [[ "${SKIP_JAVA}" -eq 0 ]]; then
  need_cmd jmeter
  need_cmd java
fi

mkdir -p "${RESULTS}"

PREV_LATEST="${RESULTS}/baseline_node_latest.json"
if [[ -f "${PREV_LATEST}" ]]; then
  cp -f "${PREV_LATEST}" "${RESULTS}/baseline_node_previous.json"
fi

echo "=== Starting benchmark stack (docker compose) ==="
if [[ "${SKIP_JAVA}" -eq 1 ]]; then
  docker compose -f "${COMPOSE}" up -d --build redis toxiproxy fluxguard-node-app
else
  docker compose -f "${COMPOSE}" up -d --build
fi

cleanup() {
  echo "=== Tearing down docker compose ==="
  docker compose -f "${COMPOSE}" down --remove-orphans || true
}
trap cleanup EXIT

wait_http() {
  local url="$1"
  local name="$2"
  local max="${3:-120}"
  local i=0
  while [[ "${i}" -lt "${max}" ]]; do
    if curl -sf "${url}" >/dev/null; then
      echo "${name} is up"
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  die "Timeout waiting for ${name} (${url})"
}

wait_http "http://localhost:3000/api/benchmark/ping" "Node benchmark app" 180
if [[ "${SKIP_JAVA}" -eq 0 ]]; then
  wait_http "http://localhost:8080/api/benchmark/ping" "Java benchmark app" 240
fi

TS="$(date +%Y%m%d_%H%M%S)"

echo "=== Artillery baseline (Node) ==="
FG_SKIP_NFR=1 artillery run "${ART_DIR}/baseline.yml" --output "${RESULTS}/baseline_node_${TS}.json"
cp -f "${RESULTS}/baseline_node_${TS}.json" "${PREV_LATEST}"

run_artillery() {
  local name="$1"
  local file="$2"
  artillery run "${ART_DIR}/${file}" --output "${RESULTS}/${name}_node_${TS}.json"
}

echo "=== Artillery fixed-window ==="
run_artillery "fixed-window" "fixed-window.yml"

echo "=== Artillery sliding-window ==="
run_artillery "sliding-window" "sliding-window.yml"

echo "=== Artillery token-bucket ==="
run_artillery "token-bucket" "token-bucket.yml"

if [[ "${SKIP_JAVA}" -eq 0 ]]; then
  echo "=== JMeter (Java) ==="
  (
    cd "${ROOT}"
    jmeter -n -t "${JMETER_DIR}/baseline.jmx" -j "${RESULTS}/jmeter_baseline_${TS}.log"
    jmeter -n -t "${JMETER_DIR}/fixed-window.jmx" -j "${RESULTS}/jmeter_fixed_${TS}.log"
    jmeter -n -t "${JMETER_DIR}/sliding-window.jmx" -j "${RESULTS}/jmeter_sliding_${TS}.log"
    jmeter -n -t "${JMETER_DIR}/token-bucket.jmx" -j "${RESULTS}/jmeter_token_${TS}.log"
  )
fi

echo "=== Chaos tests ==="
bash "${CHAOS_DIR}/latency-spike.sh"
bash "${CHAOS_DIR}/connection-drop.sh"
bash "${CHAOS_DIR}/timeout.sh"

OVERALL=0

if [[ -f "${RESULTS}/baseline_node_previous.json" ]] && [[ -f "${PREV_LATEST}" ]]; then
  echo "=== compare.js (previous vs current baseline) ==="
  set +e
  node "${COMPARE}" "${RESULTS}/baseline_node_previous.json" "${PREV_LATEST}"
  CMP="$?"
  set -e
  if [[ "${CMP}" -ne 0 ]]; then
    OVERALL=1
  fi
else
  echo "=== compare.js skipped (no previous baseline_node_latest) ==="
fi

if [[ "${OVERALL}" -eq 0 ]]; then
  echo "=== Overall: PASS (no compare FAIL) ==="
else
  echo "=== Overall: FAIL (compare.js reported hard failure) ==="
fi

exit "${OVERALL}"

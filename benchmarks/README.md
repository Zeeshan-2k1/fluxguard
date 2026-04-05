# FluxGuard benchmarks

This folder validates non-functional requirements from the PRD:

- **NFR-01:** Redis overhead adds **&lt;2ms p99** versus the Node.js baseline at **1000 RPS** sustained (see `config/scenarios.yml`).
- **NFR-02:** No race-condition symptoms under concurrent load (covered by load + chaos coverage; extend with dedicated concurrency tests as needed).
- **NFR-03:** Redis failure does **not** crash the app; **failOpen** vs **failClosed** behavior is checked under chaos (see `chaos/`).

Example apps: Node Express at `http://localhost:3000`, Java Spring Boot at `http://localhost:8080`.  
**Redis (from your host):** the benchmark Compose file publishes Redis on **`localhost:16379`** by default so it does not grab **`6379`** (often already used by a local Redis). Apps inside Docker still talk to `redis:6379` on the internal network. To map host `6379` instead, run Compose with `BENCHMARK_REDIS_HOST_PORT=6379`. For chaos, traffic should go through **Toxiproxy** on **`localhost:6380`** (REST API `http://localhost:8474`) so toxics apply without stopping Redis.

## Prerequisites

From the **repository root**, install dependencies (this installs **Artillery** as a devDependency and puts it on `PATH` via `node_modules/.bin` when you run `benchmarks/scripts/run-all.sh`):

```bash
pnpm install
```

| Tool                  | Role                                           |
| --------------------- | ---------------------------------------------- |
| **Node.js** 18+       | `compare.js`, example app                      |
| **Java** 17+          | JMeter targets the Java app                    |
| **Docker**            | `benchmarks/scripts/docker-compose.yml` stack  |
| **Artillery**         | Node load tests (`benchmarks/artillery/`)      |
| **Apache JMeter** 5.x | Java load tests (`benchmarks/jmeter/`)         |
| **Toxiproxy**         | Chaos tests (via Docker image or local binary) |

Install Artillery globally (or use `npx`): `npm install -g artillery`.  
Enable the **expect** plugin if prompted: Artillery 2.x loads `plugins.expect` from the YAML; install `artillery-plugin-expect` if your CLI reports a missing plugin.

## Benchmark environment (Docker)

From the **repository root**:

```bash
docker compose -f benchmarks/scripts/docker-compose.yml up -d --build
```

This starts **Redis**, **Toxiproxy** (proxy `redis` on `0.0.0.0:6380` → `redis:6379`), the **Express** example, and the **Spring Boot** example on the `fluxguard-bench` network. Example apps use **Toxiproxy** as the Redis endpoint so chaos scripts can inject latency/timeouts without editing containers.

Wait until `curl -sf http://localhost:3000/api/benchmark/ping` and `curl -sf http://localhost:8080/api/benchmark/ping` succeed.

## Artillery (Node.js)

Run from repo root (processor paths are relative to `benchmarks/artillery/`):

```bash
export FG_SKIP_NFR=1   # optional: skip NFR-01 row in processor for baseline-only runs
artillery run benchmarks/artillery/baseline.yml --output benchmarks/results/baseline_node_$(date +%Y%m%d_%H%M%S).json
cp benchmarks/results/baseline_node_<timestamp>.json benchmarks/results/baseline_node_latest.json

artillery run benchmarks/artillery/fixed-window.yml --output benchmarks/results/fixed-window_node_<timestamp>.json
artillery run benchmarks/artillery/sliding-window.yml --output benchmarks/results/sliding-window_node_<timestamp>.json
artillery run benchmarks/artillery/token-bucket.yml --output benchmarks/results/token-bucket_node_<timestamp>.json
```

`baseline_node_latest.json` is the **reference p99** for the custom processor’s **NFR-01** line on algorithm runs.

## JMeter (Java)

Non-GUI mode from repo root (JTL paths are under `benchmarks/results/` as in the test plans):

```bash
jmeter -n -t benchmarks/jmeter/baseline.jmx -j benchmarks/results/jmeter.log
jmeter -n -t benchmarks/jmeter/fixed-window.jmx
jmeter -n -t benchmarks/jmeter/sliding-window.jmx
jmeter -n -t benchmarks/jmeter/token-bucket.jmx
```

## Chaos tests

Requires Toxiproxy API at `http://localhost:8474` and proxy name `redis` (created by Docker Compose or `benchmarks/chaos/toxiproxy-config.json`).  
**Host-only runs:** point the Node app at `REDIS_HOST=localhost` `REDIS_PORT=6380` so Redis traffic goes through Toxiproxy.

```bash
bash benchmarks/chaos/latency-spike.sh
bash benchmarks/chaos/connection-drop.sh
bash benchmarks/chaos/timeout.sh
```

## Comparing two Artillery JSON snapshots

```bash
node benchmarks/scripts/compare.js benchmarks/results/run-a.json benchmarks/results/run-b.json
```

Exit codes: **0** = PASS or WARN; **1** = HARD **FAIL** (error-rate regression or p99 absolute &gt; 2ms on Run B, per script rules).

## Pass / fail thresholds

| Check                        | Rule                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **NFR-01 (overhead)**        | `(p99_with_limiter − p99_baseline) < 2ms` (Artillery processor vs `baseline_node_latest.json`)                                              |
| **Errors**                   | **0%** responses that are neither **200** nor **429** on algorithm endpoints (non-429 errors)                                               |
| **Chaos — app availability** | HTTP **200** or **429** only (no **500**) under Redis degradation                                                                           |
| **Chaos — latency** (README) | Responses still within **100ms** when Redis is stalled, if Redis is on the hot path (fail-open / short timeouts)                            |
| **compare.js**               | **FAIL** if error rate increases Run A→B; **FAIL** if Run B **p99 &gt; 2ms** absolute; **WARN** if any latency metric regresses **&gt;10%** |

## Results directory

- Artillery: `benchmarks/results/baseline_node_<timestamp>.json`, `fixed-window_node_<timestamp>.json`, etc., and `baseline_node_latest.json` for NFR-01.
- JMeter: `benchmarks/results/baseline_java_<timestamp>.jtl` (embedded `__time` in the test plan), plus `jmeter_*.log` from `run-all.sh`.
- The directory **`benchmarks/results/` is git-ignored** except **`benchmarks/results/.gitkeep`**, so local runs are not committed.

## Troubleshooting

**`Bind for 0.0.0.0:6379 failed: port is already allocated`** — Something else is using host port 6379 (often a local Redis). The benchmark Compose file maps Redis to **`16379`** on the host by default; pull the latest `benchmarks/scripts/docker-compose.yml` and run again. If a previous `docker compose up` failed mid-way, clean up: `docker compose -f benchmarks/scripts/docker-compose.yml down`.

**Other ports in use** — The stack also uses **3000**, **8080**, **6380**, **8474**. Stop conflicting services or edit the `ports:` sections in `benchmarks/scripts/docker-compose.yml`.

## One-shot runner

```bash
bash benchmarks/scripts/run-all.sh           # Artillery + JMeter + chaos + compare
bash benchmarks/scripts/run-all.sh --skip-java   # Skip JMeter only
```

`run-all.sh` tears down Docker Compose on exit (success or failure).

# FluxGuard

[![CI](https://github.com/Zeeshan-2k1/fluxguard/actions/workflows/ci.yml/badge.svg)](https://github.com/Zeeshan-2k1/fluxguard/actions)
[![npm version](https://img.shields.io/npm/v/fluxguard.svg)](https://www.npmjs.com/package/fluxguard)
[![Maven Central](https://img.shields.io/maven-central/v/io.github.zeeshan-2k1/fluxguard-java.svg)](https://central.sonatype.com/artifact/io.github.zeeshan-2k1/fluxguard-java)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Polyglot distributed rate limiting for Node.js (TypeScript) and Java.**  
Redis-backed atomic enforcement via Lua/EVALSHA. Local in-memory mode included — no Redis required.

---

## The Problem

Most rate limiting libraries break under horizontal scaling.

```
Request 1 → Pod A  (counter: 1)  ✓
Request 2 → Pod B  (counter: 1)  ✓  ← doesn't know about Pod A
Request 3 → Pod C  (counter: 1)  ✓  ← doesn't know about either
```

Each pod maintains its own in-memory counter. A user who should be blocked after
3 requests across 3 pods sees 9 requests go through. `express-rate-limit` without
a Redis store has exactly this problem.

**FluxGuard solves this with a single shared Redis counter — and more importantly,
makes every read-modify-write atomic using Lua scripts executed inside Redis:**

```
Request 1 → Pod A → Redis (counter: 1)  ✓
Request 2 → Pod B → Redis (counter: 2)  ✓
Request 3 → Pod C → Redis (counter: 3)  blocked → 429
```

No race conditions. No double-counting. No stale reads.

---

## Why not existing solutions?

| Library                 | Language      | Distributed?  | Gap                                                                      |
| ----------------------- | ------------- | ------------- | ------------------------------------------------------------------------ |
| `express-rate-limit`    | Node.js       | Plugin needed | Single-instance by default; fixed window only                            |
| `rate-limiter-flexible` | Node.js       | Yes (Redis)   | Multiple algorithms but complex, inconsistent API                        |
| `bucket4j`              | Java          | Yes           | Java-only; no polyglot story                                             |
| `resilience4j`          | Java          | No            | Semaphore-based; no Redis                                                |
| Upstash Ratelimit       | TS            | Yes           | Cloud-locked; paid Redis dependency                                      |
| **FluxGuard**           | **TS + Java** | **Yes**       | **Identical API in both languages; 4 algorithms; zero cloud dependency** |

---

## Features

- **4 algorithms** — Fixed Window, Sliding Window Log, Sliding Window Counter (default), Token Bucket
- **Atomic by design** — all distributed paths use Redis Lua scripts via `EVALSHA`; zero race conditions
- **Polyglot** — identical algorithm semantics, config schema, and result shape in TypeScript and Java
- **Cross-language parity tests** — shared JSON fixture vectors run against both implementations in CI
- **Express middleware** — drop-in factory with auto headers and custom rejection handler
- **Spring Boot auto-configuration** — `@RateLimit` annotation, `HandlerInterceptor`, conditional Redis wiring
- **Fail-open / fail-closed** — Redis outage never crashes your app; configurable policy
- **Observability** — Prometheus (prom-client) hooks for Node.js; Micrometer hooks for Java
- **Local mode** — works without Redis; useful for single-instance apps and local development

---

## Quick Start — Node.js

```bash
npm install fluxguard
# ioredis is a peer dependency if you want distributed mode
npm install ioredis
```

```typescript
import { FluxGuard, Algorithm } from "fluxguard";

const limiter = new FluxGuard({
  algorithm: Algorithm.SLIDING_WINDOW_COUNTER, // default
  limit: 100,
  windowMs: 60_000, // 100 requests per minute
  redis: { host: "localhost", port: 6379 }, // omit for local mode
});

// As Express middleware
app.use("/api", limiter.middleware());

// Or call directly
const result = await limiter.check("user:123");
if (!result.allowed) {
  res.status(429).json({ retryAfter: result.retryAfter });
}
```

Every `check()` call returns a `RateLimitResult`:

```typescript
{
  allowed:     boolean,      // true = request passes
  limit:       number,       // total requests allowed in window
  remaining:   number,       // requests left (never negative)
  resetAt:     number,       // Unix ms when window resets
  retryAfter:  number | null,// ms to wait if throttled
  algorithm:   string,       // e.g. "SLIDING_WINDOW_COUNTER"
}
```

HTTP headers are set automatically on every response:

```
X-RateLimit-Limit:     100
X-RateLimit-Remaining: 43
X-RateLimit-Reset:     1712345678
Retry-After:           17          (only when throttled)
```

---

## Quick Start — Java

```xml
<dependency>
  <groupId>io.github.zeeshan-2k1</groupId>
  <artifactId>fluxguard-java</artifactId>
  <version>0.1.2</version>
</dependency>
```

**Spring Boot — application.yml:**

```yaml
fluxguard:
  enabled: true
  algorithm: SLIDING_WINDOW_COUNTER
  limit: 100
  window-ms: 60000
  redis:
    enabled: true
    uri: redis://localhost:6379
```

**Annotate any handler method:**

```java
@RateLimit(limit = 10, windowMs = 60_000)
@GetMapping("/search")
public ResponseEntity<?> search(...) { ... }
```

**Or use the core API directly:**

```java
FluxGuardConfig config = FluxGuardConfig.builder()
    .algorithm(Algorithm.SLIDING_WINDOW_COUNTER)
    .limit(100)
    .windowMs(60_000)
    .build();

FluxGuard limiter = new FluxGuard(config, redisClient); // redisClient optional
RateLimitResult result = limiter.check("user:123");

if (!result.isAllowed()) {
  response.setStatus(429);
}
```

---

## Algorithms

FluxGuard implements four algorithms. The right choice depends on your traffic shape:

### Fixed Window

Divide time into fixed slots. Count requests per slot. Cheapest in Redis (1 key, `O(1)`).  
**Weakness:** a client can burst 2× the limit by timing requests at a window boundary.  
**Use when:** internal APIs, low-stakes throttling, lowest overhead required.

### Sliding Window Log

Store a timestamp for every request in a Redis sorted set. On each check, expire old
entries and count the rest. Perfectly accurate — zero boundary bursts.  
**Weakness:** memory cost grows with request volume (`O(n)` per identifier).  
**Use when:** low-volume endpoints where accuracy is critical (payments, auth).

### Sliding Window Counter _(default)_

Approximate the sliding window using two fixed-window counters weighted by position:

```
estimated = prev_count × (1 - elapsed/window) + curr_count
```

Accurate within ~1% of a true sliding window. `O(1)` Redis storage. No boundary bursts.  
**Use when:** high-traffic APIs — the best accuracy/cost tradeoff.

### Token Bucket

Tokens refill at a fixed rate up to a maximum capacity. Each request consumes one token.
Allows controlled short bursts while enforcing a sustained average rate.  
**Use when:** search, autocomplete, or any endpoint where short bursts are acceptable.

| Algorithm              | Redis memory             | Burst handling      | Best for                      |
| ---------------------- | ------------------------ | ------------------- | ----------------------------- |
| Fixed Window           | `O(1)` — 1 key           | Boundary vulnerable | Low-stakes, lowest overhead   |
| Sliding Window Log     | `O(n)` — 1 entry/request | Perfect accuracy    | Low-volume, critical accuracy |
| Sliding Window Counter | `O(1)` — 2 keys          | ~1% approximation   | High-traffic default ✓        |
| Token Bucket           | `O(1)` — 2 keys          | Controlled bursting | Bursty endpoints              |

---

## How Atomicity Works

This is the core technical detail that separates FluxGuard from naive implementations.

A non-atomic rate limiter does this:

```
1. GET counter          ← read
2. if counter < limit:
3.   INCR counter       ← write (race condition window between 1 and 3)
```

Under concurrent load, two requests can both read `counter = 99` (limit = 100),
both pass the check, and both increment — resulting in `counter = 101` with both
requests allowed. **This is the TOCTOU (time-of-check/time-of-use) race condition.**

FluxGuard eliminates this by executing the entire check-and-increment as a single
Redis Lua script. Redis runs Lua atomically — no other command executes between
your read and write:

```lua
-- packages/fluxguard-node/src/scripts/sliding_window_counter.lua
-- KEYS[1] = prev window key
-- KEYS[2] = curr window key
-- ARGV[1] = limit, ARGV[2] = window_ms, ARGV[3] = now_ms
-- Returns: { allowed (0|1), estimated_count, limit }

local limit     = tonumber(ARGV[1])
local window    = tonumber(ARGV[2])
local now       = tonumber(ARGV[3])
local prev      = tonumber(redis.call('GET', KEYS[1])) or 0
local curr      = tonumber(redis.call('GET', KEYS[2])) or 0
local elapsed   = now % window
local weight    = 1 - (elapsed / window)

-- Weighted estimate of requests in the last full window
local estimated = math.floor(prev * weight) + curr

if estimated >= limit then
  return { 0, estimated, limit }  -- throttled
end

redis.call('INCR', KEYS[2])
redis.call('PEXPIRE', KEYS[2], window * 2)
return { 1, estimated + 1, limit }  -- allowed
```

The same Lua script body is used by both the Node.js and Java packages — loaded
from the same `.lua` file at runtime, ensuring byte-identical SHA hashes and
consistent behaviour across both languages.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Integrations                        │
│   Express Middleware    Spring Interceptor    Raw API    │
└────────────────────────────┬────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────┐
│                     FluxGuard Core                       │
│         Algorithm selection · Key extraction             │
│         Result building · Header injection               │
└──────────────┬──────────────────────────┬───────────────┘
               │                          │
┌──────────────▼──────────┐  ┌────────────▼──────────────┐
│  LocalStore             │  │  RedisStore                │
│  (Map / ConcurrentHash) │  │  (ioredis / Lettuce)       │
└─────────────────────────┘  └────────────┬──────────────┘
                                          │
                             ┌────────────▼──────────────┐
                             │  Lua Scripts (EVALSHA)     │
                             │  Atomic read-modify-write  │
                             └───────────────────────────┘
```

**IStore interface** — the abstraction that lets algorithm logic stay identical
regardless of whether it's backed by a local Map or a Redis cluster:

```typescript
interface IStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
  evalScript(script: string, keys: string[], args: string[]): Promise<unknown>;
}
```

All four algorithms are implemented against `IStore` only. They never call
`ioredis` or `Lettuce` directly.

---

## Configuration Reference

| Key                      | Type     | Default                  | Description                                                                           |
| ------------------------ | -------- | ------------------------ | ------------------------------------------------------------------------------------- |
| `algorithm`              | enum     | `SLIDING_WINDOW_COUNTER` | One of `FIXED_WINDOW`, `SLIDING_WINDOW_LOG`, `SLIDING_WINDOW_COUNTER`, `TOKEN_BUCKET` |
| `limit`                  | number   | —                        | **Required.** Max requests per window                                                 |
| `windowMs`               | number   | —                        | **Required.** Window duration in milliseconds                                         |
| `redis`                  | object   | `undefined`              | Redis connection config. Omit for local in-memory mode                                |
| `keyExtract`             | function | `req.ip`                 | `(req) => string` — extract rate limit identifier from request                        |
| `onThrottled`            | function | 429 JSON                 | Custom handler when request is rejected                                               |
| `failOpen`               | boolean  | `true`                   | If Redis is unreachable: `true` = allow all, `false` = block all                      |
| `skipSuccessfulRequests` | boolean  | `false`                  | Don't count requests that result in 2xx                                               |
| `skipFailedRequests`     | boolean  | `false`                  | Don't count requests that result in 5xx                                               |
| `keyPrefix`              | string   | `"fluxguard:"`           | Redis key prefix                                                                      |
| `headers`                | boolean  | `true`                   | Auto-set `X-RateLimit-*` headers                                                      |

---

## Resilience

Redis failure **never crashes your app**. FluxGuard catches all Redis errors and
applies your `failOpen` policy:

```
failOpen: true  (default) → allow request through; log WARN
failOpen: false            → reject request with 429; log WARN
```

In both cases the error is surfaced via the `onRedisError` callback so you can
route it to your alerting system:

```typescript
const limiter = new FluxGuard({
  // ...
  failOpen: true,
  onRedisError: (err, key) => {
    logger.warn({ event: "redis_error", key, error: err.message });
    metrics.increment("fluxguard.redis_errors");
  },
});
```

---

## Observability

**Node.js — Prometheus via prom-client:**

```typescript
import { FluxGuardMetrics } from "fluxguard";
import { register } from "prom-client";

const metrics = new FluxGuardMetrics(register);
const limiter = new FluxGuard({ ...config, metrics });

// Exposes:
// fluxguard_requests_total{algorithm, allowed}
// fluxguard_throttled_total{algorithm}
// fluxguard_redis_errors_total
```

**Java — Micrometer:**

```java
FluxGuardConfig config = FluxGuardConfig.builder()
    .meterRegistry(meterRegistry) // Spring Boot auto-wires this
    .build();
```

---

## Multiple Limiters

You can create independent limiters per route or use case:

```typescript
const globalLimiter = new FluxGuard({ limit: 1000, windowMs: 60_000 });
const loginLimiter = new FluxGuard({
  limit: 5,
  windowMs: 60_000,
  algorithm: Algorithm.SLIDING_WINDOW_LOG,
});
const searchLimiter = new FluxGuard({
  limit: 30,
  windowMs: 60_000,
  algorithm: Algorithm.TOKEN_BUCKET,
});

app.use(globalLimiter.middleware());
app.post("/auth/login", loginLimiter.middleware(), loginHandler);
app.get("/search", searchLimiter.middleware(), searchHandler);
```

---

## Cross-Language Parity

One of the most important correctness guarantees in FluxGuard is that the Node.js
and Java implementations produce **identical results** for identical inputs.

This is enforced by a shared fixture file at `packages/fixtures/vectors.json`
that defines input/output test vectors for all four algorithms:

```json
{
  "sliding_window_counter": [
    {
      "description": "allows exactly at limit",
      "config": { "limit": 3, "windowMs": 60000 },
      "steps": [
        {
          "nowMs": 1000,
          "key": "u1",
          "expect": { "allowed": true, "remaining": 2 }
        },
        {
          "nowMs": 2000,
          "key": "u1",
          "expect": { "allowed": true, "remaining": 1 }
        },
        {
          "nowMs": 3000,
          "key": "u1",
          "expect": { "allowed": true, "remaining": 0 }
        },
        {
          "nowMs": 4000,
          "key": "u1",
          "expect": { "allowed": false, "remaining": 0 }
        }
      ]
    }
  ]
}
```

Both test suites consume this file. CI blocks any merge where the two
implementations diverge.

---

## Monorepo Layout

```
fluxguard/
├── packages/
│   ├── fluxguard-node/          # npm package: fluxguard
│   │   └── src/
│   │       ├── algorithms/      # One file per algorithm
│   │       ├── store/           # LocalStore, RedisStore
│   │       ├── middleware/      # Express factory
│   │       ├── scripts/         # Lua scripts (*.lua)
│   │       └── metrics/         # prom-client hooks
│   ├── fluxguard-java/          # Maven: io.github.zeeshan-2k1:fluxguard-java
│   │   └── src/main/java/
│   │       ├── algorithm/       # Algorithm implementations
│   │       ├── store/           # LocalStore, RedisStore (Lettuce)
│   │       ├── spring/          # Auto-config, @RateLimit, interceptor
│   │       └── metrics/         # Micrometer hooks
│   └── fixtures/                # Shared JSON parity vectors
├── examples/
│   ├── express-app/             # Node.js example with /metrics
│   └── springboot-app/          # Spring Boot example
├── benchmarks/                  # Artillery + chaos tests
└── docker-compose.yml           # Redis for local dev
```

---

## Running Locally

**Prerequisites:** Node.js ≥ 16, JDK 17+, pnpm, Docker

```bash
# Start Redis
docker compose up -d

# Node.js
pnpm install
pnpm run build
pnpm --filter fluxguard test

# Enable Redis integration tests locally
REDIS_INTEGRATION=1 pnpm --filter fluxguard test

# Java
cd packages/fluxguard-java
./mvnw verify
```

---

## Benchmarks

Load tests live in `benchmarks/`. They verify NFR-01: Redis overhead must add
**<2ms p99** at 1000 RPS sustained.

```bash
# Start the full benchmark environment
docker compose -f benchmarks/scripts/docker-compose.yml up -d

# Run Artillery against Node.js (baseline + all 4 algorithms)
bash benchmarks/scripts/run-all.sh --skip-java

# Compare two result snapshots
node benchmarks/scripts/compare.js results/run-a.json results/run-b.json
```

Benchmark results are stored in `benchmarks/results/` (git-ignored).
See [`benchmarks/README.md`](benchmarks/README.md) for full instructions
and pass/fail thresholds.

---

## Publishing

Artifacts are published automatically when a GitHub Release is created.
Tag format: `v{major}.{minor}.{patch}` (e.g. `v0.1.2`).

| Artifact                               | Registry                                                                                    | Workflow            |
| -------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------- |
| `fluxguard`                            | [npm](https://www.npmjs.com/package/fluxguard)                                              | `publish-npm.yml`   |
| `io.github.zeeshan-2k1:fluxguard-java` | [Maven Central](https://central.sonatype.com/artifact/io.github.zeeshan-2k1/fluxguard-java) | `publish-maven.yml` |

Required GitHub Secrets: `NPM_TOKEN`, `MAVEN_USERNAME`, `MAVEN_PASSWORD`,
`MAVEN_GPG_PRIVATE_KEY`, `MAVEN_GPG_PASSPHRASE`.

---

## What's Out of Scope (v1)

To keep FluxGuard focused, these are explicitly deferred to v2:

- Redis Cluster / Sentinel (Lua multi-key ops require hash tag coordination)
- Database-backed store (Postgres, MySQL)
- Adaptive rate limiting (auto-tighten limits on downstream latency spikes)
- Python, Go, or other language ports
- Edge proxy integration (Kong, Nginx, Cloudflare Workers)

---

## License

MIT — see [LICENSE](LICENSE)

---

## Author

**Zeeshan Ashraf** — [GitHub](https://github.com/Zeeshan-2k1) · [LinkedIn](https://www.linkedin.com/in/zeeshan-ashraf-38897b1a6/)

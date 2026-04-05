# FluxGuard

Polyglot distributed rate limiting: **Node.js (TypeScript)** and **Java**, with optional **Redis** (Lua / `EVALSHA`) for atomic checks across instances. Local in-memory mode works without Redis.

## Monorepo layout

| Path | Description |
|------|-------------|
| [packages/fluxguard-node](packages/fluxguard-node) | npm package `fluxguard` — core, `RedisStore`, Express middleware, Prometheus helpers |
| [packages/fluxguard-java](packages/fluxguard-java) | Maven `com.fluxguard:fluxguard-java` — Lettuce, Spring Boot auto-config, `@RateLimit`, Micrometer helpers |
| [packages/fixtures](packages/fixtures) | `@fluxguard/fixtures` — shared JSON parity vectors for Node + Java tests |
| [examples/express-app](examples/express-app) | Sample Express + `/metrics` |
| [benchmarks](benchmarks) | Artillery YAML for load experiments |

## Quick start (Node)

```bash
docker compose up -d
pnpm install
pnpm run build
pnpm --filter fluxguard test
```

- **Integration tests** against Redis run when `CI=true` (e.g. GitHub Actions) or `REDIS_INTEGRATION=1` locally with Redis up.

```ts
import { FluxGuard, Algorithm } from "fluxguard";

const g = new FluxGuard({
  algorithm: Algorithm.SLIDING_WINDOW_COUNTER,
  limit: 100,
  windowMs: 60_000,
  nowFn: () => Date.now(),
});
await g.check("user:123");
```

## Quick start (Java)

Requires **JDK 17+** on your `PATH` (`java -version`).

You do **not** need a global Maven install: the repo includes the **Maven Wrapper**.

```bash
cd packages/fluxguard-java
chmod +x mvnw   # once, if needed
./mvnw verify
```

If you prefer Homebrew: `brew install maven` and then `mvn verify` works the same.

Use `FluxGuardConfig` with an optional `RedisClient` from Lettuce; clock via `LongSupplier`. Spring Boot: `fluxguard.enabled=true`, optional `fluxguard.redis.enabled=true` and `fluxguard.redis.uri`.

## Algorithms

Fixed window, sliding window log, sliding window counter (default), token bucket — see the BRD/PRD in `docs/`.

## Publishing

Artifacts publish automatically when you **publish a GitHub Release** (not only a tag). Use a tag like `v0.1.0`; workflows strip the leading `v` for versions.

| Artifact | Workflow | Repository secrets |
|----------|----------|-------------------|
| **npm** (`fluxguard`) | [.github/workflows/publish-npm.yml](.github/workflows/publish-npm.yml) | `NPM_TOKEN` — [npm access token](https://docs.npmjs.com/creating-and-viewing-access-tokens) with publish scope |
| **Maven Central** `com.fluxguard:fluxguard-java` | [.github/workflows/publish-maven.yml](.github/workflows/publish-maven.yml) | `MAVEN_USERNAME` and `MAVEN_PASSWORD` — [Central Portal user token](https://central.sonatype.org/publish/generate-portal-token/) for OSSRH; `MAVEN_GPG_PRIVATE_KEY` — full ASCII-armored private key; `MAVEN_GPG_PASSPHRASE` — key passphrase |

**One-time Maven setup:** Register the `com.fluxguard` namespace in [Sonatype Central](https://central.sonatype.com/), prove ownership, and ensure your OSS token is allowed to publish that `groupId`. Locally you can dry-run with `./mvnw -P release verify` only after importing a GPG key (signing runs in the `release` profile).

**npm provenance** is enabled (`publishConfig.provenance`); the repository must be **public** on GitHub for provenance to succeed—otherwise remove `--provenance` from the workflow or drop `publishConfig.provenance` in the package.

## License

MIT

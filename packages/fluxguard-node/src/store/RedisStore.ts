import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Redis } from "ioredis";
import type { RedisOptions } from "ioredis";
import type { Store } from "./Store.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function scriptPath(name: string): string {
  // Bundled entry: __dirname is `dist/` → `../scripts`. Tests (ts-jest): __dirname is `src/store/` → `../../scripts`.
  const fromDist = join(__dirname, "..", "scripts", name);
  const fromSourceTree = join(__dirname, "..", "..", "scripts", name);
  if (existsSync(fromDist)) return fromDist;
  if (existsSync(fromSourceTree)) return fromSourceTree;
  throw new Error(
    `FluxGuard: Lua script not found: ${name} (tried ${fromDist} and ${fromSourceTree})`,
  );
}

export class RedisStore implements Store {
  private readonly redis: Redis;
  private readonly owns: boolean;
  private readonly shaCache = new Map<string, string>();

  constructor(redis: Redis | RedisOptions, optionsIsObject: boolean) {
    if (optionsIsObject) {
      this.redis = new Redis(redis as RedisOptions);
      this.owns = true;
    } else {
      this.redis = redis as Redis;
      this.owns = false;
    }
  }

  loadScriptFile(filename: string): string {
    return readFileSync(scriptPath(filename), "utf8");
  }

  disconnect(): void {
    if (this.owns) {
      void this.redis.quit();
    }
  }

  get redisClient(): Redis {
    return this.redis;
  }

  async get(key: string): Promise<string | null> {
    const v = await this.redis.get(key);
    return v;
  }

  async set(key: string, value: string, ttlMs: number): Promise<void> {
    if (ttlMs > 0) {
      await this.redis.set(key, value, "PX", ttlMs);
    } else {
      await this.redis.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async evalScript(script: string, keys: string[], args: (string | number)[]): Promise<unknown[]> {
    let sha = this.shaCache.get(script);
    if (!sha) {
      sha = (await this.redis.script("LOAD", script)) as string;
      this.shaCache.set(script, sha);
    }
    try {
      const r = await this.redis.evalsha(
        sha,
        keys.length,
        ...keys,
        ...args.map((a) => String(a)),
      );
      return normalizeEvalResult(r);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("NOSCRIPT")) {
        sha = (await this.redis.script("LOAD", script)) as string;
        this.shaCache.set(script, sha);
        const r = await this.redis.evalsha(
          sha,
          keys.length,
          ...keys,
          ...args.map((a) => String(a)),
        );
        return normalizeEvalResult(r);
      }
      throw e;
    }
  }
}

function normalizeEvalResult(r: unknown): unknown[] {
  if (Array.isArray(r)) {
    return r as unknown[];
  }
  if (r == null) {
    return [];
  }
  return [r];
}

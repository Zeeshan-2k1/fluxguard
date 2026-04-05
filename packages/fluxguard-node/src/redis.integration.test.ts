import { Redis } from "ioredis";
import { FluxGuard } from "./FluxGuard.js";
import { Algorithm } from "./types.js";

const url = process.env.REDIS_URL ?? "redis://127.0.0.1:6379";

const runRedisIntegration =
  process.env.REDIS_INTEGRATION === "1" || process.env.CI === "true";

(runRedisIntegration ? describe : describe.skip)("Redis integration", () => {
  let redis: Redis;

  beforeAll(async () => {
    redis = new Redis(url, { connectTimeout: 5000, maxRetriesPerRequest: 2 });
    await redis.ping();
  }, 15_000);

  afterAll(() => {
    redis.disconnect();
  });

  it("sliding window counter allows then blocks under Lua", async () => {
    const g = new FluxGuard({
      algorithm: Algorithm.SLIDING_WINDOW_COUNTER,
      limit: 2,
      windowMs: 10_000,
      redis,
      keyPrefix: "test:fluxguard:",
    });
    const k = `int-${Date.now()}`;
    expect((await g.check(k)).allowed).toBe(true);
    expect((await g.check(k)).allowed).toBe(true);
    expect((await g.check(k)).allowed).toBe(false);
  });
});

import { FluxGuard } from "./FluxGuard.js";
import { Algorithm } from "./types.js";

describe("FluxGuard local", () => {
  it("fixed window blocks 4th request in same window", async () => {
    const times = [1000, 1000, 1000, 1000];
    let i = 0;
    const g = new FluxGuard({
      algorithm: Algorithm.FIXED_WINDOW,
      limit: 3,
      windowMs: 60_000,
      nowFn: () => times[i]!,
    });
    expect((await g.check("a")).allowed).toBe(true);
    i++;
    expect((await g.check("a")).allowed).toBe(true);
    i++;
    expect((await g.check("a")).allowed).toBe(true);
    i++;
    expect((await g.check("a")).allowed).toBe(false);
  });
});

import { loadParityVector, PARITY_VECTOR_NAMES } from "@fluxguard/fixtures";
import { FluxGuard } from "./FluxGuard.js";
import { Algorithm } from "./types.js";

function mapAlgo(s: string): Algorithm {
  switch (s) {
    case "FIXED_WINDOW":
      return Algorithm.FIXED_WINDOW;
    case "TOKEN_BUCKET":
      return Algorithm.TOKEN_BUCKET;
    case "SLIDING_WINDOW_COUNTER":
      return Algorithm.SLIDING_WINDOW_COUNTER;
    default:
      throw new Error(s);
  }
}

describe("parity fixtures (local)", () => {
  for (const name of PARITY_VECTOR_NAMES) {
    it(`matches ${name}`, async () => {
      const v = loadParityVector(name);
      let idx = 0;
      const limiter = new FluxGuard({
        algorithm: mapAlgo(v.algorithm),
        limit: v.limit,
        windowMs: v.windowMs,
        nowFn: () => v.nowSequence[idx]!,
      });
      for (let i = 0; i < v.expected.length; i++) {
        idx = i;
        const r = await limiter.check(v.key);
        const exp = v.expected[i];
        expect(r.allowed ? 1 : 0).toBe(exp);
      }
    });
  }
});

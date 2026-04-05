import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Root of this package (works from dist/ after build). */
export function fixturesRoot(): string {
  return join(__dirname, "..");
}

export function vectorPath(...segments: string[]): string {
  return join(fixturesRoot(), "vectors", ...segments);
}

export type ParityVector = {
  name: string;
  algorithm: string;
  limit: number;
  windowMs: number;
  key: string;
  /** Monotonic now sequence in ms for each step */
  nowSequence: number[];
  /** Expected allowed (1) or throttled (0) per step */
  expected: number[];
};

export function loadParityVector(name: string): ParityVector {
  const p = vectorPath("parity", `${name}.json`);
  return JSON.parse(readFileSync(p, "utf8")) as ParityVector;
}

export const PARITY_VECTOR_NAMES = [
  "fixed-window-basic",
  "token-bucket-basic",
  "sliding-counter-basic",
] as const;

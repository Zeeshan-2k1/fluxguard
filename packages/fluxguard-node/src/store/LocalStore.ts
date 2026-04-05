import type { Store } from "./Store.js";

type Entry = { value: string; expiresAt: number };

export class LocalStore implements Store {
  private readonly data = new Map<string, Entry>();

  constructor(private readonly clock: () => number = () => Date.now()) {}

  async get(key: string): Promise<string | null> {
    const e = this.data.get(key);
    if (!e) return null;
    const now = this.clock();
    if (e.expiresAt > 0 && now > e.expiresAt) {
      this.data.delete(key);
      return null;
    }
    return e.value;
  }

  async set(key: string, value: string, ttlMs: number): Promise<void> {
    const expiresAt = ttlMs > 0 ? this.clock() + ttlMs : 0;
    this.data.set(key, { value, expiresAt });
  }

  async del(key: string): Promise<void> {
    this.data.delete(key);
  }

  async evalScript(): Promise<unknown[]> {
    throw new Error("LocalStore does not support evalScript — use algorithm local path");
  }

  /** Test helper: clear all keys */
  _clear(): void {
    this.data.clear();
  }
}

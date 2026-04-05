/**
 * Storage abstraction: local Map or Redis (Lua via evalScript).
 */
export interface Store {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
  del(key: string): Promise<void>;
  /**
   * Execute Lua atomically (Redis). Local store may throw if used.
   */
  evalScript(script: string, keys: string[], args: (string | number)[]): Promise<unknown[]>;
}

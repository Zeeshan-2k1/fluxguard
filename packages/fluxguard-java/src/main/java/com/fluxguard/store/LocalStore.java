package com.fluxguard.store;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public final class LocalStore implements Store {
  private final Map<String, Entry> data = new ConcurrentHashMap<>();
  private final java.util.function.LongSupplier clock;

  public LocalStore() {
    this(System::currentTimeMillis);
  }

  public LocalStore(java.util.function.LongSupplier clock) {
    this.clock = clock;
  }

  private record Entry(String value, long expiresAt) {}

  @Override
  public String get(String key) {
    Entry e = data.get(key);
    long now = clock.getAsLong();
    if (e == null) {
      return null;
    }
    if (e.expiresAt > 0 && now > e.expiresAt) {
      data.remove(key);
      return null;
    }
    return e.value;
  }

  @Override
  public void set(String key, String value, long ttlMs) {
    long expiresAt = ttlMs > 0 ? clock.getAsLong() + ttlMs : 0;
    data.put(key, new Entry(value, expiresAt));
  }

  @Override
  public void del(String key) {
    data.remove(key);
  }

  @Override
  public List<Object> evalScript(String script, List<String> keys, List<String> args) {
    throw new UnsupportedOperationException("LocalStore does not support evalScript");
  }

  public void clear() {
    data.clear();
  }
}

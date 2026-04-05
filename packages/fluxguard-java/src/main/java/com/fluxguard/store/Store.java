package com.fluxguard.store;

import java.util.List;

public interface Store {
  String get(String key);

  void set(String key, String value, long ttlMs);

  void del(String key);

  List<Object> evalScript(String script, List<String> keys, List<String> args);
}

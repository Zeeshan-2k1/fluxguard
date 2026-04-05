package com.fluxguard.store;

import io.lettuce.core.ScriptOutputType;
import io.lettuce.core.SetArgs;
import io.lettuce.core.api.sync.RedisCommands;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public final class RedisStore implements Store {
  private final RedisCommands<String, String> sync;
  private final Map<String, String> shaCache = new ConcurrentHashMap<>();

  public RedisStore(RedisCommands<String, String> sync) {
    this.sync = sync;
  }

  @Override
  public String get(String key) {
    return sync.get(key);
  }

  @Override
  public void set(String key, String value, long ttlMs) {
    if (ttlMs > 0) {
      sync.set(key, value, SetArgs.Builder.px(ttlMs));
    } else {
      sync.set(key, value);
    }
  }

  @Override
  public void del(String key) {
    sync.del(key);
  }

  @Override
  public List<Object> evalScript(String script, List<String> keys, List<String> args) {
    String sha = shaCache.computeIfAbsent(script, s -> sync.scriptLoad(s));
    try {
      return sync.evalsha(sha, ScriptOutputType.MULTI, keys.toArray(new String[0]), args.toArray(new String[0]));
    } catch (Exception e) {
      if (e.getMessage() != null && e.getMessage().contains("NOSCRIPT")) {
        sha = sync.scriptLoad(script);
        shaCache.put(script, sha);
        return sync.evalsha(sha, ScriptOutputType.MULTI, keys.toArray(new String[0]), args.toArray(new String[0]));
      }
      throw e;
    }
  }

  public static String loadResourceScript(String name) {
    try (InputStream in = RedisStore.class.getResourceAsStream("/scripts/" + name)) {
      if (in == null) {
        throw new IllegalStateException("Missing script: " + name);
      }
      return new String(in.readAllBytes(), StandardCharsets.UTF_8);
    } catch (IOException e) {
      throw new RuntimeException(e);
    }
  }

  public List<Object> evalScriptFile(String fileName, List<String> keys, List<String> args) {
    String script = loadResourceScript(fileName);
    return evalScript(script, keys, args);
  }
}

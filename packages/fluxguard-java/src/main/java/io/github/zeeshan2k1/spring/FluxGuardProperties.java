package io.github.zeeshan2k1.spring;

import io.github.zeeshan2k1.core.Algorithm;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "fluxguard")
public class FluxGuardProperties {
  private boolean enabled = false;
  private Algorithm algorithm = Algorithm.SLIDING_WINDOW_COUNTER;
  private int limit = 100;
  private long windowMs = 60_000L;
  private String keyPrefix = "fluxguard:";
  private boolean failOpen = true;
  private final Redis redis = new Redis();

  public boolean isEnabled() {
    return enabled;
  }

  public void setEnabled(boolean enabled) {
    this.enabled = enabled;
  }

  public Algorithm getAlgorithm() {
    return algorithm;
  }

  public void setAlgorithm(Algorithm algorithm) {
    this.algorithm = algorithm;
  }

  public int getLimit() {
    return limit;
  }

  public void setLimit(int limit) {
    this.limit = limit;
  }

  public long getWindowMs() {
    return windowMs;
  }

  public void setWindowMs(long windowMs) {
    this.windowMs = windowMs;
  }

  public String getKeyPrefix() {
    return keyPrefix;
  }

  public void setKeyPrefix(String keyPrefix) {
    this.keyPrefix = keyPrefix;
  }

  public boolean isFailOpen() {
    return failOpen;
  }

  public void setFailOpen(boolean failOpen) {
    this.failOpen = failOpen;
  }

  public Redis getRedis() {
    return redis;
  }

  public static class Redis {
    private boolean enabled = false;
    private String uri = "redis://localhost:6379";

    public boolean isEnabled() {
      return enabled;
    }

    public void setEnabled(boolean enabled) {
      this.enabled = enabled;
    }

    public String getUri() {
      return uri;
    }

    public void setUri(String uri) {
      this.uri = uri;
    }
  }
}

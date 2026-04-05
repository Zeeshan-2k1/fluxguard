package com.fluxguard.spring;

import com.fluxguard.core.FluxGuard;
import com.fluxguard.core.FluxGuardConfig;
import io.lettuce.core.RedisClient;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(FluxGuardProperties.class)
@ConditionalOnProperty(
    prefix = "fluxguard",
    name = "enabled",
    havingValue = "true",
    matchIfMissing = false)
public class FluxGuardAutoConfiguration {

  @Bean
  public RateLimitInterceptor rateLimitInterceptor(FluxGuard fluxGuard) {
    return new RateLimitInterceptor(fluxGuard);
  }

  @Bean(destroyMethod = "close")
  public FluxGuard fluxGuard(FluxGuardProperties props) {
    RedisClient client = null;
    if (props.getRedis().isEnabled()) {
      client = RedisClient.create(props.getRedis().getUri());
    }
    FluxGuardConfig cfg =
        new FluxGuardConfig(
            props.getAlgorithm(),
            props.getLimit(),
            props.getWindowMs(),
            props.getKeyPrefix(),
            System::currentTimeMillis,
            props.isFailOpen(),
            client);
    return new FluxGuard(cfg);
  }
}

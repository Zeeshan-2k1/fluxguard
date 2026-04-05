package io.github.zeeshan2k1.spring;

import io.github.zeeshan2k1.core.FluxGuard;
import io.github.zeeshan2k1.core.RateLimitResult;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

public class RateLimitInterceptor implements HandlerInterceptor {

  private final FluxGuard fluxGuard;

  public RateLimitInterceptor(FluxGuard fluxGuard) {
    this.fluxGuard = fluxGuard;
  }

  @Override
  public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
      throws Exception {
    if (!(handler instanceof HandlerMethod)) {
      return true;
    }
    RateLimit ann = ((HandlerMethod) handler).getMethodAnnotation(RateLimit.class);
    if (ann == null) {
      return true;
    }
    String key = request.getRemoteAddr();
    RateLimitResult r = fluxGuard.check(key);
    response.setHeader("X-RateLimit-Limit", String.valueOf(r.limit()));
    response.setHeader("X-RateLimit-Remaining", String.valueOf(r.remaining()));
    response.setHeader("X-RateLimit-Reset", String.valueOf((r.resetMs() + 999) / 1000));
    if (!r.allowed()) {
      response.setStatus(429);
      if (r.retryAfterMs().isPresent()) {
        response.setHeader(
            "Retry-After", String.valueOf((r.retryAfterMs().getAsLong() + 999) / 1000));
      }
      response.getWriter().write("{\"error\":\"Too Many Requests\"}");
      return false;
    }
    return true;
  }
}

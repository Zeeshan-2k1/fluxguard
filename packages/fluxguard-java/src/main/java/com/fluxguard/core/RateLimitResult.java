package com.fluxguard.core;

import java.util.OptionalLong;

public record RateLimitResult(
    boolean allowed,
    int limit,
    int remaining,
    long resetMs,
    OptionalLong retryAfterMs,
    Algorithm algorithm
) {
}

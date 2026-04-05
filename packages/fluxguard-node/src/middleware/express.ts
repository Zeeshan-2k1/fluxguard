import type { RequestHandler, Request, Response } from "express";
import type { FluxGuard } from "../FluxGuard.js";
import type { RateLimitResult } from "../types.js";

export type ExpressLimiterOptions = {
  keyExtract?: (req: Request) => string;
  onThrottled?: (req: Request, res: Response, result: RateLimitResult) => void;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  headers?: boolean;
};

const defaultKey = (req: Request): string => {
  const xf = req.headers["x-forwarded-for"];
  const ip =
    (typeof xf === "string" ? xf.split(",")[0]?.trim() : undefined) ??
    req.socket.remoteAddress ??
    "unknown";
  return ip;
};

export function fluxGuardMiddleware(
  limiter: FluxGuard,
  options: ExpressLimiterOptions = {},
): RequestHandler {
  const keyExtract = options.keyExtract ?? defaultKey;
  const sendHeaders = options.headers !== false;

  return async (req, res, next) => {
    const key = keyExtract(req);
    let result: RateLimitResult;
    try {
      result = await limiter.check(key);
    } catch (e) {
      next(e);
      return;
    }

    if (sendHeaders) {
      res.setHeader("X-RateLimit-Limit", String(result.limit));
      res.setHeader("X-RateLimit-Remaining", String(result.remaining));
      res.setHeader("X-RateLimit-Reset", String(Math.ceil(result.resetMs / 1000)));
      if (!result.allowed && result.retryAfterMs != null) {
        res.setHeader("Retry-After", String(Math.ceil(result.retryAfterMs / 1000)));
      }
    }

    if (!result.allowed) {
      if (options.onThrottled) {
        options.onThrottled(req, res, result);
        return;
      }
      res.status(429).json({
        error: "Too Many Requests",
        limit: result.limit,
        remaining: result.remaining,
        resetMs: result.resetMs,
        retryAfterMs: result.retryAfterMs,
      });
      return;
    }

    void options.skipSuccessfulRequests;
    void options.skipFailedRequests;

    next();
  };
}

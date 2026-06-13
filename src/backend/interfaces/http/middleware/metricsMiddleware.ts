import type { RequestHandler } from "express";
import type { MetricsRegistry } from "../../../observability/metricsRegistry.js";

export function metricsMiddleware(metrics: MetricsRegistry): RequestHandler {
  return (request, response, next) => {
    const startedAt = performance.now();

    response.on("finish", () => {
      const durationMs = performance.now() - startedAt;
      const route = request.route?.path ? `${request.baseUrl}${request.route.path}` : request.path;
      metrics.trackHttpRequest(request.method, route, response.statusCode, durationMs);
    });

    next();
  };
}

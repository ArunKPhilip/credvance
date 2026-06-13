import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  Registry
} from "prom-client";
import type { SubmissionRole } from "../domain/intake/intakeSubmission.js";

export class MetricsRegistry {
  public readonly registry: Registry;
  private readonly httpRequestCounter: Counter<"method" | "route" | "status_code">;
  private readonly httpRequestDurationMs: Histogram<"method" | "route" | "status_code">;
  private readonly intakeSubmissionCounter: Counter<"role">;

  constructor() {
    this.registry = new Registry();
    collectDefaultMetrics({ register: this.registry });

    this.httpRequestCounter = new Counter({
      name: "http_requests_total",
      help: "Total number of processed HTTP requests",
      labelNames: ["method", "route", "status_code"],
      registers: [this.registry]
    });

    this.httpRequestDurationMs = new Histogram({
      name: "http_request_duration_ms",
      help: "Latency of HTTP requests in milliseconds",
      labelNames: ["method", "route", "status_code"],
      buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 3000],
      registers: [this.registry]
    });

    this.intakeSubmissionCounter = new Counter({
      name: "intake_submissions_total",
      help: "Total accepted intake submissions by role",
      labelNames: ["role"],
      registers: [this.registry]
    });
  }

  public trackHttpRequest(method: string, route: string, statusCode: number, durationMs: number): void {
    const labels = {
      method: method.toUpperCase(),
      route,
      status_code: String(statusCode)
    } as const;

    this.httpRequestCounter.inc(labels, 1);
    this.httpRequestDurationMs.observe(labels, durationMs);
  }

  public trackAcceptedSubmission(role: SubmissionRole): void {
    this.intakeSubmissionCounter.inc({ role }, 1);
  }
}

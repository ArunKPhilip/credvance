import pino from "pino";
import type { EnvironmentConfiguration } from "../../config/env.js";

export type ApplicationLogger = pino.Logger;

export function createLogger(environment: EnvironmentConfiguration): ApplicationLogger {
  return pino({
    level: environment.LOG_LEVEL,
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.x-admin-api-key",
        "request.headers.authorization",
        "request.headers.x-admin-api-key",
        "payload.email",
        "payload.phone",
        "payload.message"
      ],
      censor: "[REDACTED]"
    },
    base: {
      service: "credvance-api",
      environment: environment.NODE_ENV
    },
    timestamp: pino.stdTimeFunctions.isoTime
  });
}

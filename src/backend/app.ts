import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import type { Storage } from "firebase-admin/storage";
import type { EnvironmentConfiguration } from "./config/env.js";
import type { ApplicationLogger } from "./infrastructure/logging/logger.js";
import type { IntakeSubmissionService } from "./application/services/intakeSubmissionService.js";
import type { MetricsRegistry } from "./observability/metricsRegistry.js";
import { requestContextMiddleware } from "./interfaces/http/middleware/requestContextMiddleware.js";
import { metricsMiddleware } from "./interfaces/http/middleware/metricsMiddleware.js";
import { errorHandlerMiddleware } from "./interfaces/http/middleware/errorHandlerMiddleware.js";
import { notFoundMiddleware } from "./interfaces/http/middleware/notFoundMiddleware.js";
import { IntakeController } from "./interfaces/http/controllers/intakeController.js";
import { createPublicRoutes } from "./interfaces/http/routes/publicRoutes.js";
import { createAdminRoutes } from "./interfaces/http/routes/adminRoutes.js";
import { createProfileDocumentRoutes } from "./interfaces/http/routes/profileDocumentRoutes.js";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectoryPath = path.dirname(currentFilePath);

export interface AppDependencies {
  environment: EnvironmentConfiguration;
  logger: ApplicationLogger;
  intakeSubmissionService: IntakeSubmissionService;
  metrics: MetricsRegistry;
  firestore?: Firestore;
  firebaseAuthClient?: Auth;
  firebaseStorageClient?: Storage;
}

export function createApp(dependencies: AppDependencies): express.Express {
  const {
    environment,
    logger,
    intakeSubmissionService,
    metrics,
    firestore,
    firebaseAuthClient,
    firebaseStorageClient
  } = dependencies;
  const app = express();

  app.disable("x-powered-by");

  app.use(requestContextMiddleware);
  app.use((request, response, next) => {
    const startedAt = performance.now();

    response.on("finish", () => {
      logger.info(
        {
          event: "http_request",
          requestId: response.locals.requestId,
          method: request.method,
          path: request.originalUrl,
          statusCode: response.statusCode,
          durationMs: Number((performance.now() - startedAt).toFixed(2))
        },
        "HTTP request processed."
      );
    });

    next();
  });
  app.use(metricsMiddleware(metrics));
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" }
    })
  );
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || environment.API_ALLOWED_ORIGINS_LIST.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error("Origin is not allowed by CORS policy."));
      },
      methods: ["GET", "POST"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id", "X-Admin-Api-Key"]
    })
  );
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 120,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests. Please retry later."
        }
      }
    })
  );
  app.use(express.json({ limit: "32kb" }));

  const intakeController = new IntakeController(intakeSubmissionService);
  app.use(createPublicRoutes(intakeController, metrics));
  app.use(createProfileDocumentRoutes(firestore as any, firebaseAuthClient as any, firebaseStorageClient as any, environment));
  app.use(createAdminRoutes(intakeController, environment));


  const frontendDistPath = path.resolve(currentDirectoryPath, "../../dist/frontend");
  if (fs.existsSync(frontendDistPath)) {
    app.use(express.static(frontendDistPath));
    app.get("*", (_request, response, next) => {
      const url = (String((_request.originalUrl || _request.url || "")) || "").split("?")[0];

      // Prevent SPA fallback from hijacking API/metrics/health routes.
      // In serverless environments, `_request.path` can differ from local Express routing.
      const isApiOrHealthOrMetricsRoute =
        (url || "").startsWith("/api/") ||
        url === "/api" ||
        url === "/api/health" ||
        url === "/api/metrics" ||
        url === "/health" ||
        url === "/metrics";

      if (isApiOrHealthOrMetricsRoute) {
        next();
        return;
      }

      response.sendFile(path.join(frontendDistPath, "index.html"));
    });
  }

  app.use(notFoundMiddleware);
  app.use(errorHandlerMiddleware(logger));

  return app;
}

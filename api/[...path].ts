import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createApp } from "../src/backend/app.js";
import { loadEnvironment } from "../src/backend/config/env.js";
import { createLogger } from "../src/backend/infrastructure/logging/logger.js";
import { MetricsRegistry } from "../src/backend/observability/metricsRegistry.js";
import { IntakeSubmissionService } from "../src/backend/application/services/intakeSubmissionService.js";
import { InMemoryIntakeSubmissionRepository } from "../src/backend/infrastructure/persistence/inMemoryIntakeSubmissionRepository.js";
import {
  createFirestoreClient,
  createFirebaseAuthClient,
  createFirebaseStorageClient
} from "../src/backend/infrastructure/persistence/firebaseClient.js";
import { FirebaseIntakeSubmissionRepository } from "../src/backend/infrastructure/persistence/firebaseIntakeSubmissionRepository.js";

let cached:
  | {
      app: ReturnType<typeof createApp>;
    }
  | null = null;

async function getApp() {
  if (cached) return cached.app;

  const environment = loadEnvironment(process.env);
  const logger = createLogger(environment);
  const metrics = new MetricsRegistry();

  let repository: any;
  let firestore: any = undefined;
  let firebaseAuthClient: any = undefined;
  let firebaseStorageClient: any = undefined;

  try {
    if (environment.FIREBASE_USE_APPLICATION_DEFAULT || environment.FIREBASE_SERVICE_ACCOUNT_JSON) {
      firestore = createFirestoreClient(environment, logger);
      firebaseAuthClient = createFirebaseAuthClient(environment);
      firebaseStorageClient = createFirebaseStorageClient(environment);
      repository = new FirebaseIntakeSubmissionRepository(firestore);
    } else {
      repository = new InMemoryIntakeSubmissionRepository();
    }
  } catch (err) {
    logger.warn({ err }, "Failed to initialize firebase client, falling back to in-memory repository.");
    repository = new InMemoryIntakeSubmissionRepository();
  }

  const intakeService = new IntakeSubmissionService(repository, environment, logger, metrics);

  const app = createApp({
    environment,
    logger,
    intakeSubmissionService: intakeService,
    metrics,
    firestore,
    firebaseAuthClient,
    firebaseStorageClient
  });

  cached = { app };
  return app;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel preserves the original request URL in req.url for catch-all [...path] routes.
  // Express routing works directly on that URL — no custom URL manipulation needed.
  try {
    const app = await getApp();
    return app(req as any, res as any);
  } catch (err: any) {
    // Graceful fallback when env vars are not configured (e.g. preview deployments)
    res.status(500).json({
      error: {
        code: "SERVER_CONFIGURATION_ERROR",
        message: err?.message ?? "Server configuration error"
      }
    });
  }
}

#!/usr/bin/env -S tsx
import "dotenv/config";
import http from "node:http";
import { loadEnvironment } from "./config/env.js";
import { createLogger } from "./infrastructure/logging/logger.js";
import { MetricsRegistry } from "./observability/metricsRegistry.js";
import { IntakeSubmissionService } from "./application/services/intakeSubmissionService.js";
import { InMemoryIntakeSubmissionRepository } from "./infrastructure/persistence/inMemoryIntakeSubmissionRepository.js";
import {
  createFirestoreClient,
  createFirebaseAuthClient,
  createFirebaseStorageClient
} from "./infrastructure/persistence/firebaseClient.js";
import { FirebaseIntakeSubmissionRepository } from "./infrastructure/persistence/firebaseIntakeSubmissionRepository.js";
import { createApp } from "./app.js";

async function main() {
  const environment = loadEnvironment(process.env);
  const logger = createLogger(environment);
  const metrics = new MetricsRegistry();

  // Choose repository: prefer Firebase if configured, otherwise use in-memory
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

  const server = http.createServer(app);

  server.listen(environment.PORT, () => {
    logger.info({ port: environment.PORT }, `API server listening on port ${environment.PORT}`);
  });
}

void main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

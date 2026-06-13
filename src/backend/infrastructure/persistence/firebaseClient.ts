import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  applicationDefault,
  cert,
  getApp,
  getApps,
  initializeApp,
  type App,
  type AppOptions
} from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage, type Storage } from "firebase-admin/storage";
import type { EnvironmentConfiguration } from "../../config/env.js";
import type { ApplicationLogger } from "../logging/logger.js";

type ServiceAccountCredentialPayload = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

function normalizePrivateKey(privateKey: string): string {
  return privateKey.replace(/\\n/g, "\n");
}

function getDefaultAdcFilePath(): string {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || "", "gcloud", "application_default_credentials.json");
  }

  return path.join(os.homedir(), ".config", "gcloud", "application_default_credentials.json");
}

function assertApplicationDefaultCredentialAvailability(): void {
  const explicitCredentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (explicitCredentialsPath && existsSync(explicitCredentialsPath)) {
    return;
  }

  if (existsSync(getDefaultAdcFilePath())) {
    return;
  }

  throw new Error(
    "Firebase Application Default Credentials were not found. Install Google Cloud SDK and run `gcloud auth application-default login`, or disable FIREBASE_USE_APPLICATION_DEFAULT and set FIREBASE_SERVICE_ACCOUNT_JSON (or FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY)."
  );
}

function parseServiceAccountJson(environment: EnvironmentConfiguration): ServiceAccountCredentialPayload | null {
  if (!environment.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return null;
  }

  const parsed = JSON.parse(environment.FIREBASE_SERVICE_ACCOUNT_JSON) as ServiceAccountCredentialPayload;
  return parsed;
}

function getOrCreateFirebaseApp(environment: EnvironmentConfiguration): App {
  if (getApps().length > 0) {
    return getApp();
  }

  if (environment.FIREBASE_USE_APPLICATION_DEFAULT) {
    assertApplicationDefaultCredentialAvailability();

    const appOptions: AppOptions = {
      credential: applicationDefault(),
      ...(environment.FIREBASE_PROJECT_ID ? { projectId: environment.FIREBASE_PROJECT_ID } : {}),
      ...(environment.FIREBASE_DATABASE_URL ? { databaseURL: environment.FIREBASE_DATABASE_URL } : {})
    };

    return initializeApp(appOptions);
  }

  const parsedServiceAccountJson = parseServiceAccountJson(environment);
  const privateKey = parsedServiceAccountJson?.private_key || environment.FIREBASE_PRIVATE_KEY;
  const clientEmail = parsedServiceAccountJson?.client_email || environment.FIREBASE_CLIENT_EMAIL;
  const projectId = parsedServiceAccountJson?.project_id || environment.FIREBASE_PROJECT_ID;

  const appOptions: AppOptions = {
    credential: cert({
      projectId,
      clientEmail,
      privateKey: normalizePrivateKey(privateKey)
    }),
    projectId,
    ...(environment.FIREBASE_DATABASE_URL ? { databaseURL: environment.FIREBASE_DATABASE_URL } : {})
  };

  return initializeApp(appOptions);
}

export function createFirestoreClient(
  environment: EnvironmentConfiguration,
  logger: ApplicationLogger
): Firestore {
  const app = getOrCreateFirebaseApp(environment);
  const firestore = getFirestore(app);

  firestore.settings({
    ignoreUndefinedProperties: true
  });

  logger.info(
    {
      event: "firebase_initialized",
      projectId: environment.FIREBASE_PROJECT_ID || "application-default",
      projectNumber: environment.FIREBASE_PROJECT_NUMBER || "not-set"
    },
    "Firebase Firestore initialized."
  );

  return firestore;
}

export function createFirebaseAuthClient(environment: EnvironmentConfiguration): Auth {
  const app = getOrCreateFirebaseApp(environment);
  return getAuth(app);
}

export function createFirebaseStorageClient(environment: EnvironmentConfiguration): Storage {
  const app = getOrCreateFirebaseApp(environment);
  return getStorage(app);
}

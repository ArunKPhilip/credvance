import { z } from "zod";

const booleanStringSchema = z.preprocess((input) => {
  if (typeof input === "boolean") {
    return input;
  }

  if (typeof input === "string") {
    const normalized = input.trim().toLowerCase();

    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }

    if (["false", "0", "no", "off", ""].includes(normalized)) {
      return false;
    }
  }

  return input;
}, z.boolean());

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1024).max(65535).default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  API_ALLOWED_ORIGINS: z.string().min(1).default("http://localhost:5173"),
  ADMIN_API_KEY: z.string().min(20, "ADMIN_API_KEY must be at least 20 characters."),
  PII_HASH_SALT: z.string().min(20, "PII_HASH_SALT must be at least 20 characters."),
  DATA_RETENTION_DAYS: z.coerce.number().int().min(30).max(3650).default(365),
  FIREBASE_USE_APPLICATION_DEFAULT: booleanStringSchema.default(false),
  FIREBASE_PROJECT_ID: z.string().optional().default(""),
  FIREBASE_PROJECT_NUMBER: z.string().optional().default(""),
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional().default(""),
  FIREBASE_CLIENT_EMAIL: z.string().optional().default(""),
  FIREBASE_PRIVATE_KEY: z.string().optional().default(""),
  FIREBASE_DATABASE_URL: z.string().optional().default(""),
  FIREBASE_STORAGE_BUCKET: z.string().optional().default("")
});

export type EnvironmentConfiguration = z.infer<typeof environmentSchema> & {
  API_ALLOWED_ORIGINS_LIST: string[];
};

export function loadEnvironment(source: NodeJS.ProcessEnv): EnvironmentConfiguration {
  const parsed = environmentSchema.safeParse(source);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("; ");
    throw new Error(`Invalid environment configuration: ${message}`);
  }

  if (!parsed.data.FIREBASE_USE_APPLICATION_DEFAULT) {
    const hasServiceAccountJson = Boolean(parsed.data.FIREBASE_SERVICE_ACCOUNT_JSON);
    const hasSplitCredentials = [
      parsed.data.FIREBASE_PROJECT_ID,
      parsed.data.FIREBASE_CLIENT_EMAIL,
      parsed.data.FIREBASE_PRIVATE_KEY
    ].every((value) => Boolean(value));

    let hasJsonCredentialFields = false;

    if (hasServiceAccountJson) {
      try {
        const parsedServiceAccountJson = JSON.parse(parsed.data.FIREBASE_SERVICE_ACCOUNT_JSON) as {
          project_id?: string;
          client_email?: string;
          private_key?: string;
        };

        hasJsonCredentialFields = [
          parsedServiceAccountJson.project_id,
          parsedServiceAccountJson.client_email,
          parsedServiceAccountJson.private_key
        ].every((value) => Boolean(value));
      } catch {
        throw new Error("Invalid environment configuration: FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.");
      }
    }

    if (!hasSplitCredentials && !hasJsonCredentialFields) {
      throw new Error(
        "Invalid environment configuration: set FIREBASE_SERVICE_ACCOUNT_JSON or provide FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY."
      );
    }
  }

  const API_ALLOWED_ORIGINS_LIST = parsed.data.API_ALLOWED_ORIGINS.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return {
    ...parsed.data,
    API_ALLOWED_ORIGINS_LIST
  };
}

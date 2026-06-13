import type { RequestHandler } from "express";
import type { EnvironmentConfiguration } from "../../../config/env.js";
import { ApplicationError } from "../../../domain/shared/applicationError.js";

export function requireAdminApiKeyMiddleware(environment: EnvironmentConfiguration): RequestHandler {
  return (request, _response, next) => {
    const providedKey = request.header("x-admin-api-key");

    if (!providedKey || providedKey !== environment.ADMIN_API_KEY) {
      next(new ApplicationError("Unauthorized request.", "UNAUTHORIZED", 401));
      return;
    }

    next();
  };
}

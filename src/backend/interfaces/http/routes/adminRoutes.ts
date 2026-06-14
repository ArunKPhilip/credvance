import { Router } from "express";
import type { EnvironmentConfiguration } from "../../../config/env.js";
import type { IntakeController } from "../controllers/intakeController.js";
import { requireAdminApiKeyMiddleware } from "../middleware/requireAdminApiKeyMiddleware.js";
import { validateParams, validateQuery } from "../middleware/validateRequest.js";
import {
  anonymizeSubmissionParamsSchema,
  listSubmissionsQuerySchema
} from "../schemas/intakeSchemas.js";

export function createAdminRoutes(
  intakeController: IntakeController,
  environment: EnvironmentConfiguration
): Router {
  const router = Router();
  const requireAdminAuth = requireAdminApiKeyMiddleware(environment);

  router.get(
    "/api/v1/admin/intake/submissions",
    requireAdminAuth,
    validateQuery(listSubmissionsQuerySchema),
    intakeController.listSubmissions
  );
  router.post(
    "/api/v1/admin/intake/submissions/:submissionId/anonymize",
    requireAdminAuth,
    validateParams(anonymizeSubmissionParamsSchema),
    intakeController.anonymizeSubmission
  );

  return router;
}

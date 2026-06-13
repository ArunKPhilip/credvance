import { Router } from "express";
import rateLimit from "express-rate-limit";
import type { IntakeController } from "../controllers/intakeController.js";
import type { MetricsRegistry } from "../../../observability/metricsRegistry.js";
import { validateBody } from "../middleware/validateRequest.js";
import { createIntakeSubmissionSchema } from "../schemas/intakeSchemas.js";

export function createPublicRoutes(intakeController: IntakeController, metrics: MetricsRegistry): Router {
  const router = Router();

  const submissionLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many submissions from this source. Please retry later."
      }
    }
  });

  router.post(
    "/api/v1/intake/contact",
    submissionLimiter,
    validateBody(createIntakeSubmissionSchema),
    intakeController.createSubmission
  );
  router.get("/api/v1/intake/stats", intakeController.getPublicStats);
  router.get("/health", intakeController.healthCheck);
  router.get("/metrics", async (_request, response) => {
    response.setHeader("Content-Type", metrics.registry.contentType);
    response.status(200).send(await metrics.registry.metrics());
  });

  return router;
}

import type { RequestHandler } from "express";
import type { IntakeSubmissionService } from "../../../application/services/intakeSubmissionService.js";
import type { IntakeSubmissionCreateInput } from "../../../domain/intake/intakeSubmission.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import type {
  AnonymizeSubmissionParams,
  CreateIntakeSubmissionRequestBody,
  ListSubmissionsQuery
} from "../schemas/intakeSchemas.js";

export class IntakeController {
  private readonly intakeSubmissionService: IntakeSubmissionService;

  constructor(intakeSubmissionService: IntakeSubmissionService) {
    this.intakeSubmissionService = intakeSubmissionService;
  }

  public readonly createSubmission: RequestHandler = asyncHandler(async (request, response) => {
    const payload = request.body as CreateIntakeSubmissionRequestBody;
    const normalizedPayload: IntakeSubmissionCreateInput = {
      fullName: payload.fullName,
      phone: payload.phone,
      email: payload.email,
      role: payload.role,
      message: payload.message,
      consent: payload.consent
    };

    if (payload.loanAmountRange) {
      normalizedPayload.loanAmountRange = payload.loanAmountRange;
    }

    const sourceIp = request.ip || "unknown";
    const userAgent = request.header("user-agent") || "unknown";

    const result = await this.intakeSubmissionService.createSubmission(normalizedPayload, {
      sourceIp,
      userAgent
    });

    response.status(202).json({
      submissionId: result.submissionId,
      acceptedAt: result.acceptedAt,
      message: "Request received successfully."
    });
  });

  public readonly getPublicStats: RequestHandler = asyncHandler(async (_request, response) => {
    const stats = await this.intakeSubmissionService.getIntakeStats();
    response.status(200).json(stats);
  });

  public readonly listSubmissions: RequestHandler = asyncHandler(async (request, response) => {
    const query = request.query as unknown as ListSubmissionsQuery;
    const result = await this.intakeSubmissionService.getSubmissionList({
      limit: query.limit,
      offset: query.offset
    });

    response.status(200).json(result);
  });

  public readonly anonymizeSubmission: RequestHandler = asyncHandler(async (request, response) => {
    const params = request.params as unknown as AnonymizeSubmissionParams;
    await this.intakeSubmissionService.anonymizeSubmission(params.submissionId);
    response.status(200).json({
      message: "Submission anonymized successfully."
    });
  });

  public readonly healthCheck: RequestHandler = asyncHandler(async (_request, response) => {
    const dataStoreHealthy = await this.intakeSubmissionService.isDataStoreHealthy();
    response.status(dataStoreHealthy ? 200 : 503).json({
      status: dataStoreHealthy ? "ok" : "degraded",
      dataStoreHealthy,
      timestamp: new Date().toISOString()
    });
  });
}

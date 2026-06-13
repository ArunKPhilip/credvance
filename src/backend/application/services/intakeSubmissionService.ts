import { createHash, randomUUID } from "node:crypto";
import type { IntakeSubmissionRepository } from "../ports/intakeSubmissionRepository.js";
import type { EnvironmentConfiguration } from "../../config/env.js";
import type {
  IntakeSubmission,
  IntakeSubmissionCreateInput,
  IntakeSubmissionFilters,
  SubmissionRole
} from "../../domain/intake/intakeSubmission.js";
import { ApplicationError } from "../../domain/shared/applicationError.js";
import type { ApplicationLogger } from "../../infrastructure/logging/logger.js";
import type { MetricsRegistry } from "../../observability/metricsRegistry.js";

export interface IntakeSubmissionResult {
  submissionId: string;
  acceptedAt: string;
}

export interface IntakeStatsResult {
  totalSubmissions: number;
  roleBreakdown: Record<SubmissionRole, number>;
}

export interface IntakeSubmissionListResult {
  total: number;
  items: IntakeSubmission[];
}

export class IntakeSubmissionService {
  private readonly repository: IntakeSubmissionRepository;
  private readonly environment: EnvironmentConfiguration;
  private readonly logger: ApplicationLogger;
  private readonly metrics: MetricsRegistry;

  constructor(
    repository: IntakeSubmissionRepository,
    environment: EnvironmentConfiguration,
    logger: ApplicationLogger,
    metrics: MetricsRegistry
  ) {
    this.repository = repository;
    this.environment = environment;
    this.logger = logger;
    this.metrics = metrics;
  }

  public async createSubmission(
    payload: IntakeSubmissionCreateInput,
    requestMetadata: { sourceIp: string; userAgent: string }
  ): Promise<IntakeSubmissionResult> {
    const acceptedAt = new Date().toISOString();
    const submissionId = randomUUID();
    const sourceIpHash = this.hashSensitiveValue(requestMetadata.sourceIp);

    const submissionBase: IntakeSubmission = {
      id: submissionId,
      fullName: payload.fullName,
      phone: payload.phone,
      email: payload.email,
      role: payload.role,
      message: payload.message,
      consent: payload.consent,
      sourceIpHash,
      status: "new",
      createdAt: acceptedAt,
      updatedAt: acceptedAt
    };

    const submission: IntakeSubmission = payload.loanAmountRange
      ? {
          ...submissionBase,
          loanAmountRange: payload.loanAmountRange
        }
      : submissionBase;

    await this.repository.createSubmission(submission);
    await this.repository.appendAuditEvent({
      id: randomUUID(),
      eventType: "submission.created",
      entityType: "intake_submission",
      entityId: submission.id,
      createdAt: acceptedAt,
      metadataJson: JSON.stringify({
        role: submission.role,
        consent: submission.consent,
        userAgent: requestMetadata.userAgent.slice(0, 160)
      })
    });

    this.metrics.trackAcceptedSubmission(submission.role);
    this.logger.info(
      {
        event: "submission_created",
        submissionId: submission.id,
        role: submission.role
      },
      "Intake submission accepted."
    );

    return {
      submissionId,
      acceptedAt
    };
  }

  public async getSubmissionList(filters: IntakeSubmissionFilters): Promise<IntakeSubmissionListResult> {
    if (filters.limit < 1 || filters.limit > 100) {
      throw new ApplicationError("Limit must be between 1 and 100.", "INVALID_LIMIT", 400);
    }
    if (filters.offset < 0 || filters.offset > 100000) {
      throw new ApplicationError("Offset is out of allowed range.", "INVALID_OFFSET", 400);
    }

    const [total, items] = await Promise.all([
      this.repository.countSubmissions(),
      this.repository.listSubmissions(filters)
    ]);

    return {
      total,
      items
    };
  }

  public async getIntakeStats(): Promise<IntakeStatsResult> {
    const [totalSubmissions, roleBreakdown] = await Promise.all([
      this.repository.countSubmissions(),
      this.repository.getRoleBreakdown()
    ]);

    return {
      totalSubmissions,
      roleBreakdown
    };
  }

  public async anonymizeSubmission(submissionId: string): Promise<void> {
    const updatedAt = new Date().toISOString();
    const updated = await this.repository.anonymizeSubmission(submissionId, updatedAt);
    if (!updated) {
      throw new ApplicationError("Submission not found.", "SUBMISSION_NOT_FOUND", 404);
    }

    await this.repository.appendAuditEvent({
      id: randomUUID(),
      eventType: "submission.anonymized",
      entityType: "intake_submission",
      entityId: submissionId,
      createdAt: updatedAt,
      metadataJson: JSON.stringify({
        reason: "privacy_request_or_retention"
      })
    });

    this.logger.warn(
      {
        event: "submission_anonymized",
        submissionId
      },
      "Submission anonymized."
    );
  }

  public async applyRetentionPolicy(): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - this.environment.DATA_RETENTION_DAYS);

    const deletedCount = await this.repository.deleteSubmissionsOlderThan(cutoffDate.toISOString());
    if (deletedCount > 0) {
      this.logger.info(
        {
          event: "retention_prune",
          deletedCount,
          retentionDays: this.environment.DATA_RETENTION_DAYS
        },
        "Retention policy pruned stale submissions."
      );
    }
    return deletedCount;
  }

  public async isDataStoreHealthy(): Promise<boolean> {
    return this.repository.isHealthy();
  }

  private hashSensitiveValue(value: string): string {
    return createHash("sha256").update(`${this.environment.PII_HASH_SALT}:${value}`).digest("hex");
  }
}

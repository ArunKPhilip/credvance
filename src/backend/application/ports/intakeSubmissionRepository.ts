import type { AuditEvent } from "../../domain/audit/auditEvent.js";
import type {
  IntakeSubmission,
  IntakeSubmissionFilters,
  SubmissionRole
} from "../../domain/intake/intakeSubmission.js";

export interface IntakeSubmissionRepository {
  createSubmission(submission: IntakeSubmission): Promise<void>;
  appendAuditEvent(event: AuditEvent): Promise<void>;
  listSubmissions(filters: IntakeSubmissionFilters): Promise<IntakeSubmission[]>;
  countSubmissions(): Promise<number>;
  getRoleBreakdown(): Promise<Record<SubmissionRole, number>>;
  anonymizeSubmission(submissionId: string, updatedAt: string): Promise<boolean>;
  deleteSubmissionsOlderThan(cutoffIsoDate: string): Promise<number>;
  isHealthy(): Promise<boolean>;
}

import type { IntakeSubmissionRepository } from "../../application/ports/intakeSubmissionRepository.js";
import type { AuditEvent } from "../../domain/audit/auditEvent.js";
import type {
  IntakeSubmission,
  IntakeSubmissionFilters,
  SubmissionRole
} from "../../domain/intake/intakeSubmission.js";

export class InMemoryIntakeSubmissionRepository implements IntakeSubmissionRepository {
  private submissions: IntakeSubmission[] = [];
  private readonly auditEvents: AuditEvent[] = [];

  public async createSubmission(submission: IntakeSubmission): Promise<void> {
    this.submissions = [submission, ...this.submissions];
  }

  public async appendAuditEvent(event: AuditEvent): Promise<void> {
    this.auditEvents.push(event);
  }

  public async listSubmissions(filters: IntakeSubmissionFilters): Promise<IntakeSubmission[]> {
    return this.submissions.slice(filters.offset, filters.offset + filters.limit);
  }

  public async countSubmissions(): Promise<number> {
    return this.submissions.length;
  }

  public async getRoleBreakdown(): Promise<Record<SubmissionRole, number>> {
    const breakdown: Record<SubmissionRole, number> = {
      borrower: 0,
      lender: 0,
      "nbfc-bank": 0,
      other: 0
    };

    for (const item of this.submissions) {
      breakdown[item.role] += 1;
    }
    return breakdown;
  }

  public async anonymizeSubmission(submissionId: string, updatedAt: string): Promise<boolean> {
    let updated = false;
    this.submissions = this.submissions.map((item) => {
      if (item.id !== submissionId || item.status === "anonymized") {
        return item;
      }
      updated = true;
      const { loanAmountRange: _ignoredLoanAmountRange, ...submissionWithoutLoanAmount } = item;
      return {
        ...submissionWithoutLoanAmount,
        fullName: "ANONYMIZED",
        phone: "ANONYMIZED",
        email: "ANONYMIZED",
        message: "ANONYMIZED",
        sourceIpHash: "ANONYMIZED",
        status: "anonymized",
        updatedAt
      };
    });
    return updated;
  }

  public async deleteSubmissionsOlderThan(cutoffIsoDate: string): Promise<number> {
    const cutoff = new Date(cutoffIsoDate).getTime();
    const previousCount = this.submissions.length;
    this.submissions = this.submissions.filter((entry) => new Date(entry.createdAt).getTime() >= cutoff);
    return previousCount - this.submissions.length;
  }

  public async isHealthy(): Promise<boolean> {
    return true;
  }
}

import type { Firestore } from "firebase-admin/firestore";
import type { IntakeSubmissionRepository } from "../../application/ports/intakeSubmissionRepository.js";
import type { AuditEvent } from "../../domain/audit/auditEvent.js";
import type {
  IntakeSubmission,
  IntakeSubmissionFilters,
  SubmissionRole
} from "../../domain/intake/intakeSubmission.js";

const INTAKE_SUBMISSIONS_COLLECTION = "intake_submissions";
const AUDIT_EVENTS_COLLECTION = "audit_events";

type FirestoreIntakeSubmissionRecord = {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  role: SubmissionRole;
  loanAmountRange?: IntakeSubmission["loanAmountRange"];
  message: string;
  consent: boolean;
  sourceIpHash: string;
  status: "new" | "in_review" | "closed" | "anonymized";
  createdAt: string;
  updatedAt: string;
};

export class FirebaseIntakeSubmissionRepository implements IntakeSubmissionRepository {
  private readonly firestore: Firestore;

  constructor(firestore: Firestore) {
    this.firestore = firestore;
  }

  public async createSubmission(submission: IntakeSubmission): Promise<void> {
    const documentReference = this.firestore
      .collection(INTAKE_SUBMISSIONS_COLLECTION)
      .doc(submission.id);

    await documentReference.set(submission);
  }

  public async appendAuditEvent(event: AuditEvent): Promise<void> {
    const documentReference = this.firestore.collection(AUDIT_EVENTS_COLLECTION).doc(event.id);
    await documentReference.set(event);
  }

  public async listSubmissions(filters: IntakeSubmissionFilters): Promise<IntakeSubmission[]> {
    const snapshot = await this.firestore
      .collection(INTAKE_SUBMISSIONS_COLLECTION)
      .orderBy("createdAt", "desc")
      .offset(filters.offset)
      .limit(filters.limit)
      .get();

    return snapshot.docs.map((document) => this.mapRecordToEntity(document.data() as FirestoreIntakeSubmissionRecord));
  }

  public async countSubmissions(): Promise<number> {
    const aggregateSnapshot = await this.firestore.collection(INTAKE_SUBMISSIONS_COLLECTION).count().get();
    return aggregateSnapshot.data().count;
  }

  public async getRoleBreakdown(): Promise<Record<SubmissionRole, number>> {
    const roles: SubmissionRole[] = ["borrower", "lender", "nbfc-bank", "other"];

    const counts = await Promise.all(
      roles.map(async (role) => {
        const aggregateSnapshot = await this.firestore
          .collection(INTAKE_SUBMISSIONS_COLLECTION)
          .where("role", "==", role)
          .count()
          .get();

        return {
          role,
          count: aggregateSnapshot.data().count
        };
      })
    );

    const breakdown: Record<SubmissionRole, number> = {
      borrower: 0,
      lender: 0,
      "nbfc-bank": 0,
      other: 0
    };

    for (const item of counts) {
      breakdown[item.role] = item.count;
    }

    return breakdown;
  }

  public async anonymizeSubmission(submissionId: string, updatedAt: string): Promise<boolean> {
    const documentReference = this.firestore.collection(INTAKE_SUBMISSIONS_COLLECTION).doc(submissionId);

    return this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(documentReference);
      if (!snapshot.exists) {
        return false;
      }

      const payload = snapshot.data() as FirestoreIntakeSubmissionRecord;
      if (payload.status === "anonymized") {
        return false;
      }

      transaction.update(documentReference, {
        fullName: "ANONYMIZED",
        phone: "ANONYMIZED",
        email: "ANONYMIZED",
        message: "ANONYMIZED",
        sourceIpHash: "ANONYMIZED",
        status: "anonymized",
        loanAmountRange: null,
        updatedAt
      });

      return true;
    });
  }

  public async deleteSubmissionsOlderThan(cutoffIsoDate: string): Promise<number> {
    const collectionReference = this.firestore.collection(INTAKE_SUBMISSIONS_COLLECTION);
    let totalDeletedCount = 0;

    while (true) {
      const snapshot = await collectionReference
        .where("createdAt", "<", cutoffIsoDate)
        .orderBy("createdAt", "asc")
        .limit(500)
        .get();

      if (snapshot.empty) {
        return totalDeletedCount;
      }

      const batch = this.firestore.batch();
      for (const document of snapshot.docs) {
        batch.delete(document.ref);
      }

      await batch.commit();
      totalDeletedCount += snapshot.size;
    }
  }

  public async isHealthy(): Promise<boolean> {
    try {
      await this.firestore.collection(INTAKE_SUBMISSIONS_COLLECTION).limit(1).get();
      return true;
    } catch {
      return false;
    }
  }

  private mapRecordToEntity(record: FirestoreIntakeSubmissionRecord): IntakeSubmission {
    const mappedSubmission: IntakeSubmission = {
      id: record.id,
      fullName: record.fullName,
      phone: record.phone,
      email: record.email,
      role: record.role,
      message: record.message,
      consent: record.consent,
      sourceIpHash: record.sourceIpHash,
      status: record.status,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    };

    if (record.loanAmountRange) {
      mappedSubmission.loanAmountRange = record.loanAmountRange;
    }

    return mappedSubmission;
  }
}

export type SubmissionRole = "borrower" | "lender" | "nbfc-bank" | "other";

export type LoanAmountRange =
  | "5L_25L"
  | "25L_1CR"
  | "1CR_5CR"
  | "5CR_PLUS"
  | "NOT_APPLICABLE";

export type SubmissionStatus = "new" | "in_review" | "closed" | "anonymized";

export interface IntakeSubmission {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  role: SubmissionRole;
  loanAmountRange?: LoanAmountRange;
  message: string;
  consent: boolean;
  sourceIpHash: string;
  status: SubmissionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface IntakeSubmissionCreateInput {
  fullName: string;
  phone: string;
  email: string;
  role: SubmissionRole;
  loanAmountRange?: LoanAmountRange;
  message: string;
  consent: boolean;
}

export interface IntakeSubmissionFilters {
  limit: number;
  offset: number;
}

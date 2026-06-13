export type PageName = "home" | "about" | "services" | "contact" | "auth";

export type RoleValue = "borrower" | "lender" | "nbfc-bank" | "other";

export type LoanAmountValue =
  | "5L_25L"
  | "25L_1CR"
  | "1CR_5CR"
  | "5CR_PLUS"
  | "NOT_APPLICABLE";

export interface IntakeSubmissionPayload {
  fullName: string;
  phone: string;
  email: string;
  role: RoleValue;
  loanAmountRange?: LoanAmountValue;
  message: string;
  consent: boolean;
  website: string;
}

export interface IntakeSubmissionResponse {
  submissionId: string;
  acceptedAt: string;
  message: string;
}

export type DevDashboardRole = "lender" | "requestor" | "super_admin";

export interface DashboardUserAccount {
  role: DevDashboardRole;
  displayName: string;
  email: string;
  profileId: string;
  onboardingCompleted: boolean;
  registrationStep: number;
  updatedAt: string;
}

export interface DevLoginAccount {
  role: DevDashboardRole;
  email: string;
  password: string;
  displayName: string;
  profileId: string;
  updatedAt: string;
}

export interface DevDashboardSession {
  role: DevDashboardRole;
  email: string;
  displayName: string;
  profileId: string;
  onboardingCompleted: boolean;
  registrationStep: number;
}

export interface DevLenderProfile {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  country: string;
  website: string;
  pan: string;
  gstNumber: string;
  cin: string;
  yearsInOperation: string;
  kycStatus: string;
  minTicket: string;
  maxTicket: string;
  sectors: string[];
  onboardingStep: number;
  onboardingCompleted: boolean;
  activeOpportunities: number;
  pendingReviews: number;
  totalDeployed: string;
  updatedAt: string;
}

export interface DevRequestorProfile {
  businessName: string;
  founderName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  country: string;
  website: string;
  sector: string;
  pan: string;
  gstNumber: string;
  yearsInOperation: string;
  monthlyRevenue: string;
  requestedAmount: string;
  approvedAmount: string;
  stage: string;
  status: string;
  onboardingStep: number;
  onboardingCompleted: boolean;
  nextAction: string;
  updatedAt: string;
}

export type ProfileDocumentType =
  | "PAN_CARD"
  | "GST_CERTIFICATE"
  | "BANK_STATEMENT"
  | "INCORPORATION_CERTIFICATE"
  | "FINANCIAL_STATEMENT"
  | "KYC_ADDRESS_PROOF"
  | "BOARD_RESOLUTION"
  | "LOAN_STATEMENT";

export interface ProfileDocumentRecord {
  id: string;
  profileId: string;
  role: "lender" | "requestor";
  documentType: ProfileDocumentType;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  downloadUrl: string;
  storagePath: string;
  uploadedByName: string;
  uploadedByEmail: string;
  uploadedAt: string;
  updatedAt: string;
}

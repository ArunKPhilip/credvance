import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  getLenderDashboardProfile,
  getRequestorDashboardProfile,
  loginToDashboard,
  logoutDashboardSession,
  registerDashboardAccount,
  updateDashboardOnboardingStatus,
  sendPasswordReset
} from "./api/devDashboardApi";
import { onFirebaseAuthStateChanged, tryReadDashboardUser, tryReadLegacyAppUser } from "./api/firebaseService";
import {
  flushLenderDashboardData,
  flushRequestorDashboardData,
  getLenderDashboardData,
  getRequestorDashboardData,
  patchLenderDashboardData,
  patchRequestorDashboardData
} from "./api/dashboardDataApi";
import {
  downloadProfileDocument,
  listProfileDocuments,
  uploadProfileDocument,
  viewProfileDocument
} from "./api/profileDocumentApi";
import { getSuperAdminOverview, type SuperAdminOverview } from "./api/superAdminApi";
import { submitIntakeSubmission } from "./api/intakeApi";
import type {
  DevDashboardRole,
  DevDashboardSession,
  DevLenderProfile,
  DevRequestorProfile,
  IntakeSubmissionPayload,
  LoanAmountValue,
  PageName,
  ProfileDocumentRecord,
  ProfileDocumentType,
  RoleValue
} from "./types";
import "./styles.css";

interface ContactFormState {
  fullName: string;
  phone: string;
  email: string;
  role: "" | RoleValue;
  loanAmountRange: "" | LoanAmountValue;
  message: string;
  consent: boolean;
  website: string;
}

type DashboardAuthMode = "signin" | "signup";

type DashboardSignInAccountType = "any" | DevDashboardRole;

interface DashboardSignInFormState {
  email: string;
  password: string;
  accountType: DashboardSignInAccountType;
}

interface DashboardSignUpFormState {
  role: Exclude<DevDashboardRole, "super_admin">;
  displayName: string;
  organizationName: string;
  phone: string;
  city: string;
  state: string;
  country: string;
  website: string;
  pan: string;
  gstNumber: string;
  yearsInOperation: string;
  cin: string;
  minTicket: string;
  maxTicket: string;
  sectorsInput: string;
  sector: string;
  stage: string;
  requestedAmount: string;
  monthlyRevenue: string;
  email: string;
  password: string;
  confirmPassword: string;
}

type SharedPortalSection = "overview" | "marketplace" | "documents" | "payments" | "support";
type LenderDeepDiveTab = "financials" | "kyc-docs" | "bank-analysis";
type DealAskBand = "ALL" | "UPTO_5CR" | "5CR_TO_10CR" | "ABOVE_10CR";
type DealVintageBand = "ALL" | "2_PLUS" | "3_PLUS";

interface LenderBankAnalysisRow {
  date: string;
  category: string;
  inflow: string;
  outflow: string;
  observation: string;
}

interface LenderDealOpportunity {
  id: string;
  companyName: string;
  industry: string;
  askAmountCr: number;
  revenueVintageYears: number;
  monthlyMrrLakh: number;
  churnPercent: number;
  monthlyRevenueCr: number;
  burnRateLakh: number;
  bankBalanceLakh: number;
  matchScore: number;
  operatingSince: string;
  cin: string;
  pan: string;
  directors: string[];
  kycDocuments?: string[];
  bankAnalysisRows?: LenderBankAnalysisRow[];
}

interface LenderRepaymentItem {
  borrower: string;
  dueDate: string;
  amountLakh: number;
  status: "Due" | "Received" | "Upcoming";
}

interface LenderPortfolioLoan {
  id: string;
  borrower: string;
  outstandingLakh: number;
  bankBalanceLakh: number;
  warningThresholdLakh: number;
  installmentsPaid: number;
  totalInstallments: number;
  nextDueDate: string;
}

interface PayoutLogItem {
  settlementDate: string;
  borrower: string;
  amountLakh: number;
  settlementReference: string;
  status: "Settled" | "Processing";
}

interface TaxCertificateItem {
  label: string;
  period: string;
  updatedAt: string;
}

interface BorrowerOfferItem {
  id: string;
  lenderName: string;
  offerAmountCr: number;
  aprPercent: number;
  processingFeePercent: number;
  tenureMonths: number;
  status: "Available" | "Shortlisted" | "Accepted";
}

interface BorrowerRepaymentItem {
  dueDate: string;
  amountLakh: number;
  status: "Paid" | "Due" | "Upcoming";
  utr: string;
}

interface BorrowerIntegrationItem {
  id: string;
  name: string;
  status: "Connected" | "Revoked";
  lastSyncAt: string;
}

interface BorrowerKfsPaymentRow {
  dueDate: string;
  amountLakh: number;
}

interface LenderEvidenceLogItem {
  loanId: string;
  borrower: string;
  utrNumber: string;
  settledAt: string;
  amountLakh: number;
}

const emptyContactForm: ContactFormState = {
  fullName: "",
  phone: "",
  email: "",
  role: "",
  loanAmountRange: "",
  message: "",
  consent: false,
  website: ""
};

const emptyDashboardSignInForm: DashboardSignInFormState = {
  email: "",
  password: "",
  accountType: "any"
};

const emptyDashboardSignUpForm: DashboardSignUpFormState = {
  role: "requestor",
  displayName: "",
  organizationName: "",
  phone: "",
  city: "",
  state: "",
  country: "India",
  website: "",
  pan: "",
  gstNumber: "",
  yearsInOperation: "",
  cin: "",
  minTicket: "25L",
  maxTicket: "1Cr",
  sectorsInput: "",
  sector: "",
  stage: "Growth",
  requestedAmount: "",
  monthlyRevenue: "",
  email: "",
  password: "",
  confirmPassword: ""
};

const profileDocumentTypeLabels: Record<ProfileDocumentType, string> = {
  PAN_CARD: "PAN Card",
  GST_CERTIFICATE: "GST Certificate",
  BANK_STATEMENT: "Bank Statement (Last 6 Months)",
  INCORPORATION_CERTIFICATE: "Incorporation Certificate",
  FINANCIAL_STATEMENT: "Financial Statement",
  KYC_ADDRESS_PROOF: "Address Proof",
  BOARD_RESOLUTION: "Board Resolution",
  LOAN_STATEMENT: "Existing Loan Statement"
};

const requiredDocumentsByRole: Record<"lender" | "requestor", ProfileDocumentType[]> = {
  lender: [
    "PAN_CARD",
    "GST_CERTIFICATE",
    "INCORPORATION_CERTIFICATE",
    "BANK_STATEMENT",
    "BOARD_RESOLUTION"
  ],
  requestor: ["PAN_CARD", "GST_CERTIFICATE", "BANK_STATEMENT", "FINANCIAL_STATEMENT", "LOAN_STATEMENT"]
};

const mobileNavigationStyleBase = {
  position: "fixed",
  top: "70px",
  left: 0,
  right: 0,
  bottom: 0,
  background: "rgba(255,255,255,.98)",
  zIndex: 998,
  padding: "36px",
  flexDirection: "column",
  gap: "28px"
} as const;

type RouteSectionView = "full" | "account";

interface RouteState {
  page: PageName;
  section: RouteSectionView;
  authMode: DashboardAuthMode;
  portalSection: SharedPortalSection;
}

function normalizePathname(pathname: string): string {
  const normalized = pathname.trim().toLowerCase();

  if (!normalized || normalized === "/") {
    return "/";
  }

  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

function resolveAuthModeFromQuery(value: string | null): DashboardAuthMode {
  return value === "signup" ? "signup" : "signin";
}

function resolvePortalSectionFromQuery(value: string | null): SharedPortalSection {
  if (value === "marketplace" || value === "documents" || value === "payments" || value === "support") {
    return value;
  }

  return "overview";
}

function resolveRouteStateFromLocation(pathname: string, search: string): RouteState {
  const normalizedPath = normalizePathname(pathname);
  const searchParams = new URLSearchParams(search);
  const authMode = resolveAuthModeFromQuery(searchParams.get("mode"));
  const portalSection = resolvePortalSectionFromQuery(searchParams.get("section"));

  if (normalizedPath === "/about") {
    return { page: "about", section: "full", authMode, portalSection };
  }

  if (normalizedPath === "/services") {
    return { page: "services", section: "full", authMode, portalSection };
  }

  if (normalizedPath === "/contact") {
    return { page: "contact", section: "full", authMode, portalSection };
  }

  if (normalizedPath === "/auth") {
    return { page: "auth", section: "account", authMode, portalSection };
  }

  if (normalizedPath === "/workspace") {
    return { page: "contact", section: "account", authMode, portalSection };
  }

  return { page: "home", section: "full", authMode, portalSection };
}

function resolvePathFromRouteState(
  page: PageName,
  section: RouteSectionView,
  hasSession: boolean,
  authMode: DashboardAuthMode,
  portalSection: SharedPortalSection
): string {
  if (hasSession || (page === "contact" && section === "account")) {
    return `/workspace?section=${portalSection}`;
  }

  if (page === "about") {
    return "/about";
  }

  if (page === "services") {
    return "/services";
  }

  if (page === "contact") {
    return "/contact";
  }

  if (page === "auth") {
    return `/auth?mode=${authMode}`;
  }

  return "/";
}

function getInitialRouteState(): RouteState {
  if (typeof window === "undefined") {
    return { page: "home", section: "full", authMode: "signin", portalSection: "overview" };
  }

  return resolveRouteStateFromLocation(window.location.pathname, window.location.search);
}

function App(): JSX.Element {
  const [activePage, setActivePage] = useState<PageName>(() => getInitialRouteState().page);
  const [contactSectionView, setContactSectionView] = useState<RouteSectionView>(() => getInitialRouteState().section);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [formError, setFormError] = useState("");
  const [formState, setFormState] = useState<ContactFormState>(emptyContactForm);
  const [dashboardAuthMode, setDashboardAuthMode] = useState<DashboardAuthMode>(() => getInitialRouteState().authMode);
  const [signInForm, setSignInForm] = useState<DashboardSignInFormState>(emptyDashboardSignInForm);
  const [signUpForm, setSignUpForm] = useState<DashboardSignUpFormState>(emptyDashboardSignUpForm);
  const [signupStep, setSignupStep] = useState<number>(1);
  const [showPassword, setShowPassword] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isDashboardAuthSubmitting, setIsDashboardAuthSubmitting] = useState(false);
  const [devAuthError, setDevAuthError] = useState("");
  const [devSession, setDevSession] = useState<DevDashboardSession | null>(null);
  const [lenderProfile, setLenderProfile] = useState<DevLenderProfile | null>(null);
  const [requestorProfile, setRequestorProfile] = useState<DevRequestorProfile | null>(null);
  const [isDashboardDataLoading, setIsDashboardDataLoading] = useState(false);
  const [activePortalSection, setActivePortalSection] = useState<SharedPortalSection>(
    () => getInitialRouteState().portalSection
  );
  const [activeDeepDiveTab, setActiveDeepDiveTab] = useState<LenderDeepDiveTab>("financials");
  const [lenderDeals, setLenderDeals] = useState<LenderDealOpportunity[]>([]);
  const [lenderRepayments, setLenderRepayments] = useState<LenderRepaymentItem[]>([]);
  const [lenderPortfolio, setLenderPortfolio] = useState<LenderPortfolioLoan[]>([]);
  const [lenderPayoutEntries, setLenderPayoutEntries] = useState<PayoutLogItem[]>([]);
  const [lenderCertificates, setLenderCertificates] = useState<TaxCertificateItem[]>([]);
  const [lenderEvidenceEntries, setLenderEvidenceEntries] = useState<LenderEvidenceLogItem[]>([]);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [dealIndustryFilter, setDealIndustryFilter] = useState<string>("ALL");
  const [dealAskBandFilter, setDealAskBandFilter] = useState<DealAskBand>("ALL");
  const [dealVintageFilter, setDealVintageFilter] = useState<DealVintageBand>("ALL");
  const [liveInterestCounter, setLiveInterestCounter] = useState<number>(0);
  const [showComparisonMatrix, setShowComparisonMatrix] = useState(false);
  const [biddingInputs, setBiddingInputs] = useState({
    interestRate: "",
    tenureMonths: "",
    moratoriumMonths: ""
  });
  const [borrowerOffersState, setBorrowerOffersState] = useState<BorrowerOfferItem[]>([]);
  const [borrowerRepaymentState, setBorrowerRepaymentState] = useState<BorrowerRepaymentItem[]>([]);
  const [borrowerKfsRows, setBorrowerKfsRows] = useState<BorrowerKfsPaymentRow[]>([]);
  const [selectedBorrowerOfferId, setSelectedBorrowerOfferId] = useState<string | null>(null);
  const [acceptedBorrowerOfferId, setAcceptedBorrowerOfferId] = useState<string | null>(null);
  const [borrowerDrawdownPercent, setBorrowerDrawdownPercent] = useState<number>(40);
  const [borrowerIntegrations, setBorrowerIntegrations] = useState<BorrowerIntegrationItem[]>([]);
  const [borrowerKfsAccepted, setBorrowerKfsAccepted] = useState(false);
  const [borrowerAutopayEnabled, setBorrowerAutopayEnabled] = useState(true);
  const [profileDocuments, setProfileDocuments] = useState<ProfileDocumentRecord[]>([]);
  const [selectedProfileDocumentType, setSelectedProfileDocumentType] = useState<ProfileDocumentType>("PAN_CARD");
  const [selectedProfileDocumentFile, setSelectedProfileDocumentFile] = useState<File | null>(null);
  const [documentUploadInputKey, setDocumentUploadInputKey] = useState(0);
  const [isDocumentUploadSubmitting, setIsDocumentUploadSubmitting] = useState(false);
  const [documentUploadProgressPercent, setDocumentUploadProgressPercent] = useState<number | null>(null);
  const [documentUploadError, setDocumentUploadError] = useState("");
  const [superAdminOverview, setSuperAdminOverview] = useState<SuperAdminOverview | null>(null);
  const [isSuperAdminLoading, setIsSuperAdminLoading] = useState(false);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timeoutHandle = window.setTimeout(() => {
      setToastMessage("");
    }, 3200);

    return () => {
      window.clearTimeout(timeoutHandle);
    };
  }, [toastMessage]);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const mobileNavigationStyle = useMemo(
    () => ({
      ...mobileNavigationStyleBase,
      display: mobileNavOpen ? "flex" : "none"
    }),
    [mobileNavOpen]
  );

  const lenderIndustries = useMemo(
    () => Array.from(new Set(lenderDeals.map((deal) => deal.industry))),
    [lenderDeals]
  );

  const filteredDeals = useMemo(
    () =>
      lenderDeals.filter((deal) => {
        const industryMatches = dealIndustryFilter === "ALL" || deal.industry === dealIndustryFilter;
        const askBandMatches =
          dealAskBandFilter === "ALL" ||
          (dealAskBandFilter === "UPTO_5CR" && deal.askAmountCr <= 5) ||
          (dealAskBandFilter === "5CR_TO_10CR" && deal.askAmountCr > 5 && deal.askAmountCr <= 10) ||
          (dealAskBandFilter === "ABOVE_10CR" && deal.askAmountCr > 10);
        const vintageMatches =
          dealVintageFilter === "ALL" ||
          (dealVintageFilter === "2_PLUS" && deal.revenueVintageYears >= 2) ||
          (dealVintageFilter === "3_PLUS" && deal.revenueVintageYears >= 3);

        return industryMatches && askBandMatches && vintageMatches;
      }),
    [dealAskBandFilter, dealIndustryFilter, dealVintageFilter, lenderDeals]
  );

  const selectedDeal = useMemo(
    () => lenderDeals.find((deal) => deal.id === selectedDealId) ?? lenderDeals[0] ?? null,
    [lenderDeals, selectedDealId]
  );

  const selectedBorrowerOffer = useMemo(
    () => borrowerOffersState.find((offer) => offer.id === selectedBorrowerOfferId) ?? borrowerOffersState[0] ?? null,
    [borrowerOffersState, selectedBorrowerOfferId]
  );

  const acceptedBorrowerOffer = useMemo(
    () => borrowerOffersState.find((offer) => offer.id === acceptedBorrowerOfferId) ?? null,
    [acceptedBorrowerOfferId, borrowerOffersState]
  );

  const borrowerApprovedAmountValue = useMemo(
    () => Number((requestorProfile?.approvedAmount ?? "0").replace(/[^0-9.]/g, "") || "0"),
    [requestorProfile?.approvedAmount]
  );

  const borrowerRequestedAmountValue = useMemo(
    () => Number((requestorProfile?.requestedAmount ?? "0").replace(/[^0-9.]/g, "") || "0"),
    [requestorProfile?.requestedAmount]
  );

  const borrowerCapitalLimitCr = useMemo(
    () =>
      borrowerApprovedAmountValue > 0
        ? borrowerApprovedAmountValue / 10000000
        : acceptedBorrowerOffer?.offerAmountCr ?? selectedBorrowerOffer?.offerAmountCr ?? 0,
    [acceptedBorrowerOffer?.offerAmountCr, borrowerApprovedAmountValue, selectedBorrowerOffer?.offerAmountCr]
  );

  const borrowerDrawdownAmountCr = useMemo(
    () => Number(((borrowerCapitalLimitCr * borrowerDrawdownPercent) / 100).toFixed(2)),
    [borrowerCapitalLimitCr, borrowerDrawdownPercent]
  );

  const borrowerOfferForPricing = acceptedBorrowerOffer ?? selectedBorrowerOffer;

  const borrowerEstimatedMonthlyEmiLakh = useMemo(() => {
    if (!borrowerOfferForPricing || borrowerDrawdownAmountCr <= 0) {
      return 0;
    }

    const principal = borrowerDrawdownAmountCr * 10000000;
    const tenureMonths = Math.max(1, borrowerOfferForPricing.tenureMonths);
    const monthlyRate = borrowerOfferForPricing.aprPercent / 100 / 12;

    if (monthlyRate <= 0) {
      return Number((principal / tenureMonths / 100000).toFixed(2));
    }

    const growthFactor = Math.pow(1 + monthlyRate, tenureMonths);
    const emi = (principal * monthlyRate * growthFactor) / (growthFactor - 1);
    return Number((emi / 100000).toFixed(2));
  }, [borrowerDrawdownAmountCr, borrowerOfferForPricing]);

  const comparisonDeals = useMemo(() => {
    const topDeals = [...filteredDeals]
      .sort((dealA, dealB) => dealB.matchScore - dealA.matchScore)
      .slice(0, 3);

    if (selectedDeal && !topDeals.some((deal) => deal.id === selectedDeal.id)) {
      topDeals.unshift(selectedDeal);
    }

    return topDeals.slice(0, 3);
  }, [filteredDeals, selectedDeal]);

  const totalAumLakh = useMemo(
    () => lenderPortfolio.reduce((total, loan) => total + loan.outstandingLakh, 0),
    [lenderPortfolio]
  );

  const totalSettledLakh = useMemo(
    () => lenderPayoutEntries.reduce((total, entry) => total + entry.amountLakh, 0),
    [lenderPayoutEntries]
  );

  const dueThisMonthCount = useMemo(
    () => lenderRepayments.filter((repayment) => repayment.status !== "Received").length,
    [lenderRepayments]
  );

  const requiredRegistrationDocuments = useMemo(() => {
    if (devSession?.role === "lender") {
      return requiredDocumentsByRole.lender;
    }

    if (devSession?.role === "requestor") {
      return requiredDocumentsByRole.requestor;
    }

    return [];
  }, [devSession?.role]);

  const uploadedDocumentTypeSet = useMemo(
    () => new Set(profileDocuments.map((document) => document.documentType)),
    [profileDocuments]
  );

  const missingRegistrationDocuments = useMemo(
    () => requiredRegistrationDocuments.filter((documentType) => !uploadedDocumentTypeSet.has(documentType)),
    [requiredRegistrationDocuments, uploadedDocumentTypeSet]
  );

  const isRegistrationSectionTwoComplete = useMemo(() => {
    if (requiredRegistrationDocuments.length === 0) {
      return true;
    }

    return missingRegistrationDocuments.length === 0;
  }, [missingRegistrationDocuments.length, requiredRegistrationDocuments.length]);

  const orderedProfileDocuments = useMemo(
    () => [...profileDocuments].sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt)),
    [profileDocuments]
  );

  const showToast = (message: string): void => {
    setToastMessage(message);
  };

  const formatInrFromLakhs = (valueInLakhs: number): string => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0
    }).format(valueInLakhs * 100000);
  };

  const formatInrValue = (amount: number): string => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0
    }).format(amount);
  };

  const closeMobileNavigation = (): void => {
    setMobileNavOpen(false);
  };

  const updateBrowserRoute = (
    page: PageName,
    section: RouteSectionView,
    options?: {
      replace?: boolean;
      hasSession?: boolean;
      authMode?: DashboardAuthMode;
      portalSection?: SharedPortalSection;
    }
  ): void => {
    if (typeof window === "undefined") {
      return;
    }

    const targetPath = resolvePathFromRouteState(
      page,
      section,
      options?.hasSession ?? Boolean(devSession),
      options?.authMode ?? dashboardAuthMode,
      options?.portalSection ?? activePortalSection
    );
    const currentPathWithQuery = `${normalizePathname(window.location.pathname)}${window.location.search}`;
    const targetUrl = new URL(targetPath, window.location.origin);
    const normalizedTarget = `${normalizePathname(targetUrl.pathname)}${targetUrl.search}`;

    if (currentPathWithQuery === normalizedTarget) {
      return;
    }

    if (options?.replace) {
      window.history.replaceState({}, "", normalizedTarget);
      return;
    }

    window.history.pushState({}, "", normalizedTarget);
  };

  // Firebase auth state listener for session persistence across page reloads
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const unsubscribe = onFirebaseAuthStateChanged(async (firebaseUser) => {
      if (!firebaseUser) {
        // No firebase user - clear session if we have one
        if (devSession) {
          setDevSession(null);
          setLenderProfile(null);
          setRequestorProfile(null);
          setDevAuthError("");
          setDashboardAuthMode("signin");
          setSignInForm(emptyDashboardSignInForm);
          setActivePage("home");
          setContactSectionView("full");
          updateBrowserRoute("home", "full", { replace: true, hasSession: false });
          resetDashboardWorkspaceState();
        }
        return;
      }

      // Firebase user exists - check if we already have a session loaded
      if (devSession) {
        return;
      }

      // Try to load the session from Firestore
      try {
        const userDoc = await tryReadDashboardUser(firebaseUser.uid) || await tryReadLegacyAppUser(firebaseUser.uid);
        if (!userDoc) {
          return;
        }

        const session: DevDashboardSession = {
          role: userDoc.role,
          email: userDoc.email,
          displayName: userDoc.displayName,
          profileId: userDoc.profileId,
          onboardingCompleted: userDoc.onboardingCompleted,
          registrationStep: userDoc.registrationStep
        };

        setDevSession(session);
        setActivePage("contact");
        setContactSectionView("account");
        setWorkspaceSectionAndRoute("overview", { replace: true });
        await hydrateDashboardSession(session);
      } catch {
        // Firebase user exists but no dashboard user doc yet - ignore
      }
    });

    return () => {
      unsubscribe();
    };
  }, []); // Only run on mount

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const applyRouteFromLocation = (): void => {
      const routeState = resolveRouteStateFromLocation(window.location.pathname, window.location.search);

      if (!devSession && routeState.page === "contact" && routeState.section === "account") {
        setActivePage("auth");
        setContactSectionView("account");
        setDashboardAuthMode(routeState.authMode);
        setActivePortalSection(routeState.portalSection);
        setDevAuthError("");
        updateBrowserRoute("auth", "account", {
          replace: true,
          hasSession: false,
          authMode: routeState.authMode,
          portalSection: routeState.portalSection
        });
        return;
      }

      if (devSession && (routeState.section === "full" || routeState.page === "auth")) {
        setActivePage("contact");
        setContactSectionView("account");
        setActivePortalSection(routeState.portalSection);
        updateBrowserRoute("contact", "account", {
          replace: true,
          hasSession: true,
          portalSection: routeState.portalSection
        });
        return;
      }

      setActivePage(routeState.page);
      setContactSectionView(routeState.section);
      setMobileNavOpen(false);

      if (routeState.page === "contact" && routeState.section === "account") {
        setActivePortalSection(routeState.portalSection);
      }

      if (routeState.page === "auth") {
        setDashboardAuthMode(routeState.authMode);
        setDevAuthError("");
      }
    };

    const handlePopState = (): void => {
      applyRouteFromLocation();
      window.scrollTo({ top: 0, behavior: "smooth" });
    };

    window.addEventListener("popstate", handlePopState);
    applyRouteFromLocation();

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [devSession]);

  const showPage = (page: PageName, preferredRole?: RoleValue): void => {
    const nextPage = devSession ? "contact" : page;
    const nextSection: RouteSectionView =
      nextPage === "auth" || (nextPage === "contact" && devSession) ? "account" : "full";

    setActivePage(nextPage);
    setMobileNavOpen(false);
    setContactSectionView(nextSection);
    updateBrowserRoute(nextPage, nextSection, { hasSession: Boolean(devSession) });

    if (nextPage === "contact" && preferredRole && !devSession) {
      setFormState((currentState) => ({
        ...currentState,
        role: preferredRole,
        loanAmountRange: preferredRole === "borrower" ? currentState.loanAmountRange : "NOT_APPLICABLE"
      }));
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const prefillAccountFormsFromContact = (contactValues: {
    fullName: string;
    phone: string;
    email: string;
    role: "" | RoleValue;
  }): void => {
    const normalizedName = contactValues.fullName.trim();
    const normalizedPhone = contactValues.phone.trim();
    const normalizedEmail = contactValues.email.trim().toLowerCase();

    setSignInForm((currentState) => ({
      ...currentState,
      email: normalizedEmail || currentState.email
    }));

    setSignUpForm((currentState) => ({
      ...currentState,
      role: "requestor",
      displayName: normalizedName || currentState.displayName,
      phone: normalizedPhone || currentState.phone,
      email: normalizedEmail || currentState.email
    }));
  };

  const scrollToAccountAccessSection = (): void => {
    window.setTimeout(() => {
      document.getElementById("account-access-section")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }, 40);
  };

  const openAccountAccess = (mode: DashboardAuthMode): void => {
    prefillAccountFormsFromContact({
      fullName: formState.fullName,
      phone: formState.phone,
      email: formState.email,
      role: formState.role
    });

    if (mode === "signup") {
      showPage("auth");
      setSignUpForm((currentState) => ({
        ...currentState,
        role: "requestor"
      }));
      setFormState((currentState) => ({
        ...currentState,
        role: "borrower",
        loanAmountRange: currentState.loanAmountRange === "NOT_APPLICABLE" ? "" : currentState.loanAmountRange
      }));
    } else {
      showPage("auth");
      setSignInForm((currentState) => ({
        ...currentState,
        accountType: "any"
      }));
    }

    setContactSectionView("account");
    setDashboardAuthMode(mode);
    updateBrowserRoute("auth", "account", {
      replace: true,
      hasSession: false,
      authMode: mode
    });
    setDevAuthError("");
    scrollToAccountAccessSection();
  };

  const setWorkspaceSectionAndRoute = (
    portalSection: SharedPortalSection,
    options?: {
      replace?: boolean;
    }
  ): void => {
    setActivePortalSection(portalSection);

    if (devSession) {
      const routeOptions: {
        hasSession: boolean;
        portalSection: SharedPortalSection;
        replace?: boolean;
      } = {
        hasSession: true,
        portalSection
      };

      if (options?.replace !== undefined) {
        routeOptions.replace = options.replace;
      }

      updateBrowserRoute("contact", "account", routeOptions);
    }
  };

  const openWorkspace = (portalSection: SharedPortalSection = "overview"): void => {
    if (!devSession) {
      openAccountAccess("signin");
      return;
    }

    setActivePage("contact");
    setContactSectionView("account");
    setWorkspaceSectionAndRoute(portalSection);
    setMobileNavOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetDashboardWorkspaceState = (): void => {
    setActivePortalSection("overview");
    setActiveDeepDiveTab("financials");
    setSelectedDealId(null);
    setDealIndustryFilter("ALL");
    setDealAskBandFilter("ALL");
    setDealVintageFilter("ALL");
    setShowComparisonMatrix(false);
    setSelectedBorrowerOfferId(null);
    setAcceptedBorrowerOfferId(null);
    setBorrowerDrawdownPercent(40);
    setBorrowerIntegrations([]);
    setBorrowerKfsAccepted(false);
    setBorrowerAutopayEnabled(true);
    setBiddingInputs({
      interestRate: "",
      tenureMonths: "",
      moratoriumMonths: ""
    });
    setLiveInterestCounter(0);
    setLenderDeals([]);
    setLenderRepayments([]);
    setLenderPortfolio([]);
    setLenderPayoutEntries([]);
    setLenderCertificates([]);
    setLenderEvidenceEntries([]);
    setBorrowerOffersState([]);
    setBorrowerRepaymentState([]);
    setBorrowerKfsRows([]);
    setProfileDocuments([]);
    setSelectedProfileDocumentType("PAN_CARD");
    setSelectedProfileDocumentFile(null);
    setDocumentUploadInputKey((currentValue) => currentValue + 1);
    setDocumentUploadProgressPercent(null);
    setDocumentUploadError("");
    setSuperAdminOverview(null);
    setIsSuperAdminLoading(false);
  };

  const persistLenderDashboardPatch = async (patch: Record<string, unknown>): Promise<void> => {
    if (devSession?.role !== "lender") {
      return;
    }

    try {
      await patchLenderDashboardData(devSession.profileId, patch);
    } catch {
      showToast("Unable to sync lender workspace changes right now.");
    }
  };

  const persistRequestorDashboardPatch = async (patch: Record<string, unknown>): Promise<void> => {
    if (devSession?.role !== "requestor") {
      return;
    }

    try {
      await patchRequestorDashboardData(devSession.profileId, patch);
    } catch {
      showToast("Unable to sync borrower workspace changes right now.");
    }
  };

  const hydrateDashboardSession = async (session: DevDashboardSession): Promise<void> => {
    setIsDashboardDataLoading(true);

    if (session.role === "super_admin") {
      setIsSuperAdminLoading(true);

      try {
        const overview = await getSuperAdminOverview();
        setSuperAdminOverview(overview);
        setLenderProfile(null);
        setRequestorProfile(null);
        setProfileDocuments([]);
        setLenderDeals([]);
        setLenderRepayments([]);
        setLenderPortfolio([]);
        setLenderPayoutEntries([]);
        setLenderCertificates([]);
        setLenderEvidenceEntries([]);
        setBorrowerOffersState([]);
        setBorrowerRepaymentState([]);
        setBorrowerIntegrations([]);
        setBorrowerKfsRows([]);
      } finally {
        setIsSuperAdminLoading(false);
        setIsDashboardDataLoading(false);
      }

      return;
    }

    if (session.role === "lender") {
      try {
        const [profile, dashboardData, documents] = await Promise.all([
          getLenderDashboardProfile(session.profileId).catch(() => null),
          getLenderDashboardData(session.profileId).catch(() => ({
            opportunities: [], repaymentSchedule: [], portfolioLoans: [],
            payoutLogs: [], taxCertificates: [], evidenceLogs: [],
            selectedDealId: null, liveInterestCounter: 0,
            biddingInputs: { interestRate: "", tenureMonths: "", moratoriumMonths: "" }
          })),
          listProfileDocuments(session.profileId).catch(() => [])
        ]);

        const safeProfile = profile || {
          companyName: "Your Company", contactName: session.displayName || "User",
          email: session.email, phone: "", city: "", state: "",
          country: "India", website: "", pan: "", gstNumber: "", cin: "",
          yearsInOperation: "", kycStatus: "Pending", minTicket: "25L",
          maxTicket: "1Cr", sectors: [], onboardingStep: 1,
          onboardingCompleted: false, activeOpportunities: 0,
          pendingReviews: 0, totalDeployed: "0", updatedAt: new Date().toISOString()
        } as DevLenderProfile;

        const safeDocs = Array.isArray(documents) ? documents : [];
        const safeData = dashboardData || {
          opportunities: [], repaymentSchedule: [], portfolioLoans: [],
          payoutLogs: [], taxCertificates: [], evidenceLogs: [],
          selectedDealId: null, liveInterestCounter: 0,
          biddingInputs: { interestRate: "", tenureMonths: "", moratoriumMonths: "" }
        };

        const requiredDocs = requiredDocumentsByRole.lender;
        const uploadedTypes = new Set(safeDocs.map((document) => document.documentType));
        const onboardingCompleted = requiredDocs.every((documentType) => uploadedTypes.has(documentType));

        setLenderProfile(safeProfile);
        setRequestorProfile(null);
        setSuperAdminOverview(null);
        setProfileDocuments(safeDocs);
        setLenderDeals(safeData.opportunities);
        setLenderRepayments(safeData.repaymentSchedule);
        setLenderPortfolio(safeData.portfolioLoans);
        setLenderPayoutEntries(safeData.payoutLogs);
        setLenderCertificates(safeData.taxCertificates);
        setLenderEvidenceEntries(safeData.evidenceLogs);
        setSelectedDealId(safeData.selectedDealId ?? safeData.opportunities[0]?.id ?? null);
        setLiveInterestCounter(safeData.liveInterestCounter);
        setBiddingInputs(safeData.biddingInputs);
        setBorrowerOffersState([]);
        setBorrowerRepaymentState([]);
        setBorrowerIntegrations([]);
        setBorrowerKfsRows([]);

        if (onboardingCompleted !== session.onboardingCompleted) {
          void updateDashboardOnboardingStatus(session.profileId, "lender", onboardingCompleted, onboardingCompleted ? 2 : 1);
        }

        setDevSession((currentSession) =>
          currentSession && currentSession.profileId === session.profileId
            ? {
                ...currentSession,
                onboardingCompleted,
                registrationStep: onboardingCompleted ? 2 : 1
              }
            : currentSession
        );
      } finally {
        setIsDashboardDataLoading(false);
      }

      return;
    }

    try {
      const [profile, dashboardData, documents] = await Promise.all([
        getRequestorDashboardProfile(session.profileId).catch(() => null),
        getRequestorDashboardData(session.profileId).catch(() => ({
          offers: [], repaymentHistory: [], integrations: [],
          kfsScheduleRows: [], selectedOfferId: null, acceptedOfferId: null,
          drawdownPercent: 40, kfsAccepted: false, autopayEnabled: true
        })),
        listProfileDocuments(session.profileId).catch(() => [])
      ]);

      const safeProfile = profile || {
        businessName: "Your Business", founderName: session.displayName || "User",
        email: session.email, phone: "", city: "", state: "",
        country: "India", website: "", sector: "", pan: "", gstNumber: "",
        yearsInOperation: "", monthlyRevenue: "", requestedAmount: "",
        approvedAmount: "0", stage: "Registration", status: "Pending",
        onboardingStep: 1, onboardingCompleted: false,
        nextAction: "Complete registration and upload documents",
        updatedAt: new Date().toISOString()
      } as DevRequestorProfile;

      const safeDocs = Array.isArray(documents) ? documents : [];
      const safeData = dashboardData || {
        offers: [], repaymentHistory: [], integrations: [],
        kfsScheduleRows: [], selectedOfferId: null, acceptedOfferId: null,
        drawdownPercent: 40, kfsAccepted: false, autopayEnabled: true
      };

      const requiredDocs = requiredDocumentsByRole.requestor;
      const uploadedTypes = new Set(safeDocs.map((document) => document.documentType));
      const onboardingCompleted = requiredDocs.every((documentType) => uploadedTypes.has(documentType));

      setRequestorProfile(safeProfile);
      setLenderProfile(null);
      setSuperAdminOverview(null);
      setProfileDocuments(safeDocs);
      setBorrowerOffersState(safeData.offers);
      setBorrowerRepaymentState(safeData.repaymentHistory);
      setBorrowerIntegrations(safeData.integrations);
      setBorrowerKfsRows(safeData.kfsScheduleRows);
      setSelectedBorrowerOfferId(safeData.selectedOfferId ?? safeData.offers[0]?.id ?? null);
      setAcceptedBorrowerOfferId(safeData.acceptedOfferId);
      setBorrowerDrawdownPercent(safeData.drawdownPercent);
      setBorrowerKfsAccepted(safeData.kfsAccepted);
      setBorrowerAutopayEnabled(safeData.autopayEnabled);
      setLenderDeals([]);
      setLenderRepayments([]);
      setLenderPortfolio([]);
      setLenderPayoutEntries([]);
      setLenderCertificates([]);
      setLenderEvidenceEntries([]);

      if (onboardingCompleted !== session.onboardingCompleted) {
        void updateDashboardOnboardingStatus(session.profileId, "requestor", onboardingCompleted, onboardingCompleted ? 2 : 1);
      }

      setDevSession((currentSession) =>
        currentSession && currentSession.profileId === session.profileId
          ? {
              ...currentSession,
              onboardingCompleted,
              registrationStep: onboardingCompleted ? 2 : 1
            }
          : currentSession
      );
    } finally {
      setIsDashboardDataLoading(false);
    }
  };

  const resetDevLogin = (): void => {
    void logoutDashboardSession();
    setDevSession(null);
    setLenderProfile(null);
    setRequestorProfile(null);
    setDevAuthError("");
    setDashboardAuthMode("signin");
    setSignInForm(emptyDashboardSignInForm);
    setSignUpForm(emptyDashboardSignUpForm);
    setActivePage("home");
    setContactSectionView("full");
    updateBrowserRoute("home", "full", { replace: true, hasSession: false });
    resetDashboardWorkspaceState();
  };

  const submitDashboardSignIn = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (!signInForm.email.trim() || !signInForm.password.trim()) {
      setDevAuthError("Email and password are required.");
      return;
    }

    setDevAuthError("");
    setIsDashboardAuthSubmitting(true);

    try {
      const session = await loginToDashboard(signInForm.email, signInForm.password);

      if (signInForm.accountType !== "any" && session.role !== signInForm.accountType) {
        await logoutDashboardSession();
        throw new Error(`This account is registered as ${session.role.replace("_", " ")}. Select the correct login type.`);
      }

      setDevSession(session);
      setActivePage("contact");
      setContactSectionView("account");
      setWorkspaceSectionAndRoute("overview", { replace: true });
      await hydrateDashboardSession(session);
      showToast(`Signed in as ${session.displayName}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to log in right now.";
      setDevAuthError(message);
      showToast(message);
    } finally {
      setIsDashboardAuthSubmitting(false);
    }
  };

  const handleForgotPassword = async (): Promise<void> => {
    if (!signInForm.email.trim()) {
      setDevAuthError("Please enter your email address first.");
      return;
    }
    setDevAuthError("");
    setIsDashboardAuthSubmitting(true);
    try {
      await sendPasswordReset(signInForm.email.trim());
      showToast("Password reset email sent! Check your inbox.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to send reset email.";
      setDevAuthError(message);
    } finally {
      setIsDashboardAuthSubmitting(false);
    }
  };

  const validateSignupStep = (step: number): boolean => {
    setDevAuthError("");
    if (step === 1) {
      if (!signUpForm.displayName.trim() || !signUpForm.organizationName.trim() || !signUpForm.phone.trim() || !signUpForm.city.trim() || !signUpForm.country.trim() || !signUpForm.email.trim()) {
        setDevAuthError("Please fill all required fields in this step.");
        return false;
      }
    } else if (step === 2) {
      if (!signUpForm.pan.trim() || (signUpForm.role === "requestor" && (!signUpForm.sector.trim() || !signUpForm.requestedAmount.trim()))) {
        setDevAuthError("Please fill all required fields in this step.");
        return false;
      }
    }
    return true;
  };

  const submitDashboardSignUp = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (!validateSignupStep(1) || !validateSignupStep(2)) return;

    if (signUpForm.password.length < 8) {
      setDevAuthError("Password must be at least 8 characters long.");
      return;
    }

    if (!/[A-Za-z]/.test(signUpForm.password) || !/[0-9]/.test(signUpForm.password)) {
      setDevAuthError("Password must include both letters and numbers.");
      return;
    }

    if (signUpForm.password !== signUpForm.confirmPassword) {
      setDevAuthError("Password and confirm password do not match.");
      return;
    }

    setDevAuthError("");
    setIsDashboardAuthSubmitting(true);

    try {
      const session = await registerDashboardAccount({
        role: signUpForm.role,
        displayName: signUpForm.displayName,
        organizationName: signUpForm.organizationName,
        phone: signUpForm.phone,
        city: signUpForm.city,
        state: signUpForm.state,
        country: signUpForm.country,
        website: signUpForm.website,
        pan: signUpForm.pan,
        gstNumber: signUpForm.gstNumber,
        yearsInOperation: signUpForm.yearsInOperation,
        cin: signUpForm.cin,
        minTicket: signUpForm.minTicket,
        maxTicket: signUpForm.maxTicket,
        sectorsInput: signUpForm.sectorsInput,
        sector: signUpForm.sector,
        stage: signUpForm.stage,
        requestedAmount: signUpForm.requestedAmount,
        monthlyRevenue: signUpForm.monthlyRevenue,
        email: signUpForm.email,
        password: signUpForm.password
      });

      setDevSession(session);
      setActivePage("contact");
      setContactSectionView("account");
      setWorkspaceSectionAndRoute("documents", { replace: true });
      await hydrateDashboardSession(session);
      setSignInForm({ email: signUpForm.email, password: "", accountType: signUpForm.role });
      setSignUpForm(emptyDashboardSignUpForm);
      setSignupStep(1);
      showToast("Account created. Complete registration section 2 by uploading your required documents.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create your account right now.";
      setDevAuthError(message);
      showToast(message);
    } finally {
      setIsDashboardAuthSubmitting(false);
    }
  };

  const selectDealForReview = (dealId: string): void => {
    const deal = lenderDeals.find((item) => item.id === dealId);
    if (!deal) {
      return;
    }

    setSelectedDealId(deal.id);
    setActiveDeepDiveTab("financials");
    void persistLenderDashboardPatch({ selectedDealId: deal.id });
  };

  const handleExpressInterest = (dealId: string): void => {
    const deal = lenderDeals.find((item) => item.id === dealId);
    if (!deal) {
      return;
    }

    selectDealForReview(dealId);
    showToast(`Interest expressed for ${deal.companyName}.`);
  };

  const shortlistBorrowerOffer = (offerId: string): void => {
    const offer = borrowerOffersState.find((item) => item.id === offerId);
    if (!offer) {
      return;
    }

    setSelectedBorrowerOfferId(offer.id);
    void persistRequestorDashboardPatch({ selectedOfferId: offer.id });
    showToast("Offer shortlisted for deeper review.");
  };

  const acceptBorrowerOffer = (offerId: string): void => {
    const offer = borrowerOffersState.find((item) => item.id === offerId);
    if (!offer) {
      return;
    }

    const nextOffers = borrowerOffersState.map((currentOffer) => {
      if (currentOffer.id === offer.id) {
        return {
          ...currentOffer,
          status: "Accepted" as const
        };
      }

      if (currentOffer.status === "Accepted") {
        return {
          ...currentOffer,
          status: "Available" as const
        };
      }

      return currentOffer;
    });

    setBorrowerOffersState(nextOffers);
    setSelectedBorrowerOfferId(offer.id);
    setAcceptedBorrowerOfferId(offer.id);
    setWorkspaceSectionAndRoute("documents");
    void persistRequestorDashboardPatch({
      offers: nextOffers,
      selectedOfferId: offer.id,
      acceptedOfferId: offer.id
    });
    showToast(`Offer from ${offer.lenderName} accepted. Please complete KFS acknowledgement.`);
  };

  const toggleBorrowerIntegration = (integrationId: string): void => {
    const nextIntegrations = borrowerIntegrations.map((integration) =>
      integration.id === integrationId
        ? {
            ...integration,
            status: integration.status === "Connected" ? ("Revoked" as const) : ("Connected" as const),
            lastSyncAt: integration.status === "Connected" ? "Access revoked" : "Just now"
          }
        : integration
    );

    setBorrowerIntegrations(nextIntegrations);
    void persistRequestorDashboardPatch({ integrations: nextIntegrations });
  };

  const updateBorrowerDrawdownPercent = (value: number): void => {
    setBorrowerDrawdownPercent(value);
    void persistRequestorDashboardPatch({ drawdownPercent: value });
  };

  const updateBorrowerKfsAccepted = (value: boolean): void => {
    setBorrowerKfsAccepted(value);
    void persistRequestorDashboardPatch({ kfsAccepted: value });
  };

  const toggleBorrowerAutopay = (): void => {
    const nextValue = !borrowerAutopayEnabled;
    setBorrowerAutopayEnabled(nextValue);
    void persistRequestorDashboardPatch({ autopayEnabled: nextValue });
  };

  const updateBiddingInput = (
    field: "interestRate" | "tenureMonths" | "moratoriumMonths",
    value: string
  ): void => {
    setBiddingInputs((currentState) => {
      const nextState = {
        ...currentState,
        [field]: value
      };

      void persistLenderDashboardPatch({ biddingInputs: nextState });
      return nextState;
    });
  };

  const flushActiveDashboardData = async (): Promise<void> => {
    if (!devSession) {
      return;
    }

    const confirmed = window.confirm("This will clear your workspace data. Continue?");
    if (!confirmed) {
      return;
    }

    if (devSession.role === "lender") {
      const emptyData = await flushLenderDashboardData(devSession.profileId);
      setLenderDeals(emptyData.opportunities);
      setLenderRepayments(emptyData.repaymentSchedule);
      setLenderPortfolio(emptyData.portfolioLoans);
      setLenderPayoutEntries(emptyData.payoutLogs);
      setLenderCertificates(emptyData.taxCertificates);
      setLenderEvidenceEntries(emptyData.evidenceLogs);
      setSelectedDealId(emptyData.selectedDealId);
      setLiveInterestCounter(emptyData.liveInterestCounter);
      setBiddingInputs(emptyData.biddingInputs);
      showToast("Lender workspace data flushed.");
      return;
    }

    const emptyData = await flushRequestorDashboardData(devSession.profileId);
    setBorrowerOffersState(emptyData.offers);
    setBorrowerRepaymentState(emptyData.repaymentHistory);
    setBorrowerIntegrations(emptyData.integrations);
    setBorrowerKfsRows(emptyData.kfsScheduleRows);
    setSelectedBorrowerOfferId(emptyData.selectedOfferId);
    setAcceptedBorrowerOfferId(emptyData.acceptedOfferId);
    setBorrowerDrawdownPercent(emptyData.drawdownPercent);
    setBorrowerKfsAccepted(emptyData.kfsAccepted);
    setBorrowerAutopayEnabled(emptyData.autopayEnabled);
    showToast("Borrower workspace data flushed.");
  };

  const refreshSuperAdminOverviewData = async (): Promise<void> => {
    if (devSession?.role !== "super_admin") {
      return;
    }

    setIsSuperAdminLoading(true);

    try {
      const overview = await getSuperAdminOverview();
      setSuperAdminOverview(overview);
      showToast("Super admin view refreshed.");
    } catch {
      showToast("Unable to refresh super admin data right now.");
    } finally {
      setIsSuperAdminLoading(false);
    }
  };

  const handleProfileDocumentFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0] ?? null;
    setSelectedProfileDocumentFile(file);
    setDocumentUploadError("");
    if (!isDocumentUploadSubmitting) {
      setDocumentUploadProgressPercent(null);
    }
  };

  const submitProfileDocumentUpload = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (!devSession || devSession.role === "super_admin") {
      return;
    }

    if (!selectedProfileDocumentFile) {
      const message = "Choose a document file before uploading.";
      setDocumentUploadError(message);
      showToast(message);
      return;
    }

    setDocumentUploadError("");
    setDocumentUploadProgressPercent(0);
    setIsDocumentUploadSubmitting(true);

    const currentRole = devSession.role;

    try {
      const uploadedDocument = await uploadProfileDocument({
        profileId: devSession.profileId,
        role: currentRole,
        documentType: selectedProfileDocumentType,
        file: selectedProfileDocumentFile,
        uploadedByName: devSession.displayName,
        uploadedByEmail: devSession.email,
        onProgress: (progressPercent: number) => {
          setDocumentUploadProgressPercent(progressPercent);
        }
      });

      const nextDocuments = [...profileDocuments, uploadedDocument].sort(
        (left, right) => right.uploadedAt.localeCompare(left.uploadedAt)
      );
      const requiredDocuments = requiredDocumentsByRole[currentRole];
      const uploadedTypes = new Set(nextDocuments.map((document) => document.documentType));
      const onboardingCompleted = requiredDocuments.every((documentType) => uploadedTypes.has(documentType));
      const nextRegistrationStep = onboardingCompleted ? 2 : 1;

      setProfileDocuments(nextDocuments);
      setSelectedProfileDocumentFile(null);
      setDocumentUploadInputKey((currentValue) => currentValue + 1);
      setDocumentUploadError("");
      setDocumentUploadProgressPercent(100);

      await updateDashboardOnboardingStatus(
        devSession.profileId,
        currentRole,
        onboardingCompleted,
        nextRegistrationStep
      );

      setDevSession((currentSession) =>
        currentSession
          ? {
              ...currentSession,
              onboardingCompleted,
              registrationStep: nextRegistrationStep
            }
          : currentSession
      );

      if (currentRole === "lender") {
        setLenderProfile((currentProfile) =>
          currentProfile
            ? {
                ...currentProfile,
                onboardingCompleted,
                onboardingStep: nextRegistrationStep,
                kycStatus: onboardingCompleted ? "Documents Submitted" : currentProfile.kycStatus,
                updatedAt: new Date().toISOString()
              }
            : currentProfile
        );
      } else {
        setRequestorProfile((currentProfile) =>
          currentProfile
            ? {
                ...currentProfile,
                onboardingCompleted,
                onboardingStep: nextRegistrationStep,
                stage: onboardingCompleted ? "Underwriting Review" : currentProfile.stage,
                status: onboardingCompleted ? "In Review" : currentProfile.status,
                nextAction: onboardingCompleted
                  ? "Documents submitted. Underwriting review in progress."
                  : currentProfile.nextAction,
                updatedAt: new Date().toISOString()
              }
            : currentProfile
        );
      }

      showToast(
        onboardingCompleted
          ? "Document uploaded. Registration section 2 is complete."
          : `${profileDocumentTypeLabels[selectedProfileDocumentType]} uploaded successfully.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to upload document right now.";
      setDocumentUploadError(message);
      setDocumentUploadProgressPercent(null);
      showToast(message);
    } finally {
      setIsDocumentUploadSubmitting(false);
    }
  };

  const handleViewUploadedDocument = async (profileDocument: ProfileDocumentRecord): Promise<void> => {
    try {
      await viewProfileDocument(profileDocument);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to open document right now.";
      showToast(message);
    }
  };

  const handleDownloadUploadedDocument = async (profileDocument: ProfileDocumentRecord): Promise<void> => {
    try {
      await downloadProfileDocument(profileDocument);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to download document right now.";
      showToast(message);
    }
  };

  const renderRegistrationDocumentUploadPanel = (): JSX.Element | null => {
    if (!devSession || devSession.role === "super_admin") {
      return null;
    }

    const onboardingStatusText = isRegistrationSectionTwoComplete
      ? "Completed"
      : `Pending (${missingRegistrationDocuments.length} remaining)`;

    return (
      <div className="dev-info-card registration-doc-card">
        <div className="lender-card-head">
          <h4>Registration Section 2: Document Upload</h4>
          <span className={`registration-status-chip ${isRegistrationSectionTwoComplete ? "done" : "pending"}`}>
            {onboardingStatusText}
          </span>
        </div>
        <p className="dev-note">
          Upload all mandatory documents to activate full account privileges and underwriting workflows.
        </p>
        <p className="dev-note">
          If Firebase Storage setup is pending, files up to 8MB can still be uploaded using the temporary Firestore fallback.
        </p>

        <form className="registration-doc-form" onSubmit={submitProfileDocumentUpload} noValidate>
          <label htmlFor="registration-document-type">Document Type</label>
          <select
            id="registration-document-type"
            className="dev-input"
            value={selectedProfileDocumentType}
            onChange={(event) => setSelectedProfileDocumentType(event.target.value as ProfileDocumentType)}
          >
            {requiredRegistrationDocuments.map((documentType) => (
              <option key={documentType} value={documentType}>
                {profileDocumentTypeLabels[documentType]}
              </option>
            ))}
          </select>

          <label htmlFor="registration-document-file">Document File (PDF/JPG/PNG, fallback up to 8MB)</label>
          <input
            key={documentUploadInputKey}
            id="registration-document-file"
            className="dev-input"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={handleProfileDocumentFileChange}
            required
          />

          <div className="dev-actions">
            <button className="btn-fill" type="submit" disabled={isDocumentUploadSubmitting}>
              {isDocumentUploadSubmitting
                ? `Uploading ${documentUploadProgressPercent ?? 0}%...`
                : "Upload Document"}
            </button>
          </div>

          {typeof documentUploadProgressPercent === "number" ? (
            <div className="upload-progress-shell" aria-live="polite">
              <div className="upload-progress-meta">
                <span>Upload Progress</span>
                <strong>{`${documentUploadProgressPercent}%`}</strong>
              </div>
              <div className="upload-progress-track">
                <div
                  className="upload-progress-fill"
                  style={{ width: `${Math.max(0, Math.min(100, documentUploadProgressPercent))}%` }}
                ></div>
              </div>
            </div>
          ) : null}

          {documentUploadError ? <p className="upload-error-text">{documentUploadError}</p> : null}
        </form>

        <div className="registration-checklist">
          {requiredRegistrationDocuments.map((documentType) => {
            const uploaded = uploadedDocumentTypeSet.has(documentType);

            return (
              <div key={documentType} className="registration-checklist-row">
                <strong>{profileDocumentTypeLabels[documentType]}</strong>
                <span className={`registration-check-badge ${uploaded ? "done" : "pending"}`}>
                  {uploaded ? "Uploaded" : "Pending"}
                </span>
              </div>
            );
          })}
        </div>

        <div className="table-scroll">
          <table className="lender-opportunity-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>File</th>
                <th>Uploaded At</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {orderedProfileDocuments.length > 0 ? (
                orderedProfileDocuments.map((document) => (
                  <tr key={document.id}>
                    <td>{profileDocumentTypeLabels[document.documentType]}</td>
                    <td>{document.fileName}</td>
                    <td>{new Date(document.uploadedAt).toLocaleString()}</td>
                    <td>
                      <div className="deal-action-group">
                        <button
                          type="button"
                          className="mini-btn-link"
                          onClick={() => void handleViewUploadedDocument(document)}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          className="mini-btn-link"
                          onClick={() => void handleDownloadUploadedDocument(document)}
                        >
                          Download
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>No documents uploaded.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const drawdownCapital = (): void => {
    if (!acceptedBorrowerOffer) {
      showToast("Accept one lender offer before drawing funds.");
      return;
    }

    if (!isRegistrationSectionTwoComplete) {
      showToast("Complete registration section 2 document uploads before drawdown.");
      setWorkspaceSectionAndRoute("documents");
      return;
    }

    if (!borrowerKfsAccepted) {
      showToast("KFS acknowledgement is mandatory before drawdown.");
      setWorkspaceSectionAndRoute("documents");
      return;
    }

    void persistRequestorDashboardPatch({
      drawdownPercent: borrowerDrawdownPercent,
      kfsAccepted: borrowerKfsAccepted,
      acceptedOfferId: acceptedBorrowerOffer.id,
      selectedOfferId: selectedBorrowerOfferId
    });

    showToast(
      `Drawdown initiated for ₹${borrowerDrawdownAmountCr.toFixed(2)}Cr with ${acceptedBorrowerOffer.lenderName}.`
    );
  };

  const submitBidOffer = (): void => {
    if (!selectedDeal) {
      showToast("Select an opportunity before submitting an offer.");
      return;
    }

    void persistLenderDashboardPatch({
      selectedDealId: selectedDeal.id,
      biddingInputs
    });

    showToast(
      `Offer submitted for ${selectedDeal.companyName}: ${biddingInputs.interestRate || "0"}% | ${biddingInputs.tenureMonths || "0"} months`
    );
  };

  const exportPayoutLogs = (): void => {
    const csvLines = [
      "Settlement Date,Borrower,Amount (Lakh),Settlement Reference,Status",
      ...lenderPayoutEntries.map(
        (entry) =>
          `${entry.settlementDate},${entry.borrower},${entry.amountLakh},${entry.settlementReference},${entry.status}`
      )
    ];

    const csvBlob = new Blob([csvLines.join("\n")], {
      type: "text/csv;charset=utf-8;"
    });
    const downloadUrl = window.URL.createObjectURL(csvBlob);
    const linkElement = document.createElement("a");
    linkElement.href = downloadUrl;
    linkElement.download = "lender-payout-logs.csv";
    linkElement.click();
    window.URL.revokeObjectURL(downloadUrl);
    showToast("Payout logs exported to Excel-compatible CSV.");
  };

  const onInputChange = (field: keyof ContactFormState, value: string | boolean): void => {
    setFormError("");
    setFormState((currentState) => {
      const updatedState = {
        ...currentState,
        [field]: value
      };

      if (field === "role") {
        const selectedRole = value as RoleValue;
        if (selectedRole !== "borrower") {
          updatedState.loanAmountRange = "NOT_APPLICABLE";
        } else if (updatedState.loanAmountRange === "NOT_APPLICABLE") {
          updatedState.loanAmountRange = "";
        }
      }

      return updatedState;
    });
  };

  const validateContactForm = (): string | null => {
    if (!formState.fullName.trim()) {
      return "Full name is required.";
    }

    if (!formState.phone.trim()) {
      return "Phone number is required.";
    }

    if (!formState.email.trim()) {
      return "Email address is required.";
    }

    if (!formState.role) {
      return "Please choose your role.";
    }

    if (formState.role === "borrower" && !formState.loanAmountRange) {
      return "Please select a loan amount range.";
    }

    if (formState.message.trim().length < 10) {
      return "Please share at least 10 characters in your message.";
    }

    if (!formState.consent) {
      return "You must accept consent before submitting.";
    }

    return null;
  };

  const submitContactForm = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    const validationError = validateContactForm();
    if (validationError) {
      setFormError(validationError);
      showToast(validationError);
      return;
    }

    setIsSubmitting(true);
    setFormError("");

    try {
      const payload: IntakeSubmissionPayload = {
        fullName: formState.fullName.trim(),
        phone: formState.phone.trim(),
        email: formState.email.trim().toLowerCase(),
        role: formState.role as RoleValue,
        loanAmountRange:
          formState.role === "borrower"
            ? (formState.loanAmountRange as LoanAmountValue)
            : "NOT_APPLICABLE",
        message: formState.message.trim(),
        consent: formState.consent,
        website: formState.website
      };

      await submitIntakeSubmission(payload);
      prefillAccountFormsFromContact({
        fullName: payload.fullName,
        phone: payload.phone,
        email: payload.email,
        role: payload.role
      });
      setIsSubmitted(true);
      setFormState(emptyContactForm);
      showToast("Request submitted successfully.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to submit your request right now.";
      setFormError(message);
      showToast(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <nav>
        <div className="nav-inner">
          <div className="logo" onClick={() => (devSession ? openWorkspace("overview") : showPage("home"))}>
            CRED<em>VANCE</em>
          </div>
          <ul className="nav-links">
            {devSession ? (
              <li>
                <a onClick={() => openWorkspace("overview")} className={activePage === "contact" ? "active" : ""}>
                  Workspace
                </a>
              </li>
            ) : (
              <>
                <li>
                  <a onClick={() => showPage("home")} className={activePage === "home" ? "active" : ""}>Home</a>
                </li>
                <li>
                  <a onClick={() => showPage("about")} className={activePage === "about" ? "active" : ""}>About Us</a>
                </li>
                <li>
                  <a onClick={() => showPage("services")} className={activePage === "services" ? "active" : ""}>Services</a>
                </li>
                <li>
                  <a
                    onClick={() => showPage("contact")}
                    className={activePage === "contact" && contactSectionView === "full" ? "active" : ""}
                  >
                    Contact
                  </a>
                </li>
              </>
            )}
          </ul>
          <div className="nav-actions">
            {devSession ? (
              <>
                <button className="btn-outline" onClick={() => openWorkspace("overview")} type="button">
                  {devSession.role === "super_admin" ? "Admin Panel" : "Workspace"}
                </button>
                <button className="btn-fill" onClick={resetDevLogin} type="button">
                  Logout
                </button>
              </>
            ) : (
              <>
                <button className="btn-outline" onClick={() => openAccountAccess("signin")} type="button">
                  Login
                </button>
                <button className="btn-fill" onClick={() => openAccountAccess("signup")} type="button">
                  Sign Up
                </button>
              </>
            )}
          </div>
          <div className="hamburger" onClick={() => setMobileNavOpen((currentState) => !currentState)}>
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </nav>

      <div style={mobileNavigationStyle}>
        {devSession ? (
          <>
            <a
              style={{ fontSize: "1.3rem", fontFamily: "Cormorant Garamond, serif", fontWeight: 600, color: "#1A1210", cursor: "pointer" }}
              onClick={() => {
                openWorkspace("overview");
                closeMobileNavigation();
              }}
            >
              Workspace
            </a>
            <a
              style={{ fontSize: "1.3rem", fontFamily: "Cormorant Garamond, serif", fontWeight: 600, color: "#1A1210", cursor: "pointer" }}
              onClick={() => {
                openWorkspace("documents");
                closeMobileNavigation();
              }}
            >
              Documents
            </a>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "12px" }}>
              <button
                className="btn-fill"
                onClick={() => {
                  resetDevLogin();
                  closeMobileNavigation();
                }}
                type="button"
              >
                Logout
              </button>
            </div>
          </>
        ) : (
          <>
            <a
              style={{ fontSize: "1.3rem", fontFamily: "Cormorant Garamond, serif", fontWeight: 600, color: "#1A1210", cursor: "pointer" }}
              onClick={() => {
                showPage("home");
                closeMobileNavigation();
              }}
            >
              Home
            </a>
            <a
              style={{ fontSize: "1.3rem", fontFamily: "Cormorant Garamond, serif", fontWeight: 600, color: "#1A1210", cursor: "pointer" }}
              onClick={() => {
                showPage("about");
                closeMobileNavigation();
              }}
            >
              About Us
            </a>
            <a
              style={{ fontSize: "1.3rem", fontFamily: "Cormorant Garamond, serif", fontWeight: 600, color: "#1A1210", cursor: "pointer" }}
              onClick={() => {
                showPage("services");
                closeMobileNavigation();
              }}
            >
              Services
            </a>
            <a
              style={{ fontSize: "1.3rem", fontFamily: "Cormorant Garamond, serif", fontWeight: 600, color: "#1A1210", cursor: "pointer" }}
              onClick={() => {
                showPage("contact");
                closeMobileNavigation();
              }}
            >
              Contact
            </a>
            <button
              className="btn-outline"
              onClick={() => {
                openAccountAccess("signin");
                closeMobileNavigation();
              }}
              type="button"
            >
              Login
            </button>
            <button
              className="btn-fill"
              onClick={() => {
                openAccountAccess("signup");
                closeMobileNavigation();
              }}
              type="button"
            >
              Sign Up
            </button>
          </>
        )}
      </div>

      <div className={`page ${activePage === "home" ? "active" : ""}`}>
        <section className="hero">
          <div className="hero-inner">
            <div>
              <div className="hero-badge">
                <span></span>India's Business Loan Marketplace
              </div>
              <h1 className="hero-title">
                Capital That Moves
                <br />
                as Fast as Your
                <br />
                <em>Ambition</em>
              </h1>
              <p className="hero-sub">
                CREDVANCE connects businesses seeking growth capital with a curated network of lenders
                - faster, smarter, and without the traditional barriers.
              </p>
              <div className="hero-ctas">
                <button className="cta-primary" onClick={() => openAccountAccess("signup")} type="button">
                  Apply for a Business Loan
                </button>
              </div>
              <div className="hero-stats">
                <div className="stat-item">
                  <div className="num">
                    ₹<em>50</em>Cr+
                  </div>
                  <div className="label">Capital Facilitated</div>
                </div>
                <div className="stat-item">
                  <div className="num">
                    <em>200</em>+
                  </div>
                  <div className="label">Businesses Funded</div>
                </div>
                <div className="stat-item">
                  <div className="num">
                    <em>48</em>hrs
                  </div>
                  <div className="label">Avg. Turnaround</div>
                </div>
              </div>
            </div>
            <div className="hero-visual">
              <div className="card-stack">
                <div className="glass-card gc-back2"></div>
                <div className="glass-card gc-back1"></div>
                <div className="glass-card gc-main">
                  <div className="card-label">Active Loan Request</div>
                  <div className="loan-amount">
                    ₹<em>75</em>L
                  </div>
                  <div className="loan-meta">
                    <div className="meta-chip">
                      <div className="mc-label">Tenure</div>
                      <div className="mc-val">36 mo.</div>
                    </div>
                    <div className="meta-chip">
                      <div className="mc-label">Rate</div>
                      <div className="mc-val">13.5%</div>
                    </div>
                    <div className="meta-chip">
                      <div className="mc-label">Sector</div>
                      <div className="mc-val">MSME</div>
                    </div>
                  </div>
                  <div className="progress-bar">
                    <div className="pb-label">
                      <span>Lender Interest</span>
                      <span>72%</span>
                    </div>
                    <div className="pb-track">
                      <div className="pb-fill"></div>
                    </div>
                  </div>
                  <div className="lender-row">
                    <div className="lender-dots">
                      <div className="ldot">A</div>
                      <div className="ldot">B</div>
                      <div className="ldot">C</div>
                      <div className="ldot plus">+8</div>
                    </div>
                    <div className="lender-text">
                      <strong>11 lenders</strong> reviewing this request
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="trust-bar">
          <div className="trust-inner">
            <div className="trust-label">Trusted By</div>
            <div className="trust-items">
              <span className="trust-item">MSMEs</span>
              <span className="trust-item">Startups</span>
              <span className="trust-item">NBFCs</span>
              <span className="trust-item">HNI Lenders</span>
              <span className="trust-item">Cooperative Banks</span>
              <span className="trust-item">Angel Investors</span>
            </div>
          </div>
        </div>

        <section className="hiw">
          <div className="section-inner">
            <div className="sec-tag">How It Works</div>
            <h2 className="sec-title">Funding in Three Simple Steps</h2>
            <p className="sec-sub">
              We've removed the complexity from business lending. From application to disbursement - seamless.
            </p>
            <div className="hiw-grid">
              <div className="hiw-card">
                <div className="step-num">01</div>
                <div className="step-icon">📋</div>
                <div className="step-title">Apply &amp; Share Your Profile</div>
                <p className="step-text">
                  Fill a simple application with your business details, financials, and loan requirement. No
                  physical paperwork - everything done digitally.
                </p>
              </div>
              <div className="hiw-card">
                <div className="step-num">02</div>
                <div className="step-icon">🔍</div>
                <div className="step-title">We Match You with Lenders</div>
                <p className="step-text">
                  Our platform evaluates your profile and presents your request to a curated network of lenders -
                  banks, NBFCs, HNIs - who are the right fit.
                </p>
              </div>
              <div className="hiw-card">
                <div className="step-num">03</div>
                <div className="step-icon">💰</div>
                <div className="step-title">Get Funded Fast</div>
                <p className="step-text">
                  Compare term sheets from multiple lenders, choose the best offer, and get funds disbursed - often
                  within 48 hours of completing documentation.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section style={{ background: "var(--white)" }}>
          <div className="section-inner">
            <div className="sec-tag">Who We Serve</div>
            <h2 className="sec-title">Built for Both Sides of the Equation</h2>
            <div className="forwho-grid">
              <div className="fw-card fw-borrower">
                <div className="fw-eyebrow">For Borrowers</div>
                <div className="fw-title">Access Capital Without Compromise</div>
                <p className="fw-body">
                  Whether you're an MSME looking for working capital or a startup seeking growth funding - CREDVANCE
                  connects you with multiple lenders through one platform.
                </p>
                <ul className="fw-list">
                  <li>No collateral required for eligible profiles</li>
                  <li>Compare offers from multiple lenders</li>
                  <li>Dedicated capital advisor on your side</li>
                  <li>Disbursement in as little as 48 hours</li>
                </ul>
                <button className="fw-btn" onClick={() => openAccountAccess("signup")} type="button">
                  Apply for a Loan -&gt;
                </button>
              </div>
              <div className="fw-card fw-lender">
                <div className="fw-eyebrow">For Lenders</div>
                <div className="fw-title">Deploy Capital with Confidence</div>
                <p className="fw-body">
                  Join a curated marketplace of pre-vetted loan requests. Access deal flow, set your own criteria,
                  and deploy capital with full transparency.
                </p>
                <ul className="fw-list">
                  <li>Pre-screened, verified borrower profiles</li>
                  <li>Flexible ticket sizes &amp; tenures</li>
                  <li>Transparent risk scoring &amp; financials</li>
                  <li>Legal &amp; documentation support</li>
                </ul>
                <button className="fw-btn" onClick={() => openAccountAccess("signin")} type="button">
                  Lender Login -&gt;
                </button>
              </div>
            </div>
          </div>
        </section>

        <div className="stats-band">
          <div className="stats-band-inner">
            <div>
              <div className="sb-num">₹50Cr+</div>
              <div className="sb-label">Capital Facilitated</div>
            </div>
            <div>
              <div className="sb-num">200+</div>
              <div className="sb-label">Businesses Funded</div>
            </div>
            <div>
              <div className="sb-num">50+</div>
              <div className="sb-label">Lending Partners</div>
            </div>
            <div>
              <div className="sb-num">48hrs</div>
              <div className="sb-label">Average Turnaround</div>
            </div>
          </div>
        </div>
      </div>

      <div className={`page ${activePage === "about" ? "active" : ""}`}>
        <section style={{ paddingTop: "130px" }}>
          <div className="section-inner">
            <div className="about-grid">
              <div>
                <div className="sec-tag">About CREDVANCE</div>
                <h2 className="sec-title">Democratising Access to Business Capital</h2>
                <p style={{ fontSize: "1rem", color: "var(--muted)", lineHeight: 1.7, marginTop: "14px" }}>
                  CREDVANCE was founded with a simple but powerful idea: every worthy business deserves access to
                  capital - without excessive barriers, paperwork, or delays. We built a marketplace where borrowers
                  and lenders meet on equal footing, guided by transparency and technology.
                </p>
                <p style={{ fontSize: ".9rem", color: "var(--muted)", lineHeight: 1.8, marginTop: "14px" }}>
                  Today, CREDVANCE serves MSMEs, startups, and growing enterprises across India, connecting them with
                  a curated network of banks, NBFCs, and institutional investors. We combine financial expertise with
                  technology to make business lending faster, fairer, and more accessible.
                </p>
                <div className="about-badges">
                  <div className="ab">
                    <div className="ab-title">Our Mission</div>
                    <div className="ab-text">
                      Make business capital as accessible as it is for large corporations - for every entrepreneur.
                    </div>
                  </div>
                  <div className="ab">
                    <div className="ab-title">Our Vision</div>
                    <div className="ab-text">
                      Become India's most trusted debt marketplace, powering growth of 10,000+ businesses.
                    </div>
                  </div>
                  <div className="ab">
                    <div className="ab-title">Transparency First</div>
                    <div className="ab-text">
                      No hidden fees. No opaque processes. Every step is visible to both borrowers and lenders.
                    </div>
                  </div>
                  <div className="ab">
                    <div className="ab-title">Speed &amp; Efficiency</div>
                    <div className="ab-text">We've digitized every step so decisions happen in hours, not weeks.</div>
                  </div>
                </div>
              </div>
              <div className="about-img">
                <div className="about-icon-big">CV</div>
              </div>
            </div>
          </div>
        </section>

        <div className="stats-band">
          <div className="stats-band-inner">
            <div>
              <div className="sb-num">2024</div>
              <div className="sb-label">Founded</div>
            </div>
            <div>
              <div className="sb-num">50+</div>
              <div className="sb-label">Lending Partners</div>
            </div>
            <div>
              <div className="sb-num">200+</div>
              <div className="sb-label">Businesses Served</div>
            </div>
            <div>
              <div className="sb-num">Kerala</div>
              <div className="sb-label">Headquartered</div>
            </div>
          </div>
        </div>

        <section>
          <div className="section-inner">
            <div className="sec-tag">Our Values</div>
            <h2 className="sec-title">What Drives Us</h2>
            <div className="hiw-grid" style={{ marginTop: "44px" }}>
              <div className="hiw-card">
                <div className="step-icon">🤝</div>
                <div className="step-title">Trust &amp; Integrity</div>
                <p className="step-text">
                  We hold ourselves to the highest standards of financial ethics. Every deal on CREDVANCE is
                  processed with full transparency and accountability.
                </p>
              </div>
              <div className="hiw-card">
                <div className="step-icon">⚡</div>
                <div className="step-title">Speed &amp; Efficiency</div>
                <p className="step-text">
                  Time is money. Our digital-first approach ensures that loan requests are evaluated, matched, and
                  processed without unnecessary delays.
                </p>
              </div>
              <div className="hiw-card">
                <div className="step-icon">🌱</div>
                <div className="step-title">Growth-Oriented</div>
                <p className="step-text">
                  We don't just facilitate loans - we support businesses in choosing the right debt structure for
                  their stage of growth and long-term financial health.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className={`page ${activePage === "services" ? "active" : ""}`}>
        <section style={{ background: "var(--off)", paddingTop: "130px" }}>
          <div className="section-inner">
            <div className="sec-tag">Our Services</div>
            <h2 className="sec-title">Capital Solutions for Every Business Need</h2>
            <p className="sec-sub">
              From working capital to expansion loans, CREDVANCE offers a full spectrum of debt products through our
              marketplace platform.
            </p>
            <div className="services-grid">
              <div className="srv-card">
                <div className="srv-icon">🏭</div>
                <div className="srv-title">Working Capital Loans</div>
                <p className="srv-text">
                  Short-term financing to manage operations, bridge cash flow gaps, and fulfill large orders without
                  straining your balance sheet.
                </p>
                <div className="srv-link" onClick={() => showPage("contact", "borrower")}>Learn More -&gt;</div>
              </div>
              <div className="srv-card">
                <div className="srv-icon">📈</div>
                <div className="srv-title">Business Expansion Loans</div>
                <p className="srv-text">
                  Scale operations, open branches, hire talent, or enter new markets with structured term loans
                  tailored to your revenue profile.
                </p>
                <div className="srv-link" onClick={() => showPage("contact", "borrower")}>Learn More -&gt;</div>
              </div>
              <div className="srv-card">
                <div className="srv-icon">🧾</div>
                <div className="srv-title">Invoice Discounting</div>
                <p className="srv-text">
                  Unlock value from outstanding invoices. Get upfront capital against receivables so cash flow never
                  slows your business down.
                </p>
                <div className="srv-link" onClick={() => showPage("contact", "borrower")}>Learn More -&gt;</div>
              </div>
              <div className="srv-card">
                <div className="srv-icon">🏗️</div>
                <div className="srv-title">Asset-Backed Financing</div>
                <p className="srv-text">
                  Use business assets - machinery, property, or equipment - as collateral to secure larger loan
                  amounts at competitive rates.
                </p>
                <div className="srv-link" onClick={() => showPage("contact", "borrower")}>Learn More -&gt;</div>
              </div>
              <div className="srv-card">
                <div className="srv-icon">🚀</div>
                <div className="srv-title">Startup Debt Financing</div>
                <p className="srv-text">
                  Non-dilutive growth capital for startups with proven traction. Raise funds without giving up equity
                  - preserve ownership while you grow.
                </p>
                <div className="srv-link" onClick={() => showPage("contact", "borrower")}>Learn More -&gt;</div>
              </div>
              <div className="srv-card">
                <div className="srv-icon">🏛️</div>
                <div className="srv-title">Lender Marketplace Access</div>
                <p className="srv-text">
                  For lenders: gain structured access to pre-vetted borrower profiles, deal flow, and documentation
                  support - through one dashboard.
                </p>
                <div className="srv-link" onClick={() => openAccountAccess("signin")}>Lender Login -&gt;</div>
              </div>
            </div>
          </div>
        </section>

        <section style={{ background: "var(--white)" }}>
          <div className="section-inner">
            <div className="hiw-grid">
              <div className="hiw-card">
                <div className="step-icon">✅</div>
                <div className="step-title">Eligibility for Borrowers</div>
                <p className="step-text">
                  Business operational for 6+ months - Minimum annual revenue of ₹25 Lakhs - Valid GST registration -
                  Clean or improving credit history welcome.
                </p>
              </div>
              <div className="hiw-card">
                <div className="step-icon">📄</div>
                <div className="step-title">Documents Required</div>
                <p className="step-text">
                  Business registration - 6-12 months bank statements - GST returns - ITR for 2 years - KYC of
                  promoters. We guide you through every step.
                </p>
              </div>
              <div className="hiw-card">
                <div className="step-icon">🔒</div>
                <div className="step-title">Security &amp; Compliance</div>
                <p className="step-text">
                  All transactions on CREDVANCE are processed with full RBI-compliant documentation. Your data is
                  encrypted and never shared without consent.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className={`page ${activePage === "contact" || activePage === "auth" ? "active" : ""}`}>
        {activePage === "contact" && contactSectionView === "full" && !devSession ? (
        <section style={{ paddingTop: "130px" }}>
          <div className="section-inner">
            <div className="sec-tag">Get In Touch</div>
            <h2 className="sec-title">Let's Find the Right Capital for You</h2>
            <div className="contact-grid">
              <div className="contact-info">
                <h3>Speak With Our Capital Team</h3>
                <p>
                  Whether you're a business looking for a loan or an investor looking to deploy capital - our team
                  will guide you through the process from day one.
                </p>
                <div className="contact-detail">
                  <div className="cd-item">
                    <div className="cd-icon">📍</div>
                    <div>
                      <div className="cd-label">Location</div>
                      <div className="cd-val">Kerala, India</div>
                    </div>
                  </div>
                  <div className="cd-item">
                    <div className="cd-icon">📧</div>
                    <div>
                      <div className="cd-label">Email</div>
                      <div className="cd-val">nitin@credvance.in</div>
                    </div>
                  </div>
                  <div className="cd-item">
                    <div className="cd-icon">📞</div>
                    <div>
                      <div className="cd-label">Phone</div>
                      <div className="cd-val">+91-8904732178</div>
                    </div>
                  </div>
                  <div className="cd-item">
                    <div className="cd-icon">⏰</div>
                    <div>
                      <div className="cd-label">Response Time</div>
                      <div className="cd-val">Within 24 business hours</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="contact-form">
                <div className="form-title">Send Us a Message</div>
                <div className="form-sub">Fill in your details and our team will get back to you within 24 hours.</div>

                {!isSubmitted ? (
                  <form onSubmit={submitContactForm} noValidate>
                    <div className="form-row">
                      <div className="form-group">
                        <label htmlFor="f-name">Full Name</label>
                        <input
                          type="text"
                          id="f-name"
                          placeholder="Your full name"
                          value={formState.fullName}
                          onChange={(event) => onInputChange("fullName", event.target.value)}
                          maxLength={120}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="f-phone">Phone Number</label>
                        <input
                          type="tel"
                          id="f-phone"
                          placeholder="+91-XXXXXXXXXX"
                          value={formState.phone}
                          onChange={(event) => onInputChange("phone", event.target.value)}
                          maxLength={24}
                          required
                        />
                      </div>
                    </div>

                    <div className="form-group">
                      <label htmlFor="f-email">Email Address</label>
                      <input
                        type="email"
                        id="f-email"
                        placeholder="your@business.com"
                        value={formState.email}
                        onChange={(event) => onInputChange("email", event.target.value)}
                        maxLength={254}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="f-role">I am a</label>
                      <select
                        id="f-role"
                        value={formState.role}
                        onChange={(event) => onInputChange("role", event.target.value)}
                        required
                      >
                        <option value="">Select your role</option>
                        <option value="borrower">Business Owner / Borrower</option>
                        <option value="lender">Lender / Investor</option>
                        <option value="nbfc-bank">NBFC / Bank</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="f-amount">Loan Amount (if borrower)</label>
                      <select
                        id="f-amount"
                        value={formState.loanAmountRange}
                        onChange={(event) => onInputChange("loanAmountRange", event.target.value)}
                        disabled={formState.role !== "borrower"}
                      >
                        <option value="">Select range</option>
                        <option value="5L_25L">₹5L - ₹25L</option>
                        <option value="25L_1CR">₹25L - ₹1Cr</option>
                        <option value="1CR_5CR">₹1Cr - ₹5Cr</option>
                        <option value="5CR_PLUS">₹5Cr+</option>
                        <option value="NOT_APPLICABLE">N/A</option>
                      </select>
                    </div>

                    <div className="form-group visually-hidden">
                      <label htmlFor="f-website">Website</label>
                      <input
                        id="f-website"
                        type="text"
                        value={formState.website}
                        onChange={(event) => onInputChange("website", event.target.value)}
                        autoComplete="off"
                        tabIndex={-1}
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="f-msg">Message</label>
                      <textarea
                        id="f-msg"
                        placeholder="Tell us about your business and what you're looking for..."
                        value={formState.message}
                        onChange={(event) => onInputChange("message", event.target.value)}
                        maxLength={1200}
                        required
                      ></textarea>
                    </div>

                    <div className="form-consent">
                      <input
                        id="f-consent"
                        type="checkbox"
                        checked={formState.consent}
                        onChange={(event) => onInputChange("consent", event.target.checked)}
                      />
                      <label htmlFor="f-consent">
                        I consent to CREDVANCE processing my information for loan matching and communication.
                      </label>
                    </div>

                    {formError ? <p className="form-error">{formError}</p> : null}

                    <button className="form-submit" type="submit" disabled={isSubmitting}>
                      {isSubmitting ? "Submitting..." : "Submit Request -\u003e"}
                    </button>
                  </form>
                ) : (
                  <div className="form-success">
                    <div className="dev-role-badge">Success</div>
                    <h4>Request Received!</h4>
                    <p>
                      Thank you for reaching out. Our team will contact you within 24 business hours to discuss next
                      steps.
                    </p>
                    <div className="form-success-actions">
                      <button
                        type="button"
                        className="btn-outline"
                        onClick={() => {
                          setIsSubmitted(false);
                        }}
                      >
                        Submit Another Request
                      </button>
                      <button
                        type="button"
                        className="btn-fill"
                        onClick={() => {
                          openAccountAccess("signup");
                        }}
                      >
                        Continue to Registration & Login
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
        ) : null}

        {activePage === "auth" || devSession ? (
        <section
          id="account-access-section"
          style={{
            paddingTop: contactSectionView === "account" ? "96px" : "30px",
            background: "var(--off)"
          }}
        >
          <div className="section-inner">
            {!devSession ? (
              <div className="dev-login-card">
                <div className="auth-mode-toggle">
                  <button
                    type="button"
                    className={`auth-mode-btn ${dashboardAuthMode === "signin" ? "active" : ""}`}
                    onClick={() => {
                      setDashboardAuthMode("signin");
                      updateBrowserRoute("auth", "account", {
                        replace: true,
                        hasSession: false,
                        authMode: "signin"
                      });
                      setDevAuthError("");
                    }}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    className={`auth-mode-btn ${dashboardAuthMode === "signup" ? "active" : ""}`}
                    onClick={() => {
                      setDashboardAuthMode("signup");
                      updateBrowserRoute("auth", "account", {
                        replace: true,
                        hasSession: false,
                        authMode: "signup"
                      });
                      setDevAuthError("");
                    }}
                  >
                    Create Account
                  </button>
                </div>

                {devAuthError ? <p className="form-error dev-inline-error">{devAuthError}</p> : null}

                {dashboardAuthMode === "signin" ? (
                  <form className="dev-login-form" onSubmit={submitDashboardSignIn} noValidate>
                    <label htmlFor="signin-account-type">Login Type</label>
                    <select
                      id="signin-account-type"
                      className="dev-input"
                      value={signInForm.accountType}
                      onChange={(event) =>
                        setSignInForm((currentState) => ({
                          ...currentState,
                          accountType: event.target.value as DashboardSignInAccountType
                        }))
                      }
                    >
                      <option value="any">Auto Detect</option>
                      <option value="requestor">Borrower</option>
                      <option value="lender">Lender</option>
                      <option value="super_admin">Super Admin</option>
                    </select>
                    <label htmlFor="signin-email">Email</label>
                    <input
                      id="signin-email"
                      className="dev-input"
                      type="email"
                      placeholder="name@company.com"
                      value={signInForm.email}
                      onChange={(event) =>
                        setSignInForm((currentState) => ({ ...currentState, email: event.target.value }))
                      }
                      required
                    />
                    <label htmlFor="signin-password">Password</label>
                    <div className="password-input-wrap" style={{ position: "relative" }}>
                      <input
                        id="signin-password"
                        className="dev-input"
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter your password"
                        value={signInForm.password}
                        onChange={(event) =>
                          setSignInForm((currentState) => ({ ...currentState, password: event.target.value }))
                        }
                        required
                      />
                      <button 
                        type="button" 
                        onClick={() => setShowPassword(!showPassword)}
                        style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", opacity: 0.6 }}
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                    <div style={{ textAlign: "right", marginTop: "4px", marginBottom: "16px" }}>
                      <button type="button" onClick={handleForgotPassword} style={{ background: "none", border: "none", color: "var(--red)", fontSize: "0.8rem", cursor: "pointer", fontWeight: 600 }}>Forgot Password?</button>
                    </div>
                    <div className="dev-actions">
                      <button className="btn-fill" type="submit" disabled={isDashboardAuthSubmitting}>
                        {isDashboardAuthSubmitting ? "Signing In..." : "Sign In"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <form className="dev-login-form signup-wizard" onSubmit={submitDashboardSignUp} noValidate>
                    {/* Step Indicators */}
                    <div className="wizard-steps" style={{ display: "flex", justifyContent: "center", gap: "10px", marginBottom: "24px" }}>
                      {[1, 2, 3].map((step) => (
                        <div key={step} style={{ 
                          width: "30px", height: "30px", borderRadius: "50%", 
                          background: signupStep >= step ? "var(--red)" : "var(--border)", 
                          color: signupStep >= step ? "#fff" : "var(--muted)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontWeight: "bold", fontSize: "0.8rem"
                        }}>
                          {step}
                        </div>
                      ))}
                    </div>

                    {signupStep === 1 && (
                      <div className="auth-grid step-pane">
                        <div style={{ gridColumn: "1 / -1", marginBottom: "8px" }}>
                          <h4 style={{ margin: 0, color: "var(--dark)" }}>Personal & Organization Info</h4>
                          <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: "4px 0 0 0" }}>Step 1 of 3</p>
                        </div>
                        <div>
                          <label htmlFor="signup-role">I want to register as a</label>
                          <select
                            id="signup-role"
                            className="dev-input"
                            value={signUpForm.role}
                            onChange={(event) =>
                              setSignUpForm((currentState) => ({ ...currentState, role: event.target.value as "requestor" | "lender" }))
                            }
                            required
                          >
                            <option value="requestor">Borrower / Business</option>
                            <option value="lender">Lender / Investor</option>
                          </select>
                        </div>
                        <div>
                          <label htmlFor="signup-name">Contact Person</label>
                          <input
                            id="signup-name"
                            className="dev-input"
                            type="text"
                            placeholder="Authorized contact name"
                            value={signUpForm.displayName}
                            onChange={(event) =>
                              setSignUpForm((currentState) => ({ ...currentState, displayName: event.target.value }))
                            }
                            required
                          />
                        </div>

                        <div>
                          <label htmlFor="signup-org">Business Name</label>
                          <input
                            id="signup-org"
                            className="dev-input"
                            type="text"
                            placeholder="ABC Ventures"
                            value={signUpForm.organizationName}
                            onChange={(event) =>
                              setSignUpForm((currentState) => ({
                                ...currentState,
                                organizationName: event.target.value
                              }))
                            }
                            required
                          />
                        </div>

                        <div>
                          <label htmlFor="signup-email">Email</label>
                          <input
                            id="signup-email"
                            className="dev-input"
                            type="email"
                            placeholder="name@company.com"
                            value={signUpForm.email}
                            onChange={(event) =>
                              setSignUpForm((currentState) => ({ ...currentState, email: event.target.value }))
                            }
                            required
                          />
                        </div>

                        <div>
                          <label htmlFor="signup-phone">Phone Number</label>
                          <input
                            id="signup-phone"
                            className="dev-input"
                            type="tel"
                            placeholder="+91-XXXXXXXXXX"
                            value={signUpForm.phone}
                            onChange={(event) =>
                              setSignUpForm((currentState) => ({ ...currentState, phone: event.target.value }))
                            }
                            required
                          />
                        </div>

                        <div>
                          <label htmlFor="signup-city">City</label>
                          <input
                            id="signup-city"
                            className="dev-input"
                            type="text"
                            placeholder="City"
                            value={signUpForm.city}
                            onChange={(event) =>
                              setSignUpForm((currentState) => ({ ...currentState, city: event.target.value }))
                            }
                            required
                          />
                        </div>

                        <div>
                          <label htmlFor="signup-state">State</label>
                          <input
                            id="signup-state"
                            className="dev-input"
                            type="text"
                            placeholder="State"
                            value={signUpForm.state}
                            onChange={(event) =>
                              setSignUpForm((currentState) => ({ ...currentState, state: event.target.value }))
                            }
                          />
                        </div>

                        <div>
                          <label htmlFor="signup-country">Country</label>
                          <input
                            id="signup-country"
                            className="dev-input"
                            type="text"
                            placeholder="Country"
                            value={signUpForm.country}
                            onChange={(event) =>
                              setSignUpForm((currentState) => ({ ...currentState, country: event.target.value }))
                            }
                            required
                          />
                        </div>
                      </div>
                    )}

                    {signupStep === 2 && (
                      <div className="auth-grid step-pane">
                        <div style={{ gridColumn: "1 / -1", marginBottom: "8px" }}>
                          <h4 style={{ margin: 0, color: "var(--dark)" }}>Business Details</h4>
                          <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: "4px 0 0 0" }}>Step 2 of 3</p>
                        </div>
                        <div>
                          <label htmlFor="signup-pan">PAN</label>
                          <input
                            id="signup-pan"
                            className="dev-input"
                            type="text"
                            placeholder="ABCDE1234F"
                            value={signUpForm.pan}
                            onChange={(event) =>
                              setSignUpForm((currentState) => ({ ...currentState, pan: event.target.value.toUpperCase() }))
                            }
                            required
                          />
                        </div>

                        <div>
                          <label htmlFor="signup-gst">GST Number</label>
                          <input
                            id="signup-gst"
                            className="dev-input"
                            type="text"
                            placeholder="GST Number"
                            value={signUpForm.gstNumber}
                            onChange={(event) =>
                              setSignUpForm((currentState) => ({ ...currentState, gstNumber: event.target.value.toUpperCase() }))
                            }
                          />
                        </div>

                        <div>
                          <label htmlFor="signup-website">Website</label>
                          <input
                            id="signup-website"
                            className="dev-input"
                            type="url"
                            placeholder="https://example.com"
                            value={signUpForm.website}
                            onChange={(event) =>
                              setSignUpForm((currentState) => ({ ...currentState, website: event.target.value }))
                            }
                          />
                        </div>

                        <div>
                          <label htmlFor="signup-years">Years in Operation</label>
                          <input
                            id="signup-years"
                            className="dev-input"
                            type="text"
                            placeholder="e.g. 4"
                            value={signUpForm.yearsInOperation}
                            onChange={(event) =>
                              setSignUpForm((currentState) => ({ ...currentState, yearsInOperation: event.target.value }))
                            }
                          />
                        </div>

                        {signUpForm.role === "requestor" ? (
                          <>
                            <div>
                              <label htmlFor="signup-sector">Business Sector</label>
                              <input
                                id="signup-sector"
                                className="dev-input"
                                type="text"
                                placeholder="e.g. Logistics"
                                value={signUpForm.sector}
                                onChange={(event) =>
                                  setSignUpForm((currentState) => ({ ...currentState, sector: event.target.value }))
                                }
                                required
                              />
                            </div>

                            <div>
                              <label htmlFor="signup-stage">Business Stage</label>
                              <input
                                id="signup-stage"
                                className="dev-input"
                                type="text"
                                placeholder="e.g. Growth"
                                value={signUpForm.stage}
                                onChange={(event) =>
                                  setSignUpForm((currentState) => ({ ...currentState, stage: event.target.value }))
                                }
                              />
                            </div>

                            <div>
                              <label htmlFor="signup-requested-amount">Requested Amount</label>
                              <input
                                id="signup-requested-amount"
                                className="dev-input"
                                type="text"
                                placeholder="e.g. 2Cr"
                                value={signUpForm.requestedAmount}
                                onChange={(event) =>
                                  setSignUpForm((currentState) => ({ ...currentState, requestedAmount: event.target.value }))
                                }
                                required
                              />
                            </div>

                            <div>
                              <label htmlFor="signup-monthly-revenue">Monthly Revenue</label>
                              <input
                                id="signup-monthly-revenue"
                                className="dev-input"
                                type="text"
                                placeholder="e.g. 45L"
                                value={signUpForm.monthlyRevenue}
                                onChange={(event) =>
                                  setSignUpForm((currentState) => ({ ...currentState, monthlyRevenue: event.target.value }))
                                }
                              />
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <label htmlFor="signup-min-ticket">Min Ticket Size</label>
                              <input
                                id="signup-min-ticket"
                                className="dev-input"
                                type="text"
                                placeholder="e.g. 25L"
                                value={signUpForm.minTicket}
                                onChange={(event) =>
                                  setSignUpForm((currentState) => ({ ...currentState, minTicket: event.target.value }))
                                }
                              />
                            </div>
                            <div>
                              <label htmlFor="signup-max-ticket">Max Ticket Size</label>
                              <input
                                id="signup-max-ticket"
                                className="dev-input"
                                type="text"
                                placeholder="e.g. 5Cr"
                                value={signUpForm.maxTicket}
                                onChange={(event) =>
                                  setSignUpForm((currentState) => ({ ...currentState, maxTicket: event.target.value }))
                                }
                              />
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {signupStep === 3 && (
                      <div className="auth-grid step-pane">
                        <div style={{ gridColumn: "1 / -1", marginBottom: "8px" }}>
                          <h4 style={{ margin: 0, color: "var(--dark)" }}>Security</h4>
                          <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: "4px 0 0 0" }}>Step 3 of 3</p>
                        </div>
                        <div style={{ gridColumn: "1 / -1" }}>
                          <label htmlFor="signup-password">Password</label>
                          <div className="password-input-wrap" style={{ position: "relative" }}>
                            <input
                              id="signup-password"
                              className="dev-input"
                              type={showPassword ? "text" : "password"}
                              placeholder="Minimum 8 characters"
                              value={signUpForm.password}
                              onChange={(event) =>
                                setSignUpForm((currentState) => ({ ...currentState, password: event.target.value }))
                              }
                              required
                            />
                            <button 
                              type="button" 
                              onClick={() => setShowPassword(!showPassword)}
                              style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", opacity: 0.6 }}
                            >
                              {showPassword ? "Hide" : "Show"}
                            </button>
                          </div>
                        </div>

                        <div style={{ gridColumn: "1 / -1" }}>
                          <label htmlFor="signup-confirm-password">Confirm Password</label>
                          <div className="password-input-wrap" style={{ position: "relative" }}>
                            <input
                              id="signup-confirm-password"
                              className="dev-input"
                              type={showPassword ? "text" : "password"}
                              placeholder="Re-enter password"
                              value={signUpForm.confirmPassword}
                              onChange={(event) =>
                                setSignUpForm((currentState) => ({ ...currentState, confirmPassword: event.target.value }))
                              }
                              required
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    <p className="dev-note" style={{ marginTop: "16px" }}>Section 2 document upload opens right after account creation.</p>

                    <div className="dev-actions wizard-actions" style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
                      {signupStep > 1 && (
                        <button className="btn-outline" type="button" onClick={() => setSignupStep(s => s - 1)} disabled={isDashboardAuthSubmitting}>
                          Back
                        </button>
                      )}
                      
                      {signupStep < 3 ? (
                        <button 
                          className="btn-fill" 
                          type="button" 
                          onClick={() => {
                            if (validateSignupStep(signupStep)) setSignupStep(s => s + 1);
                          }}
                        >
                          Next Step
                        </button>
                      ) : (
                        <button className="btn-fill" type="submit" disabled={isDashboardAuthSubmitting}>
                          {isDashboardAuthSubmitting ? "Creating Account..." : "Create Account"}
                        </button>
                      )}
                    </div>
                  </form>
                )}
              </div>
            ) : null}

              {devSession && isDashboardDataLoading ? (
                <div className="dev-login-card">
                  <p className="dev-note">Loading your live dashboard data...</p>
                </div>
              ) : null}

              {devSession?.role === "super_admin" && !isDashboardDataLoading ? (
                <div className="lender-portal-shell">
                  <aside className="lender-sidebar">
                    <div className="lender-sidebar-header">
                      <div className="dev-role-badge">Super Admin</div>
                      <h3>{devSession.displayName}</h3>
                      <p>{devSession.email}</p>
                    </div>

                    <div className="lender-sidebar-actions">
                      <button className="btn-fill" type="button" onClick={() => void refreshSuperAdminOverviewData()}>
                        {isSuperAdminLoading ? "Refreshing..." : "Refresh Global Data"}
                      </button>
                    </div>
                  </aside>

                  <div className="lender-portal-main">
                    <div className="lender-section-head">
                      <h3>Platform Access Dashboard</h3>
                      <p>Review every lender/borrower profile and all uploaded onboarding documents in one place.</p>
                    </div>

                    {superAdminOverview ? (
                      <>
                        <div className="lender-hero-grid">
                          <div className="lender-hero-tile">
                            <span className="tile-label">Total Users</span>
                            <div className="tile-value">{superAdminOverview.totals.users}</div>
                            <p className="tile-note">Includes borrowers, lenders, and admins</p>
                          </div>
                          <div className="lender-hero-tile">
                            <span className="tile-label">Lenders / Borrowers</span>
                            <div className="tile-value">{`${superAdminOverview.totals.lenders} / ${superAdminOverview.totals.borrowers}`}</div>
                            <p className="tile-note">Live profile distribution</p>
                          </div>
                          <div className="lender-hero-tile">
                            <span className="tile-label">Documents Uploaded</span>
                            <div className="tile-value">{superAdminOverview.totals.documents}</div>
                            <p className="tile-note">Pending onboarding: {superAdminOverview.totals.pendingOnboarding}</p>
                          </div>
                        </div>

                        <div className="lender-opportunity-card" style={{ marginTop: "14px" }}>
                          <div className="lender-card-head">
                            <h4>User Registry</h4>
                            <span>{`Refreshed ${new Date(superAdminOverview.refreshedAt).toLocaleString()}`}</span>
                          </div>
                          <div className="table-scroll">
                            <table className="lender-opportunity-table">
                              <thead>
                                <tr>
                                  <th>Role</th>
                                  <th>Name</th>
                                  <th>Email</th>
                                  <th>Profile Snapshot</th>
                                  <th>Section 2</th>
                                  <th>Docs</th>
                                  <th>Updated</th>
                                </tr>
                              </thead>
                              <tbody>
                                {superAdminOverview.users.length > 0 ? (
                                  superAdminOverview.users.map((user) => {
                                    const profileSnapshot =
                                      user.role === "lender"
                                        ? `${user.lenderProfile?.companyName || "-"} | ${user.lenderProfile?.kycStatus || "-"}`
                                        : user.role === "requestor"
                                          ? `${user.requestorProfile?.businessName || "-"} | ${user.requestorProfile?.stage || "-"}`
                                          : "Super admin account";

                                    return (
                                      <tr key={`${user.profileId}-${user.role}`}>
                                        <td>{user.role.replace("_", " ")}</td>
                                        <td>{user.displayName || "-"}</td>
                                        <td>{user.email || "-"}</td>
                                        <td>{profileSnapshot}</td>
                                        <td>{user.onboardingCompleted ? "Completed" : "Pending"}</td>
                                        <td>{user.documentCount}</td>
                                        <td>{new Date(user.updatedAt).toLocaleString()}</td>
                                      </tr>
                                    );
                                  })
                                ) : (
                                  <tr>
                                    <td colSpan={7}>No users found.</td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        <div className="lender-opportunity-card" style={{ marginTop: "14px" }}>
                          <div className="lender-card-head">
                            <h4>Document Registry</h4>
                            <span>Cross-account KYC and onboarding documents</span>
                          </div>
                          <div className="table-scroll">
                            <table className="lender-opportunity-table">
                              <thead>
                                <tr>
                                  <th>Owner ID</th>
                                  <th>Role</th>
                                  <th>Type</th>
                                  <th>File</th>
                                  <th>Uploaded By</th>
                                  <th>Uploaded At</th>
                                  <th>Action</th>
                                </tr>
                              </thead>
                              <tbody>
                                {superAdminOverview.documents.length > 0 ? (
                                  superAdminOverview.documents.map((document) => (
                                    <tr key={document.id}>
                                      <td>{document.profileId}</td>
                                      <td>{document.role}</td>
                                      <td>{profileDocumentTypeLabels[document.documentType]}</td>
                                      <td>{document.fileName}</td>
                                      <td>{document.uploadedByName || document.uploadedByEmail}</td>
                                      <td>{new Date(document.uploadedAt).toLocaleString()}</td>
                                      <td>
                                        <div className="deal-action-group">
                                          <button
                                            type="button"
                                            className="mini-btn-link"
                                            onClick={() => void handleViewUploadedDocument(document)}
                                          >
                                            View
                                          </button>
                                          <button
                                            type="button"
                                            className="mini-btn-link"
                                            onClick={() => void handleDownloadUploadedDocument(document)}
                                          >
                                            Download
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))
                                ) : (
                                  <tr>
                                    <td colSpan={7}>No documents uploaded.</td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="dev-info-card">
                        <p className="dev-note">No platform records available. Use Refresh Global Data to load the latest data.</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {devSession && !devSession.role.includes("super_admin") && (isDashboardDataLoading || !lenderProfile && !requestorProfile) ? (
                <div className="dev-login-card" style={{ margin: "20px" }}>
                  <p className="dev-note">Loading your workspace data...</p>
                </div>
              ) : null}

              {devSession?.role === "lender" && lenderProfile && !isDashboardDataLoading ? (
                <div className="lender-portal-shell">
                  <aside className="lender-sidebar">
                    <div className="lender-sidebar-header">
                      <div className="dev-role-badge">Lender Workspace</div>
                      <h3>{lenderProfile.companyName}</h3>
                      <p>{devSession.email}</p>
                      <p>
                        {isRegistrationSectionTwoComplete
                          ? "Section 2 complete"
                          : "Section 2 pending: upload required documents"}
                      </p>
                    </div>

                    <div className="lender-sidebar-nav">
                      <button
                        type="button"
                        className={`lender-nav-btn ${activePortalSection === "overview" ? "active" : ""}`}
                        onClick={() => setWorkspaceSectionAndRoute("overview")}
                      >
                        Overview
                      </button>
                      <button
                        type="button"
                        className={`lender-nav-btn ${activePortalSection === "marketplace" ? "active" : ""}`}
                        onClick={() => setWorkspaceSectionAndRoute("marketplace")}
                      >
                        Marketplace
                      </button>
                      <button
                        type="button"
                        className={`lender-nav-btn ${activePortalSection === "documents" ? "active" : ""}`}
                        onClick={() => setWorkspaceSectionAndRoute("documents")}
                      >
                        Documents
                      </button>
                      <button
                        type="button"
                        className={`lender-nav-btn ${activePortalSection === "payments" ? "active" : ""}`}
                        onClick={() => setWorkspaceSectionAndRoute("payments")}
                      >
                        Payments
                      </button>
                      <button
                        type="button"
                        className={`lender-nav-btn ${activePortalSection === "support" ? "active" : ""}`}
                        onClick={() => setWorkspaceSectionAndRoute("support")}
                      >
                        Support
                      </button>
                    </div>

                  </aside>

                  <div className="lender-portal-main">
                    {activePortalSection === "overview" ? (
                      <>
                        <div className="lender-section-head">
                          <h3>Portfolio Overview</h3>
                          <p>Monitor deployment, earnings, and repayments in one consolidated view.</p>
                        </div>

                        <div className="lender-hero-grid">
                          <div className="lender-hero-tile">
                            <div className="tile-label">Total AUM (Assets Under Management)</div>
                            <div className="tile-value">{formatInrFromLakhs(totalAumLakh)}</div>
                            <div className="tile-note">Currently deployed across active loan book</div>
                          </div>
                          <div className="lender-hero-tile">
                            <div className="tile-label">Total Earnings / Interest</div>
                            <div className="tile-value">{formatInrValue(liveInterestCounter)}</div>
                            <div className="tile-note">Calculated from your persisted settlement and earnings records</div>
                          </div>
                          <div className="lender-hero-tile">
                            <div className="tile-label">New Deals Available</div>
                            <div className="tile-value">{filteredDeals.length}</div>
                            <div className="tile-badge">Live</div>
                            <div className="tile-note">Matches your current lending criteria</div>
                          </div>
                        </div>

                        <div className="lender-repayment-card">
                          <div className="lender-card-head">
                            <h4>Repayment Calendar</h4>
                            <span>{dueThisMonthCount} pending this month</span>
                          </div>
                          <div className="repayment-list">
                            {lenderRepayments.length > 0 ? (
                              lenderRepayments.map((repayment) => (
                                <div key={`${repayment.borrower}-${repayment.dueDate}`} className="repayment-row">
                                  <div>
                                    <strong>{repayment.borrower}</strong>
                                    <p>{repayment.dueDate}</p>
                                  </div>
                                  <div className="repayment-amount">{formatInrFromLakhs(repayment.amountLakh)}</div>
                                  <div className={`repayment-status ${repayment.status.toLowerCase()}`}>
                                    {repayment.status}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <p className="dev-note">No repayment records found.</p>
                            )}
                          </div>
                        </div>
                      </>
                    ) : null}

                    {activePortalSection === "marketplace" ? (
                      <>
                        <div className="lender-section-head">
                          <h3>Deal Pipeline</h3>
                          <p>Filter opportunities and review underwriting details before submitting offers.</p>
                        </div>

                        <div className="lender-market-layout">
                          <aside className="lender-filter-panel">
                            <h4>Filtering Sidebar</h4>
                            <div className="filter-group">
                              <label htmlFor="filter-industry">Industry</label>
                              <select
                                id="filter-industry"
                                value={dealIndustryFilter}
                                onChange={(event) => setDealIndustryFilter(event.target.value)}
                              >
                                <option value="ALL">All Industries</option>
                                {lenderIndustries.map((industry) => (
                                  <option key={industry} value={industry}>
                                    {industry}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="filter-group">
                              <label htmlFor="filter-ask">Ask Amount</label>
                              <select
                                id="filter-ask"
                                value={dealAskBandFilter}
                                onChange={(event) => setDealAskBandFilter(event.target.value as DealAskBand)}
                              >
                                <option value="ALL">All Ranges</option>
                                <option value="UPTO_5CR">Up to ₹5Cr</option>
                                <option value="5CR_TO_10CR">₹5Cr to ₹10Cr</option>
                                <option value="ABOVE_10CR">Above ₹10Cr</option>
                              </select>
                            </div>
                            <div className="filter-group">
                              <label htmlFor="filter-vintage">Revenue Vintage</label>
                              <select
                                id="filter-vintage"
                                value={dealVintageFilter}
                                onChange={(event) => setDealVintageFilter(event.target.value as DealVintageBand)}
                              >
                                <option value="ALL">Any Vintage</option>
                                <option value="2_PLUS">Operating for 2+ years</option>
                                <option value="3_PLUS">Operating for 3+ years</option>
                              </select>
                            </div>
                          </aside>

                          <div className="lender-opportunity-card">
                            <div className="lender-card-head">
                              <h4>Opportunities</h4>
                              <div className="deal-action-group">
                                <span>{filteredDeals.length} matches</span>
                                <button
                                  type="button"
                                  className="mini-btn"
                                  onClick={() => setShowComparisonMatrix((currentValue) => !currentValue)}
                                >
                                  {showComparisonMatrix ? "Hide Comparison" : "Compare Deals"}
                                </button>
                              </div>
                            </div>
                            <div className="table-scroll">
                              <table className="lender-opportunity-table">
                                <thead>
                                  <tr>
                                    <th>Company</th>
                                    <th>Industry</th>
                                    <th>Ask Amount</th>
                                    <th>MRR</th>
                                    <th>Revenue Vintage</th>
                                    <th>Match Score</th>
                                    <th>Action</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {filteredDeals.length > 0 ? (
                                    filteredDeals.map((deal) => (
                                      <tr key={deal.id}>
                                        <td>{deal.companyName}</td>
                                        <td>{deal.industry}</td>
                                        <td>{`₹${deal.askAmountCr.toFixed(1)}Cr`}</td>
                                        <td>{`₹${deal.monthlyMrrLakh.toFixed(0)}L`}</td>
                                        <td>{`${deal.revenueVintageYears}+ years`}</td>
                                        <td>{`${deal.matchScore}%`}</td>
                                        <td>
                                          <div className="deal-action-group">
                                            <button
                                              type="button"
                                              className="mini-btn"
                                              onClick={() => selectDealForReview(deal.id)}
                                            >
                                              View Details
                                            </button>
                                            <button
                                              type="button"
                                              className="mini-btn fill"
                                              onClick={() => handleExpressInterest(deal.id)}
                                            >
                                              Express Interest
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    ))
                                  ) : (
                                    <tr>
                                      <td colSpan={7}>No live opportunities are available for the selected filters.</td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>

                            {showComparisonMatrix ? (
                              <div className="table-scroll" style={{ marginTop: "18px" }}>
                                <table className="lender-opportunity-table">
                                  <thead>
                                    <tr>
                                      <th>Company</th>
                                      <th>Ask</th>
                                      <th>MRR</th>
                                      <th>Churn</th>
                                      <th>Match Score</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {comparisonDeals.length > 0 ? (
                                      comparisonDeals.map((deal) => (
                                        <tr key={`${deal.id}-matrix`}>
                                          <td>{deal.companyName}</td>
                                          <td>{`₹${deal.askAmountCr.toFixed(1)}Cr`}</td>
                                          <td>{`₹${deal.monthlyMrrLakh.toFixed(0)}L`}</td>
                                          <td>{`${deal.churnPercent.toFixed(1)}%`}</td>
                                          <td>{`${deal.matchScore}%`}</td>
                                        </tr>
                                      ))
                                    ) : (
                                      <tr>
                                        <td colSpan={5}>Comparison table appears after opportunities are shortlisted.</td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <div className="lender-deep-dive">
                          <div className="lender-deep-main">
                            <div className="lender-card-head">
                              <h4>
                                {selectedDeal
                                  ? `Borrower Profile Review: ${selectedDeal.companyName}`
                                  : "Borrower Profile Review"}
                              </h4>
                              <span>{selectedDeal?.operatingSince ?? "Select a company"}</span>
                            </div>
                            <div className="lender-tab-strip">
                              <button
                                type="button"
                                className={`lender-tab-btn ${activeDeepDiveTab === "financials" ? "active" : ""}`}
                                onClick={() => setActiveDeepDiveTab("financials")}
                              >
                                Financials
                              </button>
                              <button
                                type="button"
                                className={`lender-tab-btn ${activeDeepDiveTab === "kyc-docs" ? "active" : ""}`}
                                onClick={() => setActiveDeepDiveTab("kyc-docs")}
                              >
                                KYC &amp; Docs
                              </button>
                              <button
                                type="button"
                                className={`lender-tab-btn ${activeDeepDiveTab === "bank-analysis" ? "active" : ""}`}
                                onClick={() => setActiveDeepDiveTab("bank-analysis")}
                              >
                                Bank Analysis
                              </button>
                            </div>

                            {activeDeepDiveTab === "financials" ? (
                              <div className="deep-financials-grid">
                                <div className="deep-metric-card">
                                  <span>Monthly MRR</span>
                                  <strong>{`₹${(selectedDeal?.monthlyMrrLakh ?? 0).toFixed(0)}L`}</strong>
                                </div>
                                <div className="deep-metric-card">
                                  <span>Monthly Revenue</span>
                                  <strong>{`₹${(selectedDeal?.monthlyRevenueCr ?? 0).toFixed(2)}Cr`}</strong>
                                </div>
                                <div className="deep-metric-card">
                                  <span>Burn Rate</span>
                                  <strong>{`₹${(selectedDeal?.burnRateLakh ?? 0).toFixed(0)}L`}</strong>
                                </div>
                                <div className="deep-metric-card">
                                  <span>Bank Balance</span>
                                  <strong>{`₹${(selectedDeal?.bankBalanceLakh ?? 0).toFixed(0)}L`}</strong>
                                </div>
                                <div className="deep-metric-card">
                                  <span>Customer Churn</span>
                                  <strong>{`${(selectedDeal?.churnPercent ?? 0).toFixed(1)}%`}</strong>
                                </div>

                                <div className="deep-bar-card">
                                  <h5>Financial Trend Analysis</h5>
                                  <div className="bar-row">
                                    <span>Revenue</span>
                                    <div className="bar-track">
                                      <div
                                        className="bar-fill"
                                        style={{ width: `${Math.min(95, (selectedDeal?.monthlyRevenueCr ?? 0) * 25)}%` }}
                                      ></div>
                                    </div>
                                  </div>
                                  <div className="bar-row">
                                    <span>Burn</span>
                                    <div className="bar-track">
                                      <div
                                        className="bar-fill warn"
                                        style={{ width: `${Math.min(95, selectedDeal?.burnRateLakh ?? 0)}%` }}
                                      ></div>
                                    </div>
                                  </div>
                                  <div className="bar-row">
                                    <span>Liquidity</span>
                                    <div className="bar-track">
                                      <div
                                        className="bar-fill"
                                        style={{ width: `${Math.min(95, (selectedDeal?.bankBalanceLakh ?? 0) / 2)}%` }}
                                      ></div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ) : null}

                            {activeDeepDiveTab === "kyc-docs" ? (
                              <div className="deep-docs-list">
                                <div className="doc-row">
                                  <div>
                                    <strong>CIN</strong>
                                    <p>{selectedDeal?.cin || "Not provided"}</p>
                                  </div>
                                  <button type="button" className="mini-btn">
                                    Verify
                                  </button>
                                </div>
                                <div className="doc-row">
                                  <div>
                                    <strong>PAN</strong>
                                    <p>{selectedDeal?.pan || "Not provided"}</p>
                                  </div>
                                  <button type="button" className="mini-btn">
                                    Verify
                                  </button>
                                </div>
                                <div className="doc-row">
                                  <div>
                                    <strong>Directors</strong>
                                    <p>{selectedDeal?.directors?.join(", ") || "Not provided"}</p>
                                  </div>
                                  <button type="button" className="mini-btn">
                                    Review
                                  </button>
                                </div>
                                {(selectedDeal?.kycDocuments ?? []).length > 0 ? (
                                  (selectedDeal?.kycDocuments ?? []).map((documentLabel) => (
                                    <div key={documentLabel} className="doc-row">
                                      <strong>{documentLabel}</strong>
                                      <button type="button" className="mini-btn">
                                        Download
                                      </button>
                                    </div>
                                  ))
                                ) : (
                                  <p className="dev-note">No KYC documents uploaded for this company.</p>
                                )}
                              </div>
                            ) : null}

                            {activeDeepDiveTab === "bank-analysis" ? (
                              <div className="table-scroll">
                                <table className="lender-opportunity-table">
                                  <thead>
                                    <tr>
                                      <th>Date</th>
                                      <th>Category</th>
                                      <th>Inflow</th>
                                      <th>Outflow</th>
                                      <th>Observation</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(selectedDeal?.bankAnalysisRows ?? []).length > 0 ? (
                                      (selectedDeal?.bankAnalysisRows ?? []).map((analysisRow, index) => (
                                        <tr key={`${analysisRow.date}-${analysisRow.category}-${index}`}>
                                          <td>{analysisRow.date}</td>
                                          <td>{analysisRow.category}</td>
                                          <td>{analysisRow.inflow}</td>
                                          <td>{analysisRow.outflow}</td>
                                          <td>{analysisRow.observation}</td>
                                        </tr>
                                      ))
                                    ) : (
                                      <tr>
                                        <td colSpan={5}>No bank analysis entries available for this company.</td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            ) : null}
                          </div>

                          <aside className="lender-bid-console">
                            <h4>Offer Desk</h4>
                            <div className="bid-field">
                              <label htmlFor="bid-rate">Interest Rate (%)</label>
                              <input
                                id="bid-rate"
                                type="number"
                                value={biddingInputs.interestRate}
                                onChange={(event) => updateBiddingInput("interestRate", event.target.value)}
                              />
                            </div>
                            <div className="bid-field">
                              <label htmlFor="bid-tenure">Tenure (Months)</label>
                              <input
                                id="bid-tenure"
                                type="number"
                                value={biddingInputs.tenureMonths}
                                onChange={(event) => updateBiddingInput("tenureMonths", event.target.value)}
                              />
                            </div>
                            <div className="bid-field">
                              <label htmlFor="bid-moratorium">Moratorium (Months)</label>
                              <input
                                id="bid-moratorium"
                                type="number"
                                value={biddingInputs.moratoriumMonths}
                                onChange={(event) => updateBiddingInput("moratoriumMonths", event.target.value)}
                              />
                            </div>
                            <button type="button" className="btn-fill" onClick={submitBidOffer}>
                              Submit Offer
                            </button>
                          </aside>
                        </div>
                      </>
                    ) : null}

                    {activePortalSection === "documents" ? (
                      <>
                        <div className="lender-section-head">
                          <h3>Active Portfolio &amp; Risk Monitor</h3>
                          <p>Track loan health, collection progress, and early-warning signals in one place.</p>
                        </div>

                        {renderRegistrationDocumentUploadPanel()}

                        <div className="portfolio-loan-grid">
                          {lenderPortfolio.length > 0 ? (
                            lenderPortfolio.map((loan) => {
                              const completionPercent = Math.round(
                                (loan.installmentsPaid / loan.totalInstallments) * 100
                              );
                              const isWarning = loan.bankBalanceLakh < loan.warningThresholdLakh;

                              return (
                                <div key={loan.id} className="portfolio-loan-card">
                                  <div className="lender-card-head">
                                    <h4>{loan.borrower}</h4>
                                    <span className={`health-flag ${isWarning ? "warning" : "healthy"}`}>
                                      {isWarning ? "Warning" : "Healthy"}
                                    </span>
                                  </div>
                                  <p>{`Outstanding: ${formatInrFromLakhs(loan.outstandingLakh)} | Next Due: ${loan.nextDueDate}`}</p>
                                  <p>{`Bank Balance: ${formatInrFromLakhs(loan.bankBalanceLakh)}`}</p>
                                  <div className="progress-wrap">
                                    <div className="progress-meta">
                                      <span>Collection Status</span>
                                      <span>{`${loan.installmentsPaid} of ${loan.totalInstallments} installments paid`}</span>
                                    </div>
                                    <div className="progress-track">
                                      <div className="progress-fill" style={{ width: `${completionPercent}%` }}></div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <div className="dev-info-card">
                              <p className="dev-note">No active portfolio records.</p>
                            </div>
                          )}
                        </div>
                      </>
                    ) : null}

                    {activePortalSection === "payments" ? (
                      <>
                        <div className="lender-section-head">
                          <h3>Settlements &amp; Reports</h3>
                          <p>Payout logs, certificates, and export center for finance teams.</p>
                        </div>

                        <div className="lender-transaction-layout">
                          <div className="lender-opportunity-card">
                            <div className="lender-card-head">
                              <h4>Payout Logs</h4>
                              <span>{formatInrFromLakhs(totalSettledLakh)} settled</span>
                            </div>
                            <div className="table-scroll">
                              <table className="lender-opportunity-table">
                                <thead>
                                  <tr>
                                    <th>Date</th>
                                    <th>Borrower</th>
                                    <th>Amount</th>
                                    <th>Ref</th>
                                    <th>Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {lenderPayoutEntries.length > 0 ? (
                                    lenderPayoutEntries.map((entry) => (
                                      <tr key={entry.settlementReference}>
                                        <td>{entry.settlementDate}</td>
                                        <td>{entry.borrower}</td>
                                        <td>{formatInrFromLakhs(entry.amountLakh)}</td>
                                        <td>{entry.settlementReference}</td>
                                        <td>{entry.status}</td>
                                      </tr>
                                    ))
                                  ) : (
                                    <tr>
                                      <td colSpan={5}>No payout records found.</td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          <div className="transaction-side-panel">
                            <div className="dev-info-card">
                              <h4>Settlement Tracker</h4>
                              <div className="table-scroll">
                                <table className="lender-opportunity-table">
                                  <thead>
                                    <tr>
                                      <th>Loan ID</th>
                                      <th>Borrower</th>
                                      <th>UTR</th>
                                      <th>Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {lenderEvidenceEntries.length > 0 ? (
                                      lenderEvidenceEntries.map((entry) => (
                                        <tr key={entry.loanId}>
                                          <td>{entry.loanId}</td>
                                          <td>{entry.borrower}</td>
                                          <td>{entry.utrNumber}</td>
                                          <td>{formatInrFromLakhs(entry.amountLakh)}</td>
                                        </tr>
                                      ))
                                    ) : (
                                      <tr>
                                        <td colSpan={4}>No settlement evidence records found.</td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            <div className="dev-info-card">
                              <h4>Tax / TDS Certificates</h4>
                              <div className="deep-docs-list compact">
                                {lenderCertificates.length > 0 ? (
                                  lenderCertificates.map((certificate) => (
                                    <div key={certificate.label} className="doc-row">
                                      <div>
                                        <strong>{certificate.label}</strong>
                                        <p>{`${certificate.period} | Updated ${certificate.updatedAt}`}</p>
                                      </div>
                                      <button type="button" className="mini-btn">
                                        Download
                                      </button>
                                    </div>
                                  ))
                                ) : (
                                  <p className="dev-note">No certificates uploaded.</p>
                                )}
                              </div>
                            </div>

                            <div className="dev-info-card">
                              <h4>Export Center</h4>
                              <p className="dev-note">
                                Download detailed settlement and collection logs in Excel-compatible CSV format.
                              </p>
                              <button type="button" className="btn-fill" onClick={exportPayoutLogs}>
                                Download to Excel
                              </button>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : null}

                    {activePortalSection === "support" ? (
                      <>
                        <div className="lender-section-head">
                          <h3>Account &amp; Support</h3>
                          <p>Manage profile details, access controls, and support requests.</p>
                        </div>

                        <div className="dev-profile-grid">
                          <div className="dev-info-card">
                            <h4>Profile</h4>
                            <ul className="dev-info-list">
                              <li>
                                <span>Company</span>
                                <strong>{lenderProfile.companyName}</strong>
                              </li>
                              <li>
                                <span>Contact</span>
                                <strong>{lenderProfile.contactName}</strong>
                              </li>
                              <li>
                                <span>Email</span>
                                <strong>{lenderProfile.email}</strong>
                              </li>
                              <li>
                                <span>Phone</span>
                                <strong>{lenderProfile.phone || "Not Provided"}</strong>
                              </li>
                              <li>
                                <span>Location</span>
                                <strong>
                                  {[lenderProfile.city, lenderProfile.state, lenderProfile.country]
                                    .filter((segment) => segment && segment.trim().length > 0)
                                    .join(", ") || "Not Provided"}
                                </strong>
                              </li>
                              <li>
                                <span>PAN / GST</span>
                                <strong>{`${lenderProfile.pan || "-"} / ${lenderProfile.gstNumber || "-"}`}</strong>
                              </li>
                              <li>
                                <span>CIN</span>
                                <strong>{lenderProfile.cin || "Not Provided"}</strong>
                              </li>
                              <li>
                                <span>Years in Operation</span>
                                <strong>{lenderProfile.yearsInOperation || "Not Provided"}</strong>
                              </li>
                              <li>
                                <span>Ticket Size</span>
                                <strong>{`₹${lenderProfile.minTicket} - ₹${lenderProfile.maxTicket}`}</strong>
                              </li>
                              <li>
                                <span>Preferred Sectors</span>
                                <strong>{lenderProfile.sectors.length > 0 ? lenderProfile.sectors.join(", ") : "Not Provided"}</strong>
                              </li>
                            </ul>
                            <div className="dev-actions">
                              <button type="button" className="mini-btn" onClick={() => void flushActiveDashboardData()}>
                                Flush Workspace Data
                              </button>
                            </div>
                          </div>

                          <div className="dev-info-card">
                            <h4>Platform Integrations</h4>
                            <div className="deep-docs-list compact">
                              <div className="doc-row">
                                <div>
                                  <strong>API Access</strong>
                                  <p>Credential lifecycle is managed through verified admin approval.</p>
                                </div>
                                <button
                                  type="button"
                                  className="mini-btn"
                                  onClick={() => showToast("Credential rotation request submitted.")}
                                >
                                  Request Rotation
                                </button>
                              </div>
                              <div className="doc-row">
                                <div>
                                  <strong>Webhook Management</strong>
                                  <p>Configure endpoint URL, retry strategy, and event subscriptions.</p>
                                </div>
                                <button
                                  type="button"
                                  className="mini-btn"
                                  onClick={() => showToast("Webhook configuration page opened.")}
                                >
                                  Configure
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {devSession?.role === "requestor" && requestorProfile && !isDashboardDataLoading ? (
                <div className="lender-portal-shell">
                  <aside className="lender-sidebar">
                    <div className="lender-sidebar-header">
                      <div className="dev-role-badge">Borrower Workspace</div>
                      <h3>{requestorProfile.businessName}</h3>
                      <p>{devSession.email}</p>
                      <p>
                        {isRegistrationSectionTwoComplete
                          ? "Section 2 complete"
                          : "Section 2 pending: upload required documents"}
                      </p>
                    </div>

                    <div className="lender-sidebar-nav">
                      <button
                        type="button"
                        className={`lender-nav-btn ${activePortalSection === "overview" ? "active" : ""}`}
                        onClick={() => setWorkspaceSectionAndRoute("overview")}
                      >
                        Overview
                      </button>
                      <button
                        type="button"
                        className={`lender-nav-btn ${activePortalSection === "marketplace" ? "active" : ""}`}
                        onClick={() => setWorkspaceSectionAndRoute("marketplace")}
                      >
                        Marketplace
                      </button>
                      <button
                        type="button"
                        className={`lender-nav-btn ${activePortalSection === "documents" ? "active" : ""}`}
                        onClick={() => setWorkspaceSectionAndRoute("documents")}
                      >
                        Documents
                      </button>
                      <button
                        type="button"
                        className={`lender-nav-btn ${activePortalSection === "payments" ? "active" : ""}`}
                        onClick={() => setWorkspaceSectionAndRoute("payments")}
                      >
                        Payments
                      </button>
                      <button
                        type="button"
                        className={`lender-nav-btn ${activePortalSection === "support" ? "active" : ""}`}
                        onClick={() => setWorkspaceSectionAndRoute("support")}
                      >
                        Support
                      </button>
                    </div>

                  </aside>

                  <div className="lender-portal-main">
                    {activePortalSection === "overview" ? (
                      <>
                        <div className="lender-section-head">
                          <h3>Capital Overview</h3>
                          <p>Track approved capital, drawdown timing, and borrowing costs in real time.</p>
                        </div>

                        <div className="dev-metric-grid">
                          <div className="dev-metric-card">
                            <span>Requested Capital</span>
                            <strong>
                              {borrowerRequestedAmountValue > 0
                                ? formatInrValue(borrowerRequestedAmountValue)
                                : formatInrValue(Math.round(borrowerCapitalLimitCr * 10000000))}
                            </strong>
                          </div>
                          <div className="dev-metric-card">
                            <span>Approved Limit</span>
                            <strong>{`₹${borrowerCapitalLimitCr.toFixed(2)}Cr`}</strong>
                          </div>
                          <div className="dev-metric-card">
                            <span>Estimated EMI (Monthly)</span>
                            <strong>{`₹${borrowerEstimatedMonthlyEmiLakh.toFixed(2)}L`}</strong>
                          </div>
                        </div>

                        <div className="dev-profile-grid">
                          <div className="dev-info-card">
                            <h4>Drawdown Planner</h4>
                            <p className="dev-note">Adjust drawdown to match immediate cash-flow requirements.</p>
                            <label htmlFor="drawdown-slider">Drawdown Percentage: {borrowerDrawdownPercent}%</label>
                            <input
                              id="drawdown-slider"
                              type="range"
                              min={10}
                              max={100}
                              step={5}
                              value={borrowerDrawdownPercent}
                              onChange={(event) => updateBorrowerDrawdownPercent(Number(event.target.value))}
                            />
                            <p className="dev-note">{`Recommended drawdown: ₹${borrowerDrawdownAmountCr.toFixed(2)}Cr`}</p>
                            <p className="dev-note">{`Indicative APR: ${(borrowerOfferForPricing?.aprPercent ?? 0).toFixed(2)}%`}</p>
                            <button type="button" className="btn-fill" onClick={drawdownCapital}>
                              Drawdown Now
                            </button>
                          </div>

                          <div className="dev-info-card">
                            <h4>Business Profile</h4>
                            <ul className="dev-info-list">
                              <li>
                                <span>Founder</span>
                                <strong>{requestorProfile.founderName}</strong>
                              </li>
                              <li>
                                <span>Sector</span>
                                <strong>{requestorProfile.sector || "Not Provided"}</strong>
                              </li>
                              <li>
                                <span>Current Stage</span>
                                <strong>{requestorProfile.stage}</strong>
                              </li>
                              <li>
                                <span>Status</span>
                                <strong>{requestorProfile.status}</strong>
                              </li>
                            </ul>
                          </div>
                        </div>
                      </>
                    ) : null}

                    {activePortalSection === "marketplace" ? (
                      <>
                        <div className="lender-section-head">
                          <h3>Lender Offers</h3>
                          <p>Compare lender terms and confirm an offer for drawdown.</p>
                        </div>

                        <div className="lender-opportunity-card">
                          <div className="lender-card-head">
                            <h4>Available Offers</h4>
                            <span>{borrowerOffersState.length} lenders</span>
                          </div>
                          <div className="table-scroll">
                            <table className="lender-opportunity-table">
                              <thead>
                                <tr>
                                  <th>Lender</th>
                                  <th>Amount</th>
                                  <th>APR</th>
                                  <th>Fee</th>
                                  <th>Tenure</th>
                                  <th>Status</th>
                                  <th>Action</th>
                                </tr>
                              </thead>
                              <tbody>
                                {borrowerOffersState.length > 0 ? (
                                  borrowerOffersState.map((offer) => {
                                    const isAccepted = acceptedBorrowerOfferId === offer.id;

                                    return (
                                      <tr key={offer.id}>
                                        <td>{offer.lenderName}</td>
                                        <td>{`₹${offer.offerAmountCr.toFixed(2)}Cr`}</td>
                                        <td>{`${offer.aprPercent.toFixed(2)}%`}</td>
                                        <td>{`${offer.processingFeePercent.toFixed(1)}%`}</td>
                                        <td>{`${offer.tenureMonths} months`}</td>
                                        <td>{isAccepted ? "Accepted" : offer.status}</td>
                                        <td>
                                          <div className="deal-action-group">
                                            <button
                                              type="button"
                                              className="mini-btn"
                                              onClick={() => shortlistBorrowerOffer(offer.id)}
                                            >
                                              Shortlist
                                            </button>
                                            <button
                                              type="button"
                                              className="mini-btn fill"
                                              onClick={() => acceptBorrowerOffer(offer.id)}
                                            >
                                              {isAccepted ? "Accepted" : "Accept Offer"}
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })
                                ) : (
                                  <tr>
                                    <td colSpan={7}>No lender offers available at the moment.</td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </>
                    ) : null}

                    {activePortalSection === "documents" ? (
                      <>
                        <div className="lender-section-head">
                          <h3>Documents, Integrations &amp; KFS</h3>
                          <p>Manage integrations and complete KFS acknowledgement before requesting disbursal.</p>
                        </div>

                        {renderRegistrationDocumentUploadPanel()}

                        <div className="dev-profile-grid">
                          <div className="dev-info-card">
                            <h4>Integration Access</h4>
                            <div className="deep-docs-list compact">
                              {borrowerIntegrations.length > 0 ? (
                                borrowerIntegrations.map((integration) => (
                                  <div key={integration.id} className="doc-row">
                                    <div>
                                      <strong>{integration.name}</strong>
                                      <p>{`${integration.status} | ${integration.lastSyncAt}`}</p>
                                    </div>
                                    <button
                                      type="button"
                                      className="mini-btn"
                                      onClick={() => toggleBorrowerIntegration(integration.id)}
                                    >
                                      {integration.status === "Connected" ? "Revoke Access" : "Reconnect"}
                                    </button>
                                  </div>
                                ))
                              ) : (
                                <p className="dev-note">No integrations connected.</p>
                              )}
                            </div>
                          </div>

                          <div className="dev-info-card">
                            <h4>Key Fact Statement (Mandatory)</h4>
                            <p className="dev-note">
                              {`Lender: ${borrowerOfferForPricing?.lenderName ?? "Pending selection"} | APR: ${(borrowerOfferForPricing?.aprPercent ?? 0).toFixed(2)}% | Tenure: ${borrowerOfferForPricing?.tenureMonths ?? 0} months`}
                            </p>
                            <div className="table-scroll">
                              <table className="lender-opportunity-table">
                                <thead>
                                  <tr>
                                    <th>Due Date</th>
                                    <th>Estimated Installment</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {borrowerKfsRows.length > 0 ? (
                                    borrowerKfsRows.map((row) => (
                                      <tr key={row.dueDate}>
                                        <td>{row.dueDate}</td>
                                        <td>{`₹${Math.max(row.amountLakh, borrowerEstimatedMonthlyEmiLakh).toFixed(2)}L`}</td>
                                      </tr>
                                    ))
                                  ) : (
                                    <tr>
                                      <td colSpan={2}>KFS schedule is not available.</td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                            <label style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "10px" }}>
                              <input
                                type="checkbox"
                                checked={borrowerKfsAccepted}
                                onChange={(event) => updateBorrowerKfsAccepted(event.target.checked)}
                              />
                              <span>I acknowledge and accept this KFS for disbursal.</span>
                            </label>
                          </div>
                        </div>
                      </>
                    ) : null}

                    {activePortalSection === "payments" ? (
                      <>
                        <div className="lender-section-head">
                          <h3>Repayment Monitor</h3>
                          <p>Monitor due cycles, UTR proof, and auto-debit status.</p>
                        </div>

                        <div className="lender-opportunity-card">
                          <div className="lender-card-head">
                            <h4>Repayment Schedule</h4>
                            <button
                              type="button"
                              className="mini-btn"
                              onClick={toggleBorrowerAutopay}
                            >
                              {borrowerAutopayEnabled ? "Auto Pay: Enabled" : "Auto Pay: Disabled"}
                            </button>
                          </div>
                          <div className="table-scroll">
                            <table className="lender-opportunity-table">
                              <thead>
                                <tr>
                                  <th>Due Date</th>
                                  <th>Amount</th>
                                  <th>Status</th>
                                  <th>UTR / Reference</th>
                                </tr>
                              </thead>
                              <tbody>
                                {borrowerRepaymentState.length > 0 ? (
                                  borrowerRepaymentState.map((item) => (
                                    <tr key={item.dueDate}>
                                      <td>{item.dueDate}</td>
                                      <td>{formatInrFromLakhs(item.amountLakh)}</td>
                                      <td>{item.status}</td>
                                      <td>{item.utr}</td>
                                    </tr>
                                  ))
                                ) : (
                                  <tr>
                                    <td colSpan={4}>No repayment records found.</td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </>
                    ) : null}

                    {activePortalSection === "support" ? (
                      <>
                        <div className="lender-section-head">
                          <h3>Account &amp; Support</h3>
                          <p>Track onboarding status, keep profile data current, and manage support requests.</p>
                        </div>

                        <div className="dev-profile-grid">
                          <div className="dev-info-card">
                            <h4>Profile</h4>
                            <ul className="dev-info-list">
                              <li>
                                <span>Business</span>
                                <strong>{requestorProfile.businessName}</strong>
                              </li>
                              <li>
                                <span>Founder</span>
                                <strong>{requestorProfile.founderName}</strong>
                              </li>
                              <li>
                                <span>Email</span>
                                <strong>{requestorProfile.email}</strong>
                              </li>
                              <li>
                                <span>Phone</span>
                                <strong>{requestorProfile.phone || "Not Provided"}</strong>
                              </li>
                              <li>
                                <span>Location</span>
                                <strong>
                                  {[requestorProfile.city, requestorProfile.state, requestorProfile.country]
                                    .filter((segment) => segment && segment.trim().length > 0)
                                    .join(", ") || "Not Provided"}
                                </strong>
                              </li>
                              <li>
                                <span>Sector</span>
                                <strong>{requestorProfile.sector || "Not Provided"}</strong>
                              </li>
                              <li>
                                <span>PAN / GST</span>
                                <strong>{`${requestorProfile.pan || "-"} / ${requestorProfile.gstNumber || "-"}`}</strong>
                              </li>
                              <li>
                                <span>Requested Amount</span>
                                <strong>{requestorProfile.requestedAmount || "Not Provided"}</strong>
                              </li>
                              <li>
                                <span>Monthly Revenue</span>
                                <strong>{requestorProfile.monthlyRevenue || "Not Provided"}</strong>
                              </li>
                            </ul>
                            <div className="dev-actions">
                              <button type="button" className="mini-btn" onClick={() => void flushActiveDashboardData()}>
                                Flush Workspace Data
                              </button>
                            </div>
                          </div>
                          <div className="dev-info-card">
                            <h4>Current Action</h4>
                            <p className="dev-note">{requestorProfile.nextAction}</p>
                            <p className="dev-note">
                              Profile updated at {new Date(requestorProfile.updatedAt).toLocaleString()}.
                            </p>
                            <div className="dev-actions">
                              <button type="button" className="mini-btn" onClick={() => showToast("Support ticket created.")}>
                                Raise Priority Ticket
                              </button>
                              <button
                                type="button"
                                className="mini-btn"
                                onClick={() => showToast("Relationship manager call booked.")}
                              >
                                Book RM Call
                              </button>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
              ) : null}
          </div>
        </section>
        ) : null}
      </div>

      {!devSession ? (
        <footer>
          <div className="footer-inner">
            <div className="footer-top">
              <div className="footer-brand">
                <span
                  style={{
                    fontFamily: "Cormorant Garamond, serif",
                    fontSize: "1.5rem",
                    fontWeight: 700,
                    letterSpacing: ".1em",
                    color: "#fff",
                    cursor: "pointer"
                  }}
                  onClick={() => showPage("home")}
                >
                  CRED<span style={{ color: "#C8102E" }}>VANCE</span>
                </span>
                <p>
                  India's business loan marketplace connecting borrowers with the right lenders - faster, fairer, and
                  fully transparent.
                </p>
              </div>
              <div className="footer-col">
                <h4>Platform</h4>
                <ul>
                  <li>
                    <a onClick={() => showPage("home")}>Home</a>
                  </li>
                  <li>
                    <a onClick={() => showPage("about")}>About Us</a>
                  </li>
                  <li>
                    <a onClick={() => showPage("services")}>Services</a>
                  </li>
                  <li>
                    <a onClick={() => showPage("contact")}>Contact</a>
                  </li>
                  <li>
                    <a onClick={() => openAccountAccess("signin")}>Register &amp; Login</a>
                  </li>
                </ul>
              </div>
              <div className="footer-col">
                <h4>For Borrowers</h4>
                <ul>
                  <li>
                    <a onClick={() => showPage("contact", "borrower")}>Apply for a Loan</a>
                  </li>
                  <li>
                    <a onClick={() => showPage("services")}>Working Capital</a>
                  </li>
                  <li>
                    <a onClick={() => showPage("services")}>Expansion Loans</a>
                  </li>
                  <li>
                    <a onClick={() => showPage("services")}>Invoice Discounting</a>
                  </li>
                </ul>
              </div>
              <div className="footer-col">
                <h4>For Lenders</h4>
                <ul>
                  <li>
                    <a onClick={() => openAccountAccess("signin")}>Lender Login</a>
                  </li>
                  <li>
                    <a onClick={() => showPage("services")}>Marketplace Access</a>
                  </li>
                  <li>
                    <a onClick={() => showPage("about")}>Our Process</a>
                  </li>
                  <li>
                    <a onClick={() => showPage("contact")}>Partner With Us</a>
                  </li>
                </ul>
              </div>
            </div>
            <div className="footer-bottom">
              <p>© 2025 CREDVANCE. All rights reserved. Kerala, India.</p>
              <div className="footer-legal">
                <a onClick={() => showPage("about")}>Privacy Policy</a>
                <a onClick={() => showPage("about")}>Terms of Use</a>
                <a onClick={() => showPage("services")}>RBI Guidelines</a>
              </div>
            </div>
          </div>
        </footer>
      ) : null}

      <div className={`toast ${toastMessage ? "show" : ""}`}>{toastMessage}</div>

      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          style={{
            position: "fixed",
            bottom: "30px",
            right: "30px",
            width: "44px",
            height: "44px",
            borderRadius: "50%",
            background: "var(--red)",
            color: "#fff",
            border: "none",
            boxShadow: "0 4px 12px rgba(200, 16, 46, 0.3)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1.2rem",
            zIndex: 990,
            transition: "all 0.2s"
          }}
          title="Scroll to Top"
        >
          ↑
        </button>
      )}
    </>
  );
}

export default App;

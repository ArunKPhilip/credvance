import type { DevDashboardSession, DevLenderProfile, DevRequestorProfile } from "../types";
import {
  firebaseSignIn,
  firebaseSignOut,
  firebaseSignUp,
  getCurrentFirebaseUser,
  tryReadDashboardUser,
  tryReadLegacyAppUser,
  createDashboardUser,
  updateDashboardUser,
  getLenderProfile,
  getRequestorProfile,
  createLenderProfile,
  createRequestorProfile,
  firebaseSendPasswordResetEmail
} from "./firebaseService";

export async function loginToDashboard(email: string, password: string): Promise<DevDashboardSession> {
  const credential = await firebaseSignIn(email, password);
  const uid = credential.user.uid;

  // Try reading from new dashboard_users collection using direct doc ID
  let userDoc = await tryReadDashboardUser(uid);
  
  // If not found, try legacy app_users collection
  if (!userDoc) {
    userDoc = await tryReadLegacyAppUser(uid);
  }

  if (!userDoc) {
    throw new Error("No account found with this email. Please sign up first.");
  }

  return {
    role: userDoc.role,
    email: userDoc.email,
    displayName: userDoc.displayName,
    profileId: userDoc.profileId,
    onboardingCompleted: userDoc.onboardingCompleted,
    registrationStep: userDoc.registrationStep
  };
}

export async function logoutDashboardSession(): Promise<void> {
  await firebaseSignOut();
}

export async function getLenderDashboardProfile(profileId: string): Promise<DevLenderProfile | null> {
  const profile = await getLenderProfile(profileId);
  if (profile) return profile;
  // Return a default profile so the dashboard can render with empty data
  return {
    companyName: "Your Company",
    contactName: "User",
    email: "",
    phone: "",
    city: "",
    state: "",
    country: "India",
    website: "",
    pan: "",
    gstNumber: "",
    cin: "",
    yearsInOperation: "",
    kycStatus: "Pending",
    minTicket: "25L",
    maxTicket: "1Cr",
    sectors: [],
    onboardingStep: 1,
    onboardingCompleted: false,
    activeOpportunities: 0,
    pendingReviews: 0,
    totalDeployed: "0",
    updatedAt: new Date().toISOString()
  };
}

export async function getRequestorDashboardProfile(profileId: string): Promise<DevRequestorProfile | null> {
  const profile = await getRequestorProfile(profileId);
  if (profile) return profile;
  // Return a default profile so the dashboard can render with empty data
  return {
    businessName: "Your Business",
    founderName: "User",
    email: "",
    phone: "",
    city: "",
    state: "",
    country: "India",
    website: "",
    sector: "",
    pan: "",
    gstNumber: "",
    yearsInOperation: "",
    monthlyRevenue: "",
    requestedAmount: "",
    approvedAmount: "0",
    stage: "Registration",
    status: "Pending",
    onboardingStep: 1,
    onboardingCompleted: false,
    nextAction: "Complete registration and upload documents",
    updatedAt: new Date().toISOString()
  };
}

export async function registerDashboardAccount(payload: Record<string, unknown>): Promise<DevDashboardSession> {
  const email = payload.email as string;
  const password = payload.password as string;
  const displayName = payload.displayName as string;
  const role = (payload.role as "lender" | "requestor") || "requestor";

  // Create Firebase Auth user
  const credential = await firebaseSignUp(email, password, displayName);
  const uid = credential.user.uid;

  // Create dashboard user document in Firestore
  const profileId = await createDashboardUser(uid, email, displayName, role);

  // Create role-specific profile
  if (role === "lender") {
    await createLenderProfile(profileId, {
      companyName: payload.organizationName || displayName,
      contactName: displayName,
      email,
      phone: payload.phone || "",
      city: payload.city || "",
      state: payload.state || "",
      country: payload.country || "India",
      website: payload.website || "",
      pan: payload.pan || "",
      gstNumber: payload.gstNumber || "",
      cin: payload.cin || "",
      yearsInOperation: payload.yearsInOperation || "",
      kycStatus: "Pending",
      minTicket: payload.minTicket || "25L",
      maxTicket: payload.maxTicket || "1Cr",
      sectors: [],
      onboardingStep: 1,
      onboardingCompleted: false,
      activeOpportunities: 0,
      pendingReviews: 0,
      totalDeployed: "0"
    });
  } else {
    await createRequestorProfile(profileId, {
      businessName: payload.organizationName || displayName,
      founderName: displayName,
      email,
      phone: payload.phone || "",
      city: payload.city || "",
      state: payload.state || "",
      country: payload.country || "India",
      website: payload.website || "",
      sector: payload.sector || "",
      pan: payload.pan || "",
      gstNumber: payload.gstNumber || "",
      yearsInOperation: payload.yearsInOperation || "",
      monthlyRevenue: payload.monthlyRevenue || "",
      requestedAmount: payload.requestedAmount || "",
      approvedAmount: "0",
      stage: "Registration",
      status: "Pending",
      onboardingStep: 1,
      onboardingCompleted: false,
      nextAction: "Complete registration and upload documents"
    });
  }

  return {
    role,
    email,
    displayName,
    profileId,
    onboardingCompleted: false,
    registrationStep: 1
  };
}

export async function updateDashboardOnboardingStatus(
  profileId: string,
  role: string,
  onboardingCompleted: boolean,
  nextRegistrationStep: number
): Promise<void> {
  const user = getCurrentFirebaseUser();
  if (!user) return;

  await updateDashboardUser(user.uid, {
    onboardingCompleted,
    registrationStep: nextRegistrationStep
  });
}

export async function sendPasswordReset(email: string): Promise<void> {
  await firebaseSendPasswordResetEmail(email);
}

export default loginToDashboard;
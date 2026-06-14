import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  limit,
  serverTimestamp,
  type DocumentData,
  type FirestoreError
} from "firebase/firestore";
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  type UploadTaskSnapshot,
  type StorageError
} from "firebase/storage";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
  type UserCredential,
  type AuthError
} from "firebase/auth";
import { firebaseAuth, firestoreDatabase, firebaseStorage } from "../firebase";
import type { 
  DevDashboardSession, 
  DevLenderProfile, 
  DevRequestorProfile,
  ProfileDocumentRecord,
  ProfileDocumentType
} from "../types";

// ───── Firebase Auth ─────

export async function firebaseSignUp(
  email: string,
  password: string,
  displayName: string
): Promise<UserCredential> {
  const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
  await updateProfile(credential.user, { displayName });
  return credential;
}

export async function firebaseSignIn(
  email: string,
  password: string
): Promise<UserCredential> {
  return await signInWithEmailAndPassword(firebaseAuth, email, password);
}

export async function firebaseSignOut(): Promise<void> {
  await signOut(firebaseAuth);
}

export async function firebaseSendPasswordResetEmail(email: string): Promise<void> {
  await sendPasswordResetEmail(firebaseAuth, email);
}

export function getCurrentFirebaseUser() {
  return firebaseAuth.currentUser;
}

export function onFirebaseAuthStateChanged(callback: (user: typeof firebaseAuth.currentUser) => void) {
  return firebaseAuth.onAuthStateChanged(callback);
}

// ───── Firestore: Dashboard Users / Profiles ─────

const USERS_COLLECTION = "dashboard_users";
const OLD_USERS_COLLECTION = "app_users"; // Backward compatibility for migrated accounts
const LENDER_PROFILES_COLLECTION = "lender_profiles";
const REQUESTOR_PROFILES_COLLECTION = "requestor_profiles";
const DASHBOARD_DATA_COLLECTION = "dashboard_data";

export interface DashboardUserDocument {
  uid: string;
  email: string;
  displayName: string;
  role: "lender" | "requestor" | "super_admin";
  profileId: string;
  onboardingCompleted: boolean;
  registrationStep: number;
  createdAt: string;
  updatedAt: string;
}

export async function createDashboardUser(
  uid: string,
  email: string,
  displayName: string,
  role: "lender" | "requestor"
): Promise<string> {
  const profileId = `profile_${uid.slice(0, 12)}`;
  const now = new Date().toISOString();
  
  const userDoc: DashboardUserDocument = {
    uid,
    email,
    displayName,
    role,
    profileId,
    onboardingCompleted: false,
    registrationStep: 1,
    createdAt: now,
    updatedAt: now
  };

  await setDoc(doc(firestoreDatabase, USERS_COLLECTION, uid), userDoc);
  return profileId;
}

export async function tryReadDashboardUser(uid: string): Promise<DashboardUserDocument | null> {
  try {
    const snapshot = await getDoc(doc(firestoreDatabase, USERS_COLLECTION, uid));
    if (!snapshot.exists()) return null;
    return snapshot.data() as DashboardUserDocument;
  } catch {
    return null;
  }
}

export async function tryReadLegacyAppUser(uid: string): Promise<DashboardUserDocument | null> {
  try {
    const snapshot = await getDoc(doc(firestoreDatabase, OLD_USERS_COLLECTION, uid));
    if (!snapshot.exists()) return null;
    const data = snapshot.data();
    // Use the auth uid as profileId for backward compatibility with Firestore rules
    // The old rules use isOwner(profileId) which checks request.auth.uid == profileId
    return {
      uid: data.uid || uid,
      email: data.email || "",
      displayName: data.displayName || data.name || "",
      role: data.role || "requestor",
      profileId: uid, // Use uid as profileId for Firestore rule owner matching
      onboardingCompleted: data.onboardingCompleted || false,
      registrationStep: data.registrationStep || 1,
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: data.updatedAt || new Date().toISOString()
    };
  } catch {
    return null;
  }
}

export async function getDashboardUserByEmail(email: string): Promise<DashboardUserDocument | null> {
  const q = query(collection(firestoreDatabase, USERS_COLLECTION), where("email", "==", email), limit(1));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  const firstDoc = snapshot.docs[0];
  if (!firstDoc) return null;
  return firstDoc.data() as DashboardUserDocument;
}

export async function updateDashboardUser(uid: string, data: Partial<DashboardUserDocument>): Promise<void> {
  await updateDoc(doc(firestoreDatabase, USERS_COLLECTION, uid), {
    ...data,
    updatedAt: new Date().toISOString()
  });
}

export async function createLenderProfile(profileId: string, data: Record<string, unknown>): Promise<void> {
  await setDoc(doc(firestoreDatabase, LENDER_PROFILES_COLLECTION, profileId), {
    ...data,
    profileId,
    onboardingStep: 1,
    onboardingCompleted: false,
    activeOpportunities: 0,
    pendingReviews: 0,
    totalDeployed: "0",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

export async function getLenderProfile(profileId: string): Promise<DevLenderProfile | null> {
  try {
    const snapshot = await getDoc(doc(firestoreDatabase, LENDER_PROFILES_COLLECTION, profileId));
    if (snapshot.exists()) return snapshot.data() as DevLenderProfile;
  } catch {
    // try legacy format
  }
  // Try legacy lender_dashboards format
  try {
    const snapshot = await getDoc(doc(firestoreDatabase, "lender_dashboards", profileId));
    if (snapshot.exists()) return snapshot.data() as DevLenderProfile;
  } catch {
    return null;
  }
  return null;
}

export async function updateLenderProfile(profileId: string, data: Partial<DevLenderProfile>): Promise<void> {
  await updateDoc(doc(firestoreDatabase, LENDER_PROFILES_COLLECTION, profileId), {
    ...data,
    updatedAt: new Date().toISOString()
  });
}

export async function createRequestorProfile(profileId: string, data: Record<string, unknown>): Promise<void> {
  await setDoc(doc(firestoreDatabase, REQUESTOR_PROFILES_COLLECTION, profileId), {
    ...data,
    profileId,
    onboardingStep: 1,
    onboardingCompleted: false,
    stage: "Registration",
    status: "Pending",
    nextAction: "Complete registration and upload documents",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

export async function getRequestorProfile(profileId: string): Promise<DevRequestorProfile | null> {
  try {
    const snapshot = await getDoc(doc(firestoreDatabase, REQUESTOR_PROFILES_COLLECTION, profileId));
    if (snapshot.exists()) return snapshot.data() as DevRequestorProfile;
  } catch {
    // try legacy format
  }
  // Try legacy requestor_dashboards format
  try {
    const snapshot = await getDoc(doc(firestoreDatabase, "requestor_dashboards", profileId));
    if (snapshot.exists()) return snapshot.data() as DevRequestorProfile;
  } catch {
    return null;
  }
  return null;
}

export async function updateRequestorProfile(profileId: string, data: Partial<DevRequestorProfile>): Promise<void> {
  await updateDoc(doc(firestoreDatabase, REQUESTOR_PROFILES_COLLECTION, profileId), {
    ...data,
    updatedAt: new Date().toISOString()
  });
}

// ───── Firestore: Dashboard Data (Marketplace, Offers, etc.) ─────

export interface LenderDashboardData {
  opportunities: any[];
  repaymentSchedule: any[];
  portfolioLoans: any[];
  payoutLogs: any[];
  taxCertificates: any[];
  evidenceLogs: any[];
  selectedDealId: string | null;
  liveInterestCounter: number;
  biddingInputs: { interestRate: string; tenureMonths: string; moratoriumMonths: string };
  updatedAt: string;
}

export interface RequestorDashboardData {
  offers: any[];
  repaymentHistory: any[];
  integrations: any[];
  kfsScheduleRows: any[];
  selectedOfferId: string | null;
  acceptedOfferId: string | null;
  drawdownPercent: number;
  kfsAccepted: boolean;
  autopayEnabled: boolean;
  updatedAt: string;
}

function getDefaultLenderDashboardData(): LenderDashboardData {
  return {
    opportunities: [],
    repaymentSchedule: [],
    portfolioLoans: [],
    payoutLogs: [],
    taxCertificates: [],
    evidenceLogs: [],
    selectedDealId: null,
    liveInterestCounter: 0,
    biddingInputs: { interestRate: "", tenureMonths: "", moratoriumMonths: "" },
    updatedAt: new Date().toISOString()
  };
}

function getDefaultRequestorDashboardData(): RequestorDashboardData {
  return {
    offers: [],
    repaymentHistory: [],
    integrations: [],
    kfsScheduleRows: [],
    selectedOfferId: null,
    acceptedOfferId: null,
    drawdownPercent: 40,
    kfsAccepted: false,
    autopayEnabled: true,
    updatedAt: new Date().toISOString()
  };
}

export async function getLenderDashboardDataFromFirestore(profileId: string): Promise<LenderDashboardData> {
  try {
    const snapshot = await getDoc(doc(firestoreDatabase, DASHBOARD_DATA_COLLECTION, `lender_${profileId}`));
    if (snapshot.exists()) {
      return snapshot.data() as LenderDashboardData;
    }
  } catch {
    // Fall through to default
  }
  
  const defaultData = getDefaultLenderDashboardData();
  await setDoc(doc(firestoreDatabase, DASHBOARD_DATA_COLLECTION, `lender_${profileId}`), defaultData);
  return defaultData;
}

export async function patchLenderDashboardDataInFirestore(
  profileId: string, 
  patch: Partial<LenderDashboardData>
): Promise<void> {
  await updateDoc(doc(firestoreDatabase, DASHBOARD_DATA_COLLECTION, `lender_${profileId}`), {
    ...patch,
    updatedAt: new Date().toISOString()
  });
}

export async function getRequestorDashboardDataFromFirestore(profileId: string): Promise<RequestorDashboardData> {
  try {
    const snapshot = await getDoc(doc(firestoreDatabase, DASHBOARD_DATA_COLLECTION, `requestor_${profileId}`));
    if (snapshot.exists()) {
      return snapshot.data() as RequestorDashboardData;
    }
  } catch {
    // Fall through to default
  }
  
  const defaultData = getDefaultRequestorDashboardData();
  await setDoc(doc(firestoreDatabase, DASHBOARD_DATA_COLLECTION, `requestor_${profileId}`), defaultData);
  return defaultData;
}

export async function patchRequestorDashboardDataInFirestore(
  profileId: string,
  patch: Partial<RequestorDashboardData>
): Promise<void> {
  await updateDoc(doc(firestoreDatabase, DASHBOARD_DATA_COLLECTION, `requestor_${profileId}`), {
    ...patch,
    updatedAt: new Date().toISOString()
  });
}

export async function resetLenderDashboardDataInFirestore(profileId: string): Promise<LenderDashboardData> {
  const defaultData = getDefaultLenderDashboardData();
  await setDoc(doc(firestoreDatabase, DASHBOARD_DATA_COLLECTION, `lender_${profileId}`), defaultData);
  return defaultData;
}

export async function resetRequestorDashboardDataInFirestore(profileId: string): Promise<RequestorDashboardData> {
  const defaultData = getDefaultRequestorDashboardData();
  await setDoc(doc(firestoreDatabase, DASHBOARD_DATA_COLLECTION, `requestor_${profileId}`), defaultData);
  return defaultData;
}

// ───── Firebase Storage: Profile Documents ─────

const DOCUMENTS_COLLECTION = "profile_documents";

export interface UploadDocumentOptions {
  profileId: string;
  role: string;
  documentType: ProfileDocumentType;
  file: File;
  uploadedByName: string;
  uploadedByEmail: string;
  onProgress?: (percent: number) => void;
}

export async function uploadProfileDocumentToFirebase(
  options: UploadDocumentOptions
): Promise<ProfileDocumentRecord> {
  const { profileId, role, documentType, file, uploadedByName, uploadedByEmail, onProgress } = options;
  
  const sanitizedFileName = file.name.replace(/\s+/g, "_").replace(/[^A-Za-z0-9._-]/g, "_");
  const timestamp = Date.now();
  const storagePath = `profile_documents/${profileId}/${role}/${documentType}/${timestamp}_${sanitizedFileName}`;
  
  const storageRef = ref(firebaseStorage, storagePath);
  
  // Upload file with progress tracking
  const uploadTask = uploadBytesResumable(storageRef, file);
  
  return new Promise<ProfileDocumentRecord>((resolve, reject) => {
    uploadTask.on(
      "state_changed",
      (snapshot: UploadTaskSnapshot) => {
        const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        if (onProgress) {
          onProgress(progress);
        }
      },
      (error: StorageError) => {
        reject(new Error(`Upload failed: ${error.message}`));
      },
      async () => {
        try {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          const now = new Date().toISOString();
          
          const documentRecord = {
            profileId,
            role,
            documentType,
            fileName: file.name,
            contentType: file.type || "application/octet-stream",
            sizeBytes: file.size,
            downloadUrl,
            storagePath,
            uploadedByName,
            uploadedByEmail,
            uploadedAt: now,
            updatedAt: now
          };
          
          // Save metadata to Firestore
          const docRef = await addDoc(
            collection(firestoreDatabase, DOCUMENTS_COLLECTION, profileId, "documents"),
            documentRecord
          );
          
          if (onProgress) {
            onProgress(100);
          }
          
          resolve({
            id: docRef.id,
            ...documentRecord
          } as ProfileDocumentRecord);
        } catch (error) {
          reject(new Error("Failed to save document metadata."));
        }
      }
    );
  });
}

export async function listProfileDocumentsFromFirebase(profileId: string): Promise<ProfileDocumentRecord[]> {
  try {
    const q = query(
      collection(firestoreDatabase, DOCUMENTS_COLLECTION, profileId, "documents"),
      orderBy("uploadedAt", "desc")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as ProfileDocumentRecord));
  } catch {
    return [];
  }
}

export async function getProfileDocumentDownloadUrl(storagePath: string): Promise<string> {
  const storageRef = ref(firebaseStorage, storagePath);
  return await getDownloadURL(storageRef);
}

export async function deleteProfileDocument(profileId: string, document: ProfileDocumentRecord): Promise<void> {
  try {
    const storageRef = ref(firebaseStorage, document.storagePath);
    await deleteObject(storageRef);
  } catch {
    // Storage delete failed, continue to remove metadata
  }
  
  await deleteDoc(doc(firestoreDatabase, DOCUMENTS_COLLECTION, profileId, "documents", document.id));
}
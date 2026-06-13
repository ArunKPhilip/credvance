import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

const defaultFirebaseConfig = {
  apiKey: "AIzaSyC1kaDK05QFvEyAyaLa2FbU0odPLPtFe4M",
  authDomain: "credvance.firebaseapp.com",
  projectId: "credvance",
  storageBucket: "credvance.firebasestorage.app",
  messagingSenderId: "321227836439",
  appId: "1:321227836439:web:616abb9f515ce686a8e052",
  measurementId: "G-Z300N4FWHQ"
};

const viteEnv = (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env;

function readViteEnv(key: string, fallback: string): string {
  const value = viteEnv[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

const firebaseConfig = {
  apiKey: readViteEnv("VITE_FIREBASE_API_KEY", defaultFirebaseConfig.apiKey),
  authDomain: readViteEnv("VITE_FIREBASE_AUTH_DOMAIN", defaultFirebaseConfig.authDomain),
  projectId: readViteEnv("VITE_FIREBASE_PROJECT_ID", defaultFirebaseConfig.projectId),
  storageBucket: readViteEnv("VITE_FIREBASE_STORAGE_BUCKET", defaultFirebaseConfig.storageBucket),
  messagingSenderId: readViteEnv("VITE_FIREBASE_MESSAGING_SENDER_ID", defaultFirebaseConfig.messagingSenderId),
  appId: readViteEnv("VITE_FIREBASE_APP_ID", defaultFirebaseConfig.appId),
  measurementId: readViteEnv("VITE_FIREBASE_MEASUREMENT_ID", defaultFirebaseConfig.measurementId)
};

export const firebaseApp: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth: Auth = getAuth(firebaseApp);
export const firestoreDatabase: Firestore = getFirestore(firebaseApp);
export const firebaseStorage: FirebaseStorage = getStorage(firebaseApp);

export async function initializeFirebaseAnalytics(): Promise<void> {
  try {
    const analyticsModule = await import("firebase/analytics");
    const supported = await analyticsModule.isSupported();
    if (supported) {
      analyticsModule.getAnalytics(firebaseApp);
    }
  } catch {
    // Keep startup resilient if analytics is blocked or unsupported.
  }
}

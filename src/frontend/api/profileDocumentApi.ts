import type { ProfileDocumentRecord, ProfileDocumentType } from "../types";
import {
  uploadProfileDocumentToFirebase,
  listProfileDocumentsFromFirebase,
  getProfileDocumentDownloadUrl,
  deleteProfileDocument,
  type UploadDocumentOptions
} from "./firebaseService";

export async function listProfileDocuments(profileId: string): Promise<ProfileDocumentRecord[]> {
  return await listProfileDocumentsFromFirebase(profileId);
}

export async function downloadProfileDocument(document: ProfileDocumentRecord): Promise<void> {
  window.open(document.downloadUrl, "_blank");
}

export async function viewProfileDocument(document: ProfileDocumentRecord): Promise<void> {
  window.open(document.downloadUrl, "_blank");
}

export type UploadProfileDocumentOptions = {
  profileId: string;
  role: string;
  documentType: ProfileDocumentType;
  file: File;
  uploadedByName: string;
  uploadedByEmail: string;
  token?: string;
  onProgress?: (percent: number) => void;
};

export async function uploadProfileDocument(
  ...args: any[]
): Promise<ProfileDocumentRecord> {
  if (args.length === 1 && typeof args[0] === "object" && args[0] !== null) {
    // Called with object argument
    const arg = args[0] as UploadProfileDocumentOptions;
    const uploadOpts: UploadDocumentOptions = {
      profileId: arg.profileId,
      role: arg.role,
      documentType: arg.documentType,
      file: arg.file,
      uploadedByName: arg.uploadedByName,
      uploadedByEmail: arg.uploadedByEmail
    };
    if (arg.onProgress) {
      uploadOpts.onProgress = arg.onProgress;
    }
    return await uploadProfileDocumentToFirebase(uploadOpts);
  }

  // Called with positional arguments
  const uploadOpts: UploadDocumentOptions = {
    profileId: args[0],
    role: args[1],
    documentType: args[2] as ProfileDocumentType,
    file: args[3] as File,
    uploadedByName: args[4],
    uploadedByEmail: args[5]
  };
  if (args[7]) {
    uploadOpts.onProgress = args[7];
  }
  return await uploadProfileDocumentToFirebase(uploadOpts);
}

export default listProfileDocuments;
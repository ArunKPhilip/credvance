import crypto from "node:crypto";
import { Router, type RequestHandler } from "express";
import multer from "multer";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import type { Storage } from "firebase-admin/storage";
import type { EnvironmentConfiguration } from "../../../config/env.js";
import { ApplicationError } from "../../../domain/shared/applicationError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const MAX_DOCUMENT_UPLOAD_BYTES = 12 * 1024 * 1024;

const allowedMimeTypes = new Set<string>(["application/pdf", "image/png", "image/jpeg"]);
const allowedRoleValues = new Set<string>(["lender", "requestor"]);
const allowedDocumentTypes = new Set<string>([
  "PAN_CARD",
  "GST_CERTIFICATE",
  "BANK_STATEMENT",
  "INCORPORATION_CERTIFICATE",
  "FINANCIAL_STATEMENT",
  "KYC_ADDRESS_PROOF",
  "BOARD_RESOLUTION",
  "LOAN_STATEMENT"
]);

function sanitizeFileName(fileName: string): string {
  const collapsedWhitespace = fileName.trim().replace(/\s+/g, "_");
  return collapsedWhitespace.replace(/[^A-Za-z0-9._-]/g, "_");
}

function readBearerToken(authorizationHeader: string | undefined): string {
  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    throw new ApplicationError("Authentication is required for document upload.", "UNAUTHORIZED", 401);
  }

  const token = authorizationHeader.slice(7).trim();

  if (!token) {
    throw new ApplicationError("Authentication is required for document upload.", "UNAUTHORIZED", 401);
  }

  return token;
}

function readStringField(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApplicationError(`Missing required field: ${fieldName}.`, "VALIDATION_ERROR", 400);
  }

  return value.trim();
}

function createMultipartUploadMiddleware(): RequestHandler {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: MAX_DOCUMENT_UPLOAD_BYTES,
      files: 1
    },
    fileFilter: (_request, file, callback) => {
      if (!allowedMimeTypes.has(file.mimetype)) {
        callback(
          new ApplicationError(
            "Unsupported file type. Upload PDF, PNG, or JPG documents only.",
            "UNSUPPORTED_FILE_TYPE",
            400
          )
        );
        return;
      }

      callback(null, true);
    }
  });

  return (request, response, next) => {
    upload.single("file")(request, response, (error: unknown) => {
      if (!error) {
        next();
        return;
      }

      if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
        next(new ApplicationError("Document exceeds 12MB limit.", "FILE_TOO_LARGE", 400));
        return;
      }

      if (error instanceof ApplicationError) {
        next(error);
        return;
      }

      next(new ApplicationError("Unable to process document upload.", "UPLOAD_PROCESSING_FAILED", 400));
    });
  };
}

export function createProfileDocumentRoutes(
  firestore: Firestore,
  firebaseAuthClient: Auth,
  firebaseStorageClient: Storage,
  environment: EnvironmentConfiguration
): Router {
  const router = Router();

  router.post(
    "/api/v1/profile-documents/upload",
    createMultipartUploadMiddleware(),
    asyncHandler(async (request, response) => {
      const authToken = readBearerToken(request.header("authorization"));

      let decodedTokenUid = "";
      try {
        const decodedToken = await firebaseAuthClient.verifyIdToken(authToken);
        decodedTokenUid = decodedToken.uid;
      } catch {
        throw new ApplicationError("Authentication is invalid or expired.", "UNAUTHORIZED", 401);
      }

      const profileId = readStringField(request.body.profileId, "profileId");
      const role = readStringField(request.body.role, "role");
      const documentType = readStringField(request.body.documentType, "documentType");
      const uploadedByName = readStringField(request.body.uploadedByName, "uploadedByName");
      const uploadedByEmail = readStringField(request.body.uploadedByEmail, "uploadedByEmail");

      if (!allowedRoleValues.has(role)) {
        throw new ApplicationError("Invalid role for document upload.", "VALIDATION_ERROR", 400);
      }

      if (!allowedDocumentTypes.has(documentType)) {
        throw new ApplicationError("Invalid document type for upload.", "VALIDATION_ERROR", 400);
      }

      if (decodedTokenUid !== profileId) {
        throw new ApplicationError(
          "You can upload documents only for your own profile.",
          "FORBIDDEN",
          403
        );
      }

      if (!request.file || !request.file.buffer || request.file.size <= 0) {
        throw new ApplicationError("Select a document file before uploading.", "VALIDATION_ERROR", 400);
      }

      const nowIso = new Date().toISOString();
      const sanitizedFileName = sanitizeFileName(request.file.originalname || "document");
      const storagePath = `profile_documents/${profileId}/${role}/${documentType}/${Date.now()}_${sanitizedFileName}`;

      const configuredBucketName = (environment.FIREBASE_STORAGE_BUCKET || "").trim();
      const inferredBucketName = environment.FIREBASE_PROJECT_ID
        ? `${environment.FIREBASE_PROJECT_ID}.firebasestorage.app`
        : "";
      const storageBucketName = configuredBucketName || inferredBucketName;

      if (!storageBucketName) {
        throw new ApplicationError("Storage bucket is not configured.", "STORAGE_BUCKET_NOT_CONFIGURED", 500);
      }

      const downloadToken = crypto.randomUUID();
      const storageBucket = firebaseStorageClient.bucket(storageBucketName);
      const storageFile = storageBucket.file(storagePath);

      try {
        await storageFile.save(request.file.buffer, {
          resumable: false,
          contentType: request.file.mimetype || "application/octet-stream",
          metadata: {
            cacheControl: "private, max-age=0, no-transform",
            metadata: {
              firebaseStorageDownloadTokens: downloadToken
            }
          }
        });
      } catch {
        throw new ApplicationError(
          "Document storage is currently unavailable. Please retry after checking Firebase Storage setup.",
          "STORAGE_UNAVAILABLE",
          503
        );
      }

      const encodedStoragePath = encodeURIComponent(storagePath);
      const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${storageBucketName}/o/${encodedStoragePath}?alt=media&token=${downloadToken}`;

      const documentPayload = {
        profileId,
        role,
        documentType,
        fileName: request.file.originalname,
        contentType: request.file.mimetype || "application/octet-stream",
        sizeBytes: request.file.size,
        downloadUrl,
        storagePath,
        uploadedByName,
        uploadedByEmail,
        uploadedAt: nowIso,
        updatedAt: nowIso
      };

      const createdDocumentReference = await firestore
        .collection("profile_documents")
        .doc(profileId)
        .collection("documents")
        .add(documentPayload);

      response.status(201).json({
        document: {
          id: createdDocumentReference.id,
          ...documentPayload
        }
      });
    })
  );

  return router;
}

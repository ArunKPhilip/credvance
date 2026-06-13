import { z } from "zod";

const fullNamePattern = /^[\p{L}\s.'-]+$/u;
const phonePattern = /^[0-9+()\-\s]{8,24}$/;
const messagePattern = /^[\p{L}\p{N}\s.,'"()\-@&:/+#%!?]+$/u;

export const roleSchema = z.enum(["borrower", "lender", "nbfc-bank", "other"]);

export const loanAmountSchema = z.enum([
  "5L_25L",
  "25L_1CR",
  "1CR_5CR",
  "5CR_PLUS",
  "NOT_APPLICABLE"
]);

export const createIntakeSubmissionSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120).regex(fullNamePattern, "Full name contains invalid characters."),
    phone: z.string().trim().regex(phonePattern, "Phone number format is invalid."),
    email: z.string().trim().email().max(254),
    role: roleSchema,
    loanAmountRange: loanAmountSchema.optional(),
    message: z.string().trim().min(10).max(1200).regex(messagePattern, "Message contains invalid characters."),
    consent: z.literal(true, { errorMap: () => ({ message: "Consent must be accepted." }) }),
    website: z.string().trim().max(0).optional().default("")
  })
  .superRefine((payload, context) => {
    if (payload.role === "borrower" && !payload.loanAmountRange) {
      context.addIssue({
        path: ["loanAmountRange"],
        code: z.ZodIssueCode.custom,
        message: "Loan amount range is required for borrower requests."
      });
    }

    if (
      payload.role !== "borrower" &&
      payload.loanAmountRange &&
      payload.loanAmountRange !== "NOT_APPLICABLE"
    ) {
      context.addIssue({
        path: ["loanAmountRange"],
        code: z.ZodIssueCode.custom,
        message: "Loan amount must be NOT_APPLICABLE for non-borrower requests."
      });
    }
  });

export const listSubmissionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(100000).default(0)
});

export const anonymizeSubmissionParamsSchema = z.object({
  submissionId: z.string().uuid()
});

export type CreateIntakeSubmissionRequestBody = z.infer<typeof createIntakeSubmissionSchema>;
export type ListSubmissionsQuery = z.infer<typeof listSubmissionsQuerySchema>;
export type AnonymizeSubmissionParams = z.infer<typeof anonymizeSubmissionParamsSchema>;

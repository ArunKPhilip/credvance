import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodTypeAny } from "zod";
import { ApplicationError } from "../../../domain/shared/applicationError.js";

export function validateBody(schema: ZodTypeAny): RequestHandler {
  return (request: Request, _response: Response, next: NextFunction) => {
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((issue) => issue.message).join("; ");
      next(new ApplicationError(`Invalid request body: ${message}`, "VALIDATION_ERROR", 400));
      return;
    }

    request.body = parsed.data;
    next();
  };
}

export function validateQuery<T extends ZodTypeAny>(schema: T): RequestHandler {
  return (request: Request, _response: Response, next: NextFunction) => {
    const parsed = schema.safeParse(request.query);
    if (!parsed.success) {
      const message = parsed.error.issues.map((issue) => issue.message).join("; ");
      next(new ApplicationError(`Invalid query parameters: ${message}`, "VALIDATION_ERROR", 400));
      return;
    }

    request.query = parsed.data;
    next();
  };
}

export function validateParams<T extends ZodTypeAny>(schema: T): RequestHandler {
  return (request: Request, _response: Response, next: NextFunction) => {
    const parsed = schema.safeParse(request.params);
    if (!parsed.success) {
      const message = parsed.error.issues.map((issue) => issue.message).join("; ");
      next(new ApplicationError(`Invalid route parameters: ${message}`, "VALIDATION_ERROR", 400));
      return;
    }

    request.params = parsed.data;
    next();
  };
}

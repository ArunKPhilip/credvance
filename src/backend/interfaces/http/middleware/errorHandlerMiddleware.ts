import type { ErrorRequestHandler, RequestHandler } from "express";
import type { ApplicationLogger } from "../../../infrastructure/logging/logger.js";
import { ApplicationError } from "../../../domain/shared/applicationError.js";

export const notFoundMiddleware: RequestHandler = (request, response) => {
  const requestId = response.locals.requestId as string | undefined;
  response.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `No route found for ${request.method} ${request.path}`,
      requestId
    }
  });
};

export function errorHandlerMiddleware(logger: ApplicationLogger): ErrorRequestHandler {
  return (error, _request, response, _next) => {
    const requestId = response.locals.requestId as string | undefined;
    const isApplicationError = error instanceof ApplicationError;

    const httpStatusCode = isApplicationError ? error.httpStatusCode : 500;
    const errorCode = isApplicationError ? error.errorCode : "INTERNAL_SERVER_ERROR";
    const message = isApplicationError
      ? error.message
      : "An unexpected server error occurred. Please retry later.";

    if (!isApplicationError) {
      logger.error(
        {
          error,
          requestId
        },
        "Unhandled internal server error."
      );
    } else {
      logger.warn(
        {
          errorCode,
          requestId,
          message: error.message
        },
        "Handled application error."
      );
    }

    const payload: any = {
      error: {
        code: errorCode,
        message,
        requestId
      }
    };

    if (!isApplicationError && process.env.NODE_ENV === "development") {
      // expose stack for local debugging
      payload.error.stack = (error && error.stack) || String(error);
    }

    response.status(httpStatusCode).json(payload);
  };
}

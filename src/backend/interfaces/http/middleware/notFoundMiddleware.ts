import type { RequestHandler } from "express";

export const notFoundMiddleware: RequestHandler = (request, response) => {
  const requestId = response.locals.requestId as string | undefined;
  response.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `No route found for ${request.method} ${request.originalUrl ?? request.path}`,
      requestId
    }
  });
};


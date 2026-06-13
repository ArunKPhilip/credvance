export class ApplicationError extends Error {
  public readonly httpStatusCode: number;
  public readonly errorCode: string;
  public readonly isOperational: boolean;

  constructor(message: string, errorCode: string, httpStatusCode: number, isOperational = true) {
    super(message);
    this.name = "ApplicationError";
    this.errorCode = errorCode;
    this.httpStatusCode = httpStatusCode;
    this.isOperational = isOperational;
  }
}

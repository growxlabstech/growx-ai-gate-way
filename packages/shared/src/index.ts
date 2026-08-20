export type ErrorCode = "VALIDATION" | "AUTHENTICATION" | "AUTHORIZATION" | "RATE_LIMIT" | "INTERNAL";

export class AppError extends Error {
  constructor(message: string, readonly code: ErrorCode, readonly statusCode: number, readonly details?: unknown) {
    super(message);
    this.name = new.target.name;
  }
}
export class ValidationError extends AppError { constructor(message = "Request validation failed", details?: unknown) { super(message, "VALIDATION", 400, details); } }
export class AuthenticationError extends AppError { constructor(message = "Authentication required") { super(message, "AUTHENTICATION", 401); } }
export class AuthorizationError extends AppError { constructor(message = "Insufficient permissions") { super(message, "AUTHORIZATION", 403); } }
export class RateLimitError extends AppError { constructor(message = "Rate limit exceeded") { super(message, "RATE_LIMIT", 429); } }
export class InternalError extends AppError { constructor(message = "Internal server error") { super(message, "INTERNAL", 500); } }

export function errorResponse(error: unknown, requestId: string): Response {
  const safe = error instanceof AppError ? error : new InternalError();
  return Response.json({ error: { code: safe.code, message: safe.message, requestId } }, { status: safe.statusCode });
}
export function createId(prefix: string): string { return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`; }

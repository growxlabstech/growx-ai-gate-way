export class PromptError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
    public readonly details?: Record<string, unknown> | undefined,
  ) {
    super(message);
    this.name = "PromptError";
  }
}

export class PromptValidationError extends PromptError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("PROMPT_VALIDATION_ERROR", message, 400, details);
    this.name = "PromptValidationError";
  }
}

export class PromptRenderError extends PromptError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("PROMPT_RENDER_ERROR", message, 400, details);
    this.name = "PromptRenderError";
  }
}

export class PromptNotFoundError extends PromptError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("PROMPT_NOT_FOUND", message, 404, details);
    this.name = "PromptNotFoundError";
  }
}

export class PromptReleaseError extends PromptError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("PROMPT_RELEASE_ERROR", message, 400, details);
    this.name = "PromptReleaseError";
  }
}

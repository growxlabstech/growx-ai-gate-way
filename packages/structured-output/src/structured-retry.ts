import type { StructuredOutputStatus } from './adapters/provider-structured-adapter.js';

export interface StructuredRetryPolicy {
  maxRetries: number;
  retryOnTruncation?: boolean;
}

export class StructuredRetryController {
  constructor(private policy: StructuredRetryPolicy) {}

  isRetryable(status: StructuredOutputStatus, attemptCount: number): boolean {
    if (attemptCount >= this.policy.maxRetries) return false;
    
    switch (status) {
      case 'refusal':
        return false;
      case 'invalid_json':
      case 'schema_invalid':
        return true;
      case 'truncated':
        return !!this.policy.retryOnTruncation;
      default:
        return false;
    }
  }

  nextAction(status: StructuredOutputStatus, attemptCount: number, availableRoutes: number): 'retry_same' | 'retry_fallback' | 'fail' {
    if (!this.isRetryable(status, attemptCount)) {
      return 'fail';
    }
    return availableRoutes > 1 ? 'retry_fallback' : 'retry_same';
  }
}

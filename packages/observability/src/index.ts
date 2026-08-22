import pino from "pino";

export interface TraceContext {
  requestId: string;
  correlationId: string;
  traceId?: string;
}

const GROWX_KEY_REGEX = /gx_(live|test)_key_[a-f0-9]{32}_[A-Za-z0-9_-]{20,}/g;

export function redactGrowXSecrets(text: string): string {
  return text.replace(GROWX_KEY_REGEX, "gx_$1_key_[REDACTED]");
}

export function maskApiKey(value: string): string {
  if (!value) return "••••••••";
  const match =
    /^gx_(live|test)_(key_[a-f0-9]{32})(?:_([A-Za-z0-9_-]+))?$/.exec(value);
  if (match) {
    const env = match[1];
    const keyId = match[2];
    return `gx_${env}_${keyId}_••••••••••••`;
  }
  if (value.startsWith("gx_live_") || value.startsWith("gx_test_")) {
    return value.slice(0, 16) + "••••••••";
  }
  return "••••••••";
}

export interface GatewayAuthMetrics {
  requestsTotal: number;
  authSuccessTotal: number;
  authFailureTotal: Record<string, number>;
  rateLimitTotal: number;
  permissionDeniedTotal: number;
  budgetDeniedTotal: number;
  cacheHitsTotal: number;
  cacheMissesTotal: number;
}

class GatewayMetricsCollector {
  private metrics: GatewayAuthMetrics = {
    requestsTotal: 0,
    authSuccessTotal: 0,
    authFailureTotal: {},
    rateLimitTotal: 0,
    permissionDeniedTotal: 0,
    budgetDeniedTotal: 0,
    cacheHitsTotal: 0,
    cacheMissesTotal: 0,
  };

  recordRequest(): void {
    this.metrics.requestsTotal++;
  }

  recordAuthSuccess(): void {
    this.metrics.authSuccessTotal++;
  }

  recordAuthFailure(code: string): void {
    this.metrics.authFailureTotal[code] =
      (this.metrics.authFailureTotal[code] ?? 0) + 1;
  }

  recordRateLimit(): void {
    this.metrics.rateLimitTotal++;
  }

  recordPermissionDenied(): void {
    this.metrics.permissionDeniedTotal++;
  }

  recordBudgetDenied(): void {
    this.metrics.budgetDeniedTotal++;
  }

  recordCacheHit(): void {
    this.metrics.cacheHitsTotal++;
  }

  recordCacheMiss(): void {
    this.metrics.cacheMissesTotal++;
  }

  getSnapshot(): Readonly<GatewayAuthMetrics> {
    return {
      ...this.metrics,
      authFailureTotal: { ...this.metrics.authFailureTotal },
    };
  }

  reset(): void {
    this.metrics = {
      requestsTotal: 0,
      authSuccessTotal: 0,
      authFailureTotal: {},
      rateLimitTotal: 0,
      permissionDeniedTotal: 0,
      budgetDeniedTotal: 0,
      cacheHitsTotal: 0,
      cacheMissesTotal: 0,
    };
  }
}

export const gatewayMetrics = new GatewayMetricsCollector();

export function createLogger(service: string, context?: Partial<TraceContext>) {
  return pino({
    name: service,
    level: process.env.LOG_LEVEL ?? "info",
    base: { service, ...context },
    redact: {
      censor: "[REDACTED]",
      paths: [
        "password",
        "*.password",
        "token",
        "*.token",
        "authorization",
        "*.authorization",
        "cookie",
        "*.cookie",
        "secret",
        "*.secret",
        "secretHash",
        "*.secretHash",
        "rawKey",
        "*.rawKey",
        "apiKey",
        "*.apiKey",
        "providerCredential",
        "*.providerCredential",
        "paymentSecret",
        "*.paymentSecret",
        "webhookSecret",
        "*.webhookSecret",
      ],
    },
  });
}

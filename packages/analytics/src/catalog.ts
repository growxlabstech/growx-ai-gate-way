/**
 * Canonical Metric Catalog for GrowX AI Analytics & Observability.
 * Standardizes definitions, aggregation rules, dimensions, and customer visibility.
 */

export type MetricUnit =
  "count" | "tokens" | "milliseconds" | "ratio" | "rate" | "percentage";
export type MetricType = "counter" | "gauge" | "histogram" | "derived";
export type MetricDimension =
  | "organizationId"
  | "workspaceId"
  | "apiKeyId"
  | "canonicalModelId"
  | "providerId"
  | "routeId"
  | "status"
  | "stream"
  | "errorCode";

export interface MetricDefinition {
  name: string;
  description: string;
  unit: MetricUnit;
  type: MetricType;
  customerVisible: boolean;
  supportedDimensions: MetricDimension[];
}

export const METRIC_CATALOG: Record<string, MetricDefinition> = {
  requests_total: {
    name: "requests_total",
    description: "Total number of accepted customer gateway requests",
    unit: "count",
    type: "counter",
    customerVisible: true,
    supportedDimensions: [
      "organizationId",
      "workspaceId",
      "apiKeyId",
      "canonicalModelId",
    ],
  },
  requests_completed: {
    name: "requests_completed",
    description: "Requests that finished successfully with customer output",
    unit: "count",
    type: "counter",
    customerVisible: true,
    supportedDimensions: [
      "organizationId",
      "workspaceId",
      "apiKeyId",
      "canonicalModelId",
    ],
  },
  requests_failed: {
    name: "requests_failed",
    description: "Requests that resulted in an error response to customer",
    unit: "count",
    type: "counter",
    customerVisible: true,
    supportedDimensions: [
      "organizationId",
      "workspaceId",
      "apiKeyId",
      "canonicalModelId",
      "errorCode",
    ],
  },
  requests_cancelled: {
    name: "requests_cancelled",
    description:
      "Requests aborted or cancelled by client before full completion",
    unit: "count",
    type: "counter",
    customerVisible: true,
    supportedDimensions: [
      "organizationId",
      "workspaceId",
      "apiKeyId",
      "canonicalModelId",
    ],
  },
  requests_rejected: {
    name: "requests_rejected",
    description:
      "Requests rejected pre-execution due to quota or policy denial",
    unit: "count",
    type: "counter",
    customerVisible: true,
    supportedDimensions: [
      "organizationId",
      "workspaceId",
      "apiKeyId",
      "canonicalModelId",
    ],
  },
  input_tokens: {
    name: "input_tokens",
    description: "Logical prompt tokens consumed for successful request",
    unit: "tokens",
    type: "counter",
    customerVisible: true,
    supportedDimensions: [
      "organizationId",
      "workspaceId",
      "apiKeyId",
      "canonicalModelId",
    ],
  },
  output_tokens: {
    name: "output_tokens",
    description: "Logical completion tokens generated for customer",
    unit: "tokens",
    type: "counter",
    customerVisible: true,
    supportedDimensions: [
      "organizationId",
      "workspaceId",
      "apiKeyId",
      "canonicalModelId",
    ],
  },
  total_tokens: {
    name: "total_tokens",
    description: "Total logical tokens (input + output)",
    unit: "tokens",
    type: "counter",
    customerVisible: true,
    supportedDimensions: [
      "organizationId",
      "workspaceId",
      "apiKeyId",
      "canonicalModelId",
    ],
  },
  cached_input_tokens: {
    name: "cached_input_tokens",
    description: "Cached prompt tokens reported by provider",
    unit: "tokens",
    type: "counter",
    customerVisible: true,
    supportedDimensions: [
      "organizationId",
      "workspaceId",
      "apiKeyId",
      "canonicalModelId",
    ],
  },
  reasoning_tokens: {
    name: "reasoning_tokens",
    description: "Internal reasoning tokens consumed by thinking models",
    unit: "tokens",
    type: "counter",
    customerVisible: true,
    supportedDimensions: [
      "organizationId",
      "workspaceId",
      "apiKeyId",
      "canonicalModelId",
    ],
  },
  provider_input_tokens: {
    name: "provider_input_tokens",
    description: "Total input tokens across all provider execution attempts",
    unit: "tokens",
    type: "counter",
    customerVisible: false,
    supportedDimensions: ["providerId", "routeId", "canonicalModelId"],
  },
  provider_output_tokens: {
    name: "provider_output_tokens",
    description: "Total output tokens across all provider execution attempts",
    unit: "tokens",
    type: "counter",
    customerVisible: false,
    supportedDimensions: ["providerId", "routeId", "canonicalModelId"],
  },
  provider_total_tokens: {
    name: "provider_total_tokens",
    description:
      "Total tokens consumed across all attempts including retries and fallbacks",
    unit: "tokens",
    type: "counter",
    customerVisible: false,
    supportedDimensions: ["providerId", "routeId", "canonicalModelId"],
  },
  latency_p50: {
    name: "latency_p50",
    description: "50th percentile total gateway duration in milliseconds",
    unit: "milliseconds",
    type: "histogram",
    customerVisible: true,
    supportedDimensions: ["organizationId", "workspaceId", "canonicalModelId"],
  },
  latency_p95: {
    name: "latency_p95",
    description: "95th percentile total gateway duration in milliseconds",
    unit: "milliseconds",
    type: "histogram",
    customerVisible: true,
    supportedDimensions: ["organizationId", "workspaceId", "canonicalModelId"],
  },
  latency_p99: {
    name: "latency_p99",
    description: "99th percentile total gateway duration in milliseconds",
    unit: "milliseconds",
    type: "histogram",
    customerVisible: true,
    supportedDimensions: ["organizationId", "workspaceId", "canonicalModelId"],
  },
  ttft_p50: {
    name: "ttft_p50",
    description: "50th percentile time to first token in milliseconds",
    unit: "milliseconds",
    type: "histogram",
    customerVisible: true,
    supportedDimensions: ["organizationId", "workspaceId", "canonicalModelId"],
  },
  ttft_p95: {
    name: "ttft_p95",
    description: "95th percentile time to first token in milliseconds",
    unit: "milliseconds",
    type: "histogram",
    customerVisible: true,
    supportedDimensions: ["organizationId", "workspaceId", "canonicalModelId"],
  },
  ttft_p99: {
    name: "ttft_p99",
    description: "99th percentile time to first token in milliseconds",
    unit: "milliseconds",
    type: "histogram",
    customerVisible: true,
    supportedDimensions: ["organizationId", "workspaceId", "canonicalModelId"],
  },
  retry_rate: {
    name: "retry_rate",
    description: "Proportion of requests requiring at least one retry attempt",
    unit: "rate",
    type: "derived",
    customerVisible: true,
    supportedDimensions: ["organizationId", "workspaceId", "canonicalModelId"],
  },
  fallback_rate: {
    name: "fallback_rate",
    description: "Proportion of requests falling back to a secondary provider",
    unit: "rate",
    type: "derived",
    customerVisible: true,
    supportedDimensions: ["organizationId", "workspaceId", "canonicalModelId"],
  },
  recovery_rate: {
    name: "recovery_rate",
    description:
      "Proportion of initially failed requests rescued by retry or fallback",
    unit: "rate",
    type: "derived",
    customerVisible: false,
    supportedDimensions: ["providerId", "canonicalModelId"],
  },
  retry_amplification: {
    name: "retry_amplification",
    description:
      "Ratio of total provider attempts to logical customer requests",
    unit: "ratio",
    type: "derived",
    customerVisible: false,
    supportedDimensions: ["providerId", "canonicalModelId"],
  },
  success_rate: {
    name: "success_rate",
    description: "Percentage of requests successfully completed",
    unit: "percentage",
    type: "derived",
    customerVisible: true,
    supportedDimensions: [
      "organizationId",
      "workspaceId",
      "apiKeyId",
      "canonicalModelId",
    ],
  },
  error_rate: {
    name: "error_rate",
    description: "Percentage of requests that failed",
    unit: "percentage",
    type: "derived",
    customerVisible: true,
    supportedDimensions: [
      "organizationId",
      "workspaceId",
      "apiKeyId",
      "canonicalModelId",
    ],
  },
};

export function isValidMetric(
  metricName: string,
  customerOnly = false,
): boolean {
  const metric = METRIC_CATALOG[metricName];
  if (!metric) return false;
  if (customerOnly && !metric.customerVisible) return false;
  return true;
}

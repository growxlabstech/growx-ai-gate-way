import { z } from "zod";
export type {
  EmailProvider,
  FeatureFlagProvider,
  HealthAwareConnection,
  ObjectStorage,
  PaymentProvider,
  RedisConnectionFactory,
} from "./integrations.js";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);
const optionalSecret = z.preprocess(
  emptyToUndefined,
  z.string().min(1).optional(),
);
const optionalUrl = z.preprocess(emptyToUndefined, z.url().optional());
export const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  DATABASE_URL: z.url().startsWith("postgresql://"),
  REDIS_URL: z.url().startsWith("redis://"),
  SERVICE_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  API_KEY_PEPPER: z
    .string()
    .min(32)
    .default("growx_api_key_default_pepper_min_32_bytes_long!"),
  API_KEY_MAX_ACTIVE_PER_WORKSPACE: z.coerce
    .number()
    .int()
    .min(1)
    .max(1000)
    .default(50),
  API_KEY_DEFAULT_EXPIRY_DAYS: z.coerce
    .number()
    .int()
    .min(0)
    .max(3650)
    .default(365),
  API_KEY_MAX_EXPIRY_DAYS: z.coerce
    .number()
    .int()
    .min(1)
    .max(3650)
    .default(730),
  GOOGLE_CLIENT_ID: optionalSecret,
  GOOGLE_CLIENT_SECRET: optionalSecret,
  GITHUB_CLIENT_ID: optionalSecret,
  GITHUB_CLIENT_SECRET: optionalSecret,
  NOTIFICATION_SERVICE_URL: z.url().default("http://localhost:4013"),
  R2_ACCOUNT_ID: optionalSecret,
  R2_ACCESS_KEY_ID: optionalSecret,
  R2_SECRET_ACCESS_KEY: optionalSecret,
  R2_BUCKET: optionalSecret,
  RESEND_API_KEY: optionalSecret,
  RESEND_FROM_EMAIL: z.preprocess(
    emptyToUndefined,
    z.string().email().optional(),
  ),
  STRIPE_SECRET_KEY: optionalSecret,
  RAZORPAY_KEY_ID: optionalSecret,
  RAZORPAY_KEY_SECRET: optionalSecret,
  OTEL_EXPORTER_OTLP_ENDPOINT: optionalUrl,
  SENTRY_DSN: optionalUrl,
  AXIOM_TOKEN: optionalSecret,
  GATEWAY_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(600_000)
    .default(120_000),
  GATEWAY_FIRST_TOKEN_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(120_000)
    .default(30_000),
  GATEWAY_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(3),
  PROVIDER_HEALTH_INTERVAL_SECONDS: z.coerce
    .number()
    .int()
    .min(10)
    .max(3600)
    .default(60),
  OPENAI_API_KEY: optionalSecret,
  ANTHROPIC_API_KEY: optionalSecret,
  GOOGLE_GENERATIVE_AI_API_KEY: optionalSecret,
  AI_GATEWAY_BASE_URL: optionalUrl,
  ROUTING_MODE: z.enum(["NORMAL", "DEGRADED", "EMERGENCY"]).default("NORMAL"),
  ROUTING_COST_WEIGHT: z.coerce.number().min(0).max(1).default(0.25),
  ROUTING_LATENCY_WEIGHT: z.coerce.number().min(0).max(1).default(0.25),
  ROUTING_RELIABILITY_WEIGHT: z.coerce.number().min(0).max(1).default(0.25),
  ROUTING_CAPACITY_WEIGHT: z.coerce.number().min(0).max(1).default(0.15),
  ROUTING_PREFERENCE_WEIGHT: z.coerce.number().min(0).max(1).default(0.1),
  CIRCUIT_FAILURE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.5),
  CIRCUIT_MINIMUM_REQUESTS: z.coerce.number().int().min(1).default(20),
  CIRCUIT_OPEN_DURATION_MS: z.coerce.number().int().min(1000).default(30_000),
  CIRCUIT_HALF_OPEN_PROBES: z.coerce.number().int().min(1).default(5),
  PROVIDER_CAPACITY_SAFETY_MARGIN: z.coerce
    .number()
    .min(0.1)
    .max(1)
    .default(0.8),
  PROMPT_CACHE_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(1)
    .max(86400)
    .default(3600),
  DEDUPLICATION_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(10000)
    .default(3000),
  CLICKHOUSE_URL: optionalUrl,
  PUBLIC_APP_URL: optionalUrl,
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  TRUST_PROXY_TLS: z.enum(["true", "false"]).default("false"),
  MAX_REQUEST_BODY_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .max(10_000_000)
    .default(1_048_576),
  WEBHOOK_MAX_RESPONSE_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .max(1_000_000)
    .default(65_536),
  WEBHOOK_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
  EXPORT_MAX_ROWS: z.coerce
    .number()
    .int()
    .min(1)
    .max(10_000_000)
    .default(100_000),
});
export type Environment = z.infer<typeof environmentSchema>;
export function loadEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): Environment {
  const environment = environmentSchema.parse(source);
  assertProductionEnvironment(environment);
  return environment;
}
export function assertProductionEnvironment(environment: Environment): void {
  if (environment.NODE_ENV !== "production") return;
  const failures: string[] = [];
  if (!environment.PUBLIC_APP_URL?.startsWith("https://"))
    failures.push("PUBLIC_APP_URL must use HTTPS");
  if (environment.TRUST_PROXY_TLS !== "true")
    failures.push("TRUST_PROXY_TLS must be true");
  const origins =
    environment.CORS_ALLOWED_ORIGINS?.split(",")
      .map((value) => value.trim())
      .filter(Boolean) ?? [];
  if (
    origins.length === 0 ||
    origins.some((origin) => origin === "*" || !origin.startsWith("https://"))
  )
    failures.push("CORS_ALLOWED_ORIGINS must be an explicit HTTPS allowlist");
  if (
    environment.DATABASE_URL.includes("localhost") ||
    environment.REDIS_URL.includes("localhost")
  )
    failures.push("Production data stores cannot use localhost");
  if (!environment.OTEL_EXPORTER_OTLP_ENDPOINT)
    failures.push("OTEL_EXPORTER_OTLP_ENDPOINT is required");
  if (
    !environment.API_KEY_PEPPER ||
    environment.API_KEY_PEPPER ===
      "growx_api_key_default_pepper_min_32_bytes_long!" ||
    Buffer.byteLength(environment.API_KEY_PEPPER) < 32
  ) {
    failures.push(
      "API_KEY_PEPPER must be an explicit secret of at least 32 bytes in production",
    );
  }
  if (failures.length)
    throw new Error(`Unsafe production configuration: ${failures.join("; ")}`);
}

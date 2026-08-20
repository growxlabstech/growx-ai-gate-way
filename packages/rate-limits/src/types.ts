export type QuotaDimension =
  | "requests"
  | "input_tokens"
  | "output_tokens"
  | "total_tokens"
  | "concurrent_requests"
  | "concurrent_streams";

export type QuotaScopeType =
  | "global"
  | "organization"
  | "workspace"
  | "api_key"
  | "provider"
  | "provider_credential"
  | "provider_route";

export type CapacityState = "available" | "busy" | "near_limit" | "exhausted";

export interface QuotaLimit {
  id?: string;
  scopeType: QuotaScopeType;
  scopeId: string;
  dimension: QuotaDimension;
  windowSeconds: number; // 60 for RPM/TPM, 0 for concurrency
  limit: number;
  burst?: number | undefined;
  hard: boolean; // true = hard deny (429/503), false = soft (warning / downscoring)
  enabled: boolean;
  source?: "configured" | "plan" | "api_key" | "default" | undefined;
  version?: number | undefined;
  effectiveFrom?: Date | null | undefined;
  effectiveTo?: Date | null | undefined;
}

export type QuotaDenialCode =
  | "rate_limit_exceeded"
  | "token_rate_limit_exceeded"
  | "concurrency_limit_exceeded"
  | "provider_capacity_exhausted"
  | "global_overload";

export interface QuotaDecision {
  allowed: boolean;
  denialCode?: QuotaDenialCode | undefined;
  reason?: string | undefined;
  blockingScope?: { scopeType: QuotaScopeType; scopeId: string } | undefined;
  blockingDimension?: QuotaDimension | undefined;
  limit?: number | undefined;
  used?: number | undefined;
  reserved?: number | undefined;
  remaining?: number | undefined;
  resetAt?: Date | undefined;
  retryAfterSeconds?: number | undefined;
  reservationId?: string | undefined;
  headers?: Record<string, string> | undefined;
}

export interface ReservedScopeAmount {
  scopeType: QuotaScopeType;
  scopeId: string;
  dimension: QuotaDimension;
  reservedAmount: number;
  windowSeconds: number;
  counterKey: string;
}

export interface QuotaReservation {
  reservationId: string;
  requestId: string;
  scopes: ReservedScopeAmount[];
  reservedTokens: number;
  reservedRequests: number;
  holdsConcurrency: boolean;
  holdsStreamConcurrency: boolean;
  concurrencyKeys: string[];
  expiresAt: Date;
  status: "active" | "finalized" | "cancelled" | "expired";
  createdAt: Date;
}

export interface TokenEstimate {
  inputTokens: number;
  estimatedOutputReservation: number;
  totalEstimatedTokens: number;
  source: "heuristic" | "tokenizer" | "explicit_max_tokens";
}

export interface RouteCapacitySignal {
  routeId: string;
  providerId: string;
  headroom: number; // 0..1 (1.0 = full capacity, 0 = exhausted)
  saturation: number; // 0..1 (used / limit)
  state: CapacityState;
  estimatedRemainingRPM?: number | undefined;
  estimatedRemainingTPM?: number | undefined;
  activeConcurrency: number;
  concurrencyLimit: number;
  rpmLimit: number;
  tpmLimit: number;
  updatedAt: Date;
}

export interface CapacitySignalFeedback {
  routeId: string;
  providerId: string;
  is429?: boolean | undefined;
  remainingRequests?: number | undefined;
  remainingTokens?: number | undefined;
  retryAfterSeconds?: number | undefined;
  timestamp?: Date | undefined;
}

export interface AtomicReservationRequest {
  key: string;
  scopeType: QuotaScopeType;
  scopeId: string;
  dimension: QuotaDimension;
  amount: number;
  limit: number;
  windowSeconds: number;
  burst?: number | undefined;
  hard: boolean;
}

export interface AtomicReservationResult {
  allowed: boolean;
  blockingIndex?: number | undefined;
  blockingRequest?: AtomicReservationRequest | undefined;
  used?: number | undefined;
  remaining?: number | undefined;
  resetAt?: Date | undefined;
  retryAfterSeconds?: number | undefined;
}

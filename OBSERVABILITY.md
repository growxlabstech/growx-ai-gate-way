# GrowX AI Gateway — Production Observability Architecture

## 1. Structured Logging & Secret Redaction

All microservices and workers emit newline-delimited structured JSON using `@growx/observability` and Pino. Direct `console.log` is prohibited.

Every log entry automatically carries:

- `service`: Microservice or worker identifier (e.g. `gateway-service`, `usage-worker`).
- `requestId`: Canonical GrowX request identifier (`req_...`).
- `correlationId`: Distributed trace correlation ID.
- `traceId`: OpenTelemetry W3C trace ID.

### Secret Redaction Guarantee

The logger boundary automatically masks and redacts:

- Customer API Keys (`gx_live_...`, `gx_test_...` -> `gx_live_key_...••••••••`)
- Upstream Provider Secrets (`sk-...`, `Bearer ...`)
- User Session Tokens and Passwords
- Payment CVV/Secrets and Bank Account Information

---

## 2. Distributed Tracing & Metrics (OpenTelemetry)

OpenTelemetry is the canonical transport for distributed spans and telemetry:

- **`OTEL_EXPORTER_OTLP_ENDPOINT`**: Configured to stream OTLP/gRPC traces to the central telemetry collector.
- **Trace Path**: `Edge Load Balancer -> Gateway Service -> Policy Engine -> Router V2 -> Provider Adapter -> Usage Worker -> Credit Settlement`.

### Key Performance Counters & Metrics:

- `growx_gateway_requests_total`: Aggregated total inference completions.
- `growx_gateway_auth_success_total` & `growx_gateway_auth_failure_total`: Key auth validation metrics.
- `growx_gateway_ttft_milliseconds`: Time to first token for streaming responses (Target: P95 < 120ms).
- `growx_gateway_duration_milliseconds`: Total request round-trip latency.
- `growx_gateway_provider_circuit_state`: Status of provider circuit breakers (Closed, Half-Open, Open).
- `growx_gateway_cache_hits_total` & `growx_gateway_cache_misses_total`: Exact and semantic cache hit ratios.

---

## 3. Exception Tracking & Alerting Destinations

- **Sentry Integration**: Optional exception capture for unexpected fatal runtime bugs with sanitized stack traces and release version correlation.
- **Critical Alert Triggers**:
  1. Gateway 5xx Error Rate > 0.5% over 5 minutes.
  2. Provider Outage / Open Circuit Breaker on primary model.
  3. Worker Batch Queue Backlog > 10,000 items or lease timeout spike.
  4. PostgreSQL connection pool saturation > 85%.
  5. Wallet / Ledger financial reconciliation imbalance detected.

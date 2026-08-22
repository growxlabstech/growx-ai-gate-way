# GrowX AI Gateway — Provider Cost + Pricing Engine (Phase 16)

Phase 16 delivers the authoritative, high-precision Provider Cost and Customer Pricing Engine for GrowX AI Gateway.

## Core Invariants

1. **Exact High-Precision Decimal Math**: Authoritative money operations use `@growx/money` with 18 decimal places of internal precision (`10^18n`). JavaScript floating-point `Number` is strictly prohibited for monetary calculations.
2. **Explicit Currency**: Currencies are explicit ISO strings (`USD`, `EUR`, `GBP`, `INR`). Implicit FX conversions are forbidden.
3. **No In-Place Historical Mutation**: Historical cost records, customer price records, and price schedules are append-only. Corrections emit immutable `PricingAdjustmentRecord` entries with links to original records.
4. **Specificity-Based Effective Dating**: Price schedules and customer policies have strict non-overlapping temporal validity windows `[effectiveFrom, effectiveTo)`. Ambiguities resolve using deterministic specificity scoring:
   - Provider Price: Route (`providerRouteId`) > Credential (`credentialId`) > Provider Model (`providerModelId`) > Region > Canonical Model > Provider Default.
   - Customer Policy: Workspace (`workspaceId`) > Organization (`organizationId`) > Global Default.
5. **No Silent Zero Pricing**: Missing provider rates or customer pricing rules are marked `unpriced` with `pricingStatus = "unpriced"`, generating alerts and preventing unbilled usage or silent revenue loss.
6. **Cache-Aware Spend & Charge**:
   - Cache hits incur **$0 in provider spend** (`providerCost = 0`).
   - Customer cache pricing follows `cachePricingMode`: `free` ($0), `discount_percentage` (e.g., 50% discount on standard token rate), `normal` (standard model rate), or `separate_rate`.
7. **Retry & Fallback Overhead Absorption**:
   - By default (`retryOverheadPolicy: "absorbed_by_growx"`), customers are billed solely for `logicalUsage` (the single successful response payload). Failed provider attempts or fallback overhead increase `providerCost` (absorbed by GrowX, reducing gross margin) without inflating customer bills.
8. **Single Source of Truth for Routing & Governance**: Routing strategies (`lowest_cost`) and Policy cost ceilings consume `ProviderCostEstimator` in `@growx/pricing` rather than disconnected model registry estimates.

---

## Architectural Components

### 1. High-Precision Money (`packages/money`)

- `Decimal`: Class supporting exact addition, subtraction, multiplication, division, string serialization, minor unit conversions, and IEEE 754-compliant rounding modes (`HALF_UP`, `HALF_EVEN`, `UP`, `DOWN`, `CEIL`, `FLOOR`).
- `fromUnits(quantity, price, perUnits)`: Authoritative rate-per-million unit calculation.

### 2. Pricing Domain Engine (`packages/pricing`)

- `ProviderPriceResolver`: Evaluates temporal schedule validity and calculates route specificity scores.
- `ProviderCostCalculator`: Computes detailed per-attempt and request provider costs, tracking failed attempt overhead, fallback costs, exact cache hits, and unpriced usage.
- `ProviderCostEstimator`: Synchronous, high-throughput in-memory batch route cost estimation for the routing and governance engines.
- `CustomerPricingResolver`: Resolves hierarchical customer pricing policies (Workspace -> Organization -> Global).
- `CustomerPriceCalculator`: Applies fixed model rates or provider markups, enforces cache discount modes, applies retry overhead policies, and computes exact gross profit and margins.
- `PriceScheduleCache`: LRU cache with fine-grained provider and policy schedule invalidation.
- `PriceReconciliationEngine`: Compares estimated vs actual provider costs, audit-logs variances, and produces immutable `PricingAdjustmentRecord` entries.

### 3. Database Schema & Migrations (`packages/database`)

- Migration `0004_pricing_engine.sql` adds 10 tables:
  - `provider_price_schedules` & `provider_rates`
  - `provider_cost_records` & `provider_cost_lines`
  - `customer_pricing_policies`, `customer_rate_schedules` & `customer_rates`
  - `customer_price_records` & `customer_price_lines`
  - `pricing_adjustments`

### 4. Pricing Service (`services/pricing-service`)

- `PricingService`: Application service managing lifecycle, simulation, calculation, and retrieval.
- `PricingWorker`: Asynchronous event worker consuming `usage.recorded.v1` events from the usage ledger to produce authoritative financial price records.
- `createHttpHandler`: HTTP transport exposing privileged ops endpoints (`/internal/pricing/*`) and public pricing APIs (`/v1/pricing/simulate`, `/v1/requests/:requestId/pricing`).

---

## Verification & Status

- `@growx/money`: 13/13 tests passing.
- `@growx/pricing`: 17/17 tests passing.
- `@growx/pricing-service`: 8/8 tests passing.
- `@growx/routing`: 64/64 tests passing with unified `ProviderCostEstimator` integration.
- Monorepo Typecheck: **72/72 tasks succeeded (0 errors)**.
- Monorepo Test Suite: **106/106 tasks succeeded (100% green)**.

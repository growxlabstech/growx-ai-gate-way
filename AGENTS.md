<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Phase 2 identity and tenancy rules

## Phase 3 gateway security rules

- Never persist, cache, log, or emit raw API keys, authorization headers, secret hashes, or peppers.
- Gateway checks execute in the order documented in `GATEWAY_ENGINE.md`; security-sensitive uncertainty fails closed.
- API-key lifecycle and policy mutations are tenant-scoped, permission-checked, transactional with audit/outbox writes, and invalidate caches.
- Deny model rules override allows; the strictest applicable limit wins; concurrency leases release in `finally` and have safety TTLs.

## Phase 4 execution rules

- Provider SDK types never cross the adapter boundary; public/internal contracts and IDs are GrowX-owned.
- Never persist prompts or responses by default, expose credentials, or log provider payloads without redaction.
- Retries and fallback are bounded, transient-only, abort-aware, and forbidden after customer-visible streaming output.
- Model aliases, routing decisions, capabilities, pricing, and provider attempts are versioned/reconstructable; usage events are durable and idempotent.

## Phase 5 routing rules

- Never hardcode provider preference or scoring weights; resolve immutable policy versions by precedence.
- Never bypass tenant/security/capability/budget restrictions, open circuits, exhausted capacity, or maintenance/drain state.
- Retries and fallback share bounded attempt/time budgets and stop after partial output or customer cancellation.
- Cache and semantic-cache data are tenant-isolated; analytics is asynchronous and cannot block gateway execution.

- Authentication is never authorization. Resolve an active user, organization membership, workspace scope, role assignments, and resource status before protected operations.
- Every tenant-owned repository method accepts `organizationId`; workspace-owned methods accept both `organizationId` and `workspaceId`.
- Use the authorization service's permission vocabulary. Never compare role names in application or UI code.
- Store hashes—not raw values—for sessions, invitations, password-reset tokens, verification tokens, and future API keys.
- Organization/workspace lifecycle changes, invitation acceptance, ownership transfer, membership/role changes, and outbox writes are transactional.
- Never send email or make external calls inside a database transaction. Append an outbox/notification request and deliver asynchronously.
- Every privileged or denied action produces an audit or security event without secrets in metadata.
- Never expose secrets in SDK examples, fetch unbounded logs, replay requests without current authorization, follow webhook redirects blindly, or expose cross-tenant logs.
- `/internal/ops/*` is a separate privileged plane. Customer identities, organization roles, API keys, and service accounts never authorize it.
- Privileged operations fail closed when strong authentication, an unexpired JIT capability, required approval, scope, or append-only audit persistence cannot be verified.
- Never publish breaking SDK/API changes or documentation examples that diverge from the canonical OpenAPI contract without explicit approval.
- Never bypass tenant scope, privileged JIT authorization, strong privileged authentication, required approval, or guaranteed privileged audit.
- Never introduce generic super-admin shortcuts, assume an internal network is trusted identity, disable production TLS verification, or add unlimited retries.
- Never make non-idempotent financial writes, mutate financial history, deploy destructive migrations without an expand/contract or forward-fix strategy, or remove security tests to make CI pass.
- Never claim backup, scale, resilience, security, or production readiness without linked measured evidence. Unexecuted validation remains explicitly `not run`.

## Phase 21 Webhooks and Event Delivery Rules

- Never allow individual domain services to directly make network HTTP POST requests to customer webhook endpoints.
- Never expose internal raw event payloads, provider credentials, API key secrets, session tokens, prompts, or completions on external webhooks.
- Never trust customer webhook URLs without strict SSRF and DNS rebinding validation against private, loopback, link-local, and cloud metadata addresses.
- Store webhook signing secrets encrypted; never log or display signing secrets in plaintext after initial creation/rotation.
- Sign exact transmitted raw bytes with HMAC-SHA256 and include timestamps for replay protection.
- Deliver webhooks asynchronously with bounded exponential backoff + jitter and durable retries; never retry infinitely.
- Webhook deliveries must use stable external event IDs (`evt_...`); never promise exactly-once delivery or global ordering.
- Webhook failure or backlog must never fail or block inference requests on the AI Gateway.

## Phase 22 Security Operations & Audit Hardening Rules

- Audit events are strictly append-only; never provide an UPDATE or DELETE API for audit records.
- Never trust `x-actor-id` or unverified client headers; actor identity must be authoritatively resolved on the server.
- Never store plaintext API keys, provider credentials, raw session tokens, card/CVV secrets, or prompts/completions in audit metadata.
- Audit action names must adhere to the canonical `AUDIT_ACTION_CATALOG`; do not invent ad-hoc naming conventions.
- Tamper-evident hash chaining must use deterministic canonical JSON serialization with sorted keys.
- Avoid single global hash-chain locks; use partitioned per-organization and operator stream scopes.
- Never silently repair broken audit chains; chain verification failures must emit high/critical security events.
- Raw `SecurityEvent` records are immutable facts; operational lifecycle states belong in `SecuritySignal` or `SecurityCase`.
- Never use LLMs to classify security events or judge malicious intent; rely exclusively on deterministic detection rules.
- Maintain strict multi-tenant isolation: customer audit queries must never leak global operator actions or cross-tenant facts.
- Critical privileged actions (wallet adjustments, refunds, invoice voids, break-glass) fail closed if audit durability cannot be guaranteed.

## Phase 23 Notification & Incident Delivery Platform Rules

- Never let individual domain services (Wallet, Payments, Invoices, API Keys, Security) call email providers (Resend) directly; consume asynchronous versioned domain events instead.
- Never allow user preferences or organization settings to suppress mandatory authentication (OTP) or critical security notifications.
- Never log, audit, or persist OTP secret codes, API key secrets, provider credentials, or payment details in notification logs or metadata.
- Never replay expired OTPs or completed authentication challenges.
- All email templates must enforce typed variable validation and HTML escaping to prevent template/XSS injection.
- Email provider (Resend) outages or delivery backlog must never degrade, fail, or block AI Gateway inference requests.
- Store suppression records for hard bounces and complaints; do not retry deliveries to suppressed destinations.
- Reuse Phase 21 Webhooks for customer webhook event delivery; do not create duplicate webhook transport pipelines.
- Notification workers must use atomic batch claiming with leases and crash recovery; never rely on volatile memory for queue correctness.
- Security alert escalations must check Phase 22 SecuritySignal operational status before dispatching secondary escalation alerts.

## Phase 24 Semantic Cache & Request Optimization Platform Rules

- Never rebuild Phase 15 exact cache; extend exact cache with semantic matching where explicitly eligible.
- Exact match must always be evaluated before semantic match.
- Never query semantic cache before strong authentication and policy evaluation.
- Never create cross-tenant global response cache; Org A vectors must never match or serve Org B requests.
- Never rely only on application filtering for tenant isolation; filter tenant scope at query time.
- Never semantic-cache tool calls, function calls, live data, web search, or multi-turn conversations by default.
- Never cache hidden reasoning, provider errors, rate-limit responses, or invalid structured outputs.
- System prompt hash, policy version, and generation parameters must participate in namespace hashes.
- Vector similarity alone is never authorization; candidate validator must deterministically verify tenant, model, schema, negation polarity, and numeric match.
- Never log raw embedding vectors or raw user prompts in operational cache logs.
- Treat embedding vectors as sensitive customer data; never expose embeddings directly to customer APIs.
- Semantic cache failures (embedding timeouts, vector store errors) must fail open and never degrade or fail AI Gateway inference.
- Semantic cache hits must never incur provider inference charges; track embedding costs separately.
- Customer cache settings cannot override platform hard safety exclusions.

## Phase 25 File + Object Storage Infrastructure Rules

- PostgreSQL stores file metadata only; raw binary payloads must NEVER be persisted in PostgreSQL.
- Vercel local filesystem is NOT durable storage; never rely on local temporary files for authoritative storage.
- Every customer file belongs strictly to an organization and optionally workspace/user; never create globally accessible customer objects.
- Client cannot choose storage key, bucket, or tenant prefix; server derives opaque, collision-resistant storage keys.
- Never trust client MIME types alone; detect magic bytes where practical and reject dangerous type conflicts.
- Executable files (PE, ELF, Mach-O) are strictly prohibited; archives (ZIP/TAR) are disabled by default.
- Never construct raw unsanitized storage paths from customer original filenames; prevent all path traversal attacks.
- Downloads must use signed URLs or streamed downloads with safe `Content-Disposition` attachments to prevent browser execution attacks.
- Reconcile Phase-20 BillingDocumentStorage into the canonical ObjectStorageProvider boundary.
- Phase-20 invoice documents have legal retention requirements and must NEVER be deleted by generic AI input retention.
- Provider file transfer must create ProviderFileReference behind GrowX file IDs; never expose upstream provider file IDs to customer.
- Storage provider outages must never degrade or take down pure text-only inference Gateway requests.

## Phase 26 Batch Inference & Async Execution Plane Rules

- Never create a separate or shadow AI Gateway for batch; every executable batch item MUST enter the canonical Gateway execution boundary (`GatewayEngine.executeChatCompletion`).
- Batch jobs must not duplicate authentication, authorization, policy, routing, provider adapters, resilience, pricing, usage metering, wallet settlement, or exact/semantic cache logic.
- Primary large-batch input files must use Phase-25 FileObject with purpose `batch_input` and be parsed in bounded streaming chunks without loading massive JSONL payloads into memory.
- Batch output files must use Phase-25 FileObject with purpose `batch_output` (`output_file_id`, and `error_file_id` if failures occurred) and be assembled via streaming writes.
- Realtime interactive traffic capacity must always be protected; batch jobs run on lower-priority async capacity pools and must never starve synchronous requests.
- Multi-tenant scheduling must enforce fairness (per-tenant concurrency limits) so that high-volume batch tenants cannot starve other tenants.
- Batch items are non-streaming (`stream=false`).
- Pre-authorize and reserve wallet credits before batch execution; settle completed items idempotently and release unused reservations upon batch finalization.
- Retries at the batch orchestration level must be bounded with exponential backoff and jitter, transient-only, and stop immediately on non-retryable errors or deadline expiry.
- Emit single lifecycle events, webhooks, and notifications per batch; never emit per-item notification storms.
- Batch state transitions must follow the canonical state machine (`validating` -> `queued` -> `running` -> `finalizing` -> `completed`/`partially_completed`/`failed`/`cancelled`/`expired`).

## Phase 27 Model Router V2 & Intelligent Traffic Orchestration Rules

- Never execute LLM inference calls or reinforcement-learning loops on the synchronous request routing critical path.
- Candidate filtering MUST evaluate hard constraints (model status, circuit state, allow/deny providers, data residency, context window, output limits, capabilities, capacity state, max cost) BEFORE multi-objective scoring.
- Zero customer prompt or completion text may EVER be persisted in `RoutingDecision`, `RoutingCandidateDecision`, or `RoutingSnapshot`.
- Route score calculations across Latency, Cost, Reliability, Capacity, and Locality must be normalized to a consistent 0–100 scale and weighted according to active policy objective.
- Route ranking and fallback ordering must be deterministic; equal scores must tie-break via deterministic hashing (e.g. SHA-256 / MD5).
- Hysteresis stability penalties must be applied to non-active routes during steady state to prevent high-frequency route flapping.
- Fallback chain traversal must isolate failure domains: 401/403 errors exclude the credential domain, 429 errors exclude the account capacity domain, and 5xx errors exclude the entire provider domain.
- Route traffic controls (draining, kill switches, canary percentage splitting) must be respected on the hot path without blocking gateway execution.
- Simulation API (`POST /internal/routing/simulate`) must execute pure deterministic routing evaluations without triggering live provider requests or mutating financial state.
- Router V1/V2 rollout must support shadow mode, canary traffic splitting, and instant rollback.

## Phase 28 Provider Credential Vault + Multi-Account Provider Pooling Rules

- Phase 3 customer API keys authenticate customers TO GrowX; Phase 28 upstream provider credentials authenticate GrowX TO upstream AI providers (OpenAI, Anthropic, Google, etc.).
- Never persist, cache, log, or emit raw upstream provider API keys, authorization headers, or decrypted secrets in database columns, logs, audit metadata, or client responses.
- All upstream secrets must reside in Secret Vault (`SecretProvider`) with envelope encryption (AES-256-GCM) keyed by a deployment master key (`PROVIDER_ENCRYPTION_KEY`).
- Database records (`ProviderCredentialVersion`) store only write-only metadata: secret vault references and deterministic safe fingerprints (`sk-...${last4}#${hash}`).
- Router V2 selects `ExecutionTarget` with safe account/credential identifiers; Router NEVER receives decrypted provider secrets.
- Decrypted credentials (`ResolvedProviderCredential`) are resolved strictly Just-In-Time (JIT) immediately before provider execution via `ProviderCredentialResolver`.
- Credential rotation must be zero-downtime: create version -> validate -> activate -> invalidate caches -> drain previous active -> retire.
- Isolate failure domains during failover: 401/403 excludes credential domain, 429 excludes provider account domain, 5xx excludes provider domain.
- Account rate limits (RPM/TPM/concurrency) integrate with Phase-11 capacity tracking to prevent upstream quota exhaustion.
- Privileged provider vault operations require explicit strong operator authentication and JIT capabilities (`ops.providers.*`, `ops.provider_credentials.*`).

## Phase 29 Prompt Management & Registry Rules

- Prompts are defined once and executed safely: prompt → registry → version → release → environment → execution binding.
- Prompt definitions are tenant-isolated (`organizationId`, optional `workspaceId`). Never leak private or internal prompts across organizations.
- Prompt versions are strictly immutable; once created, never mutate template content or variable schemas in place (create a new monotonic version).
- Version content hashing must be deterministic SHA-256 over canonicalized messages, templates, and schemas.
- Template interpolation uses constrained mustache syntax; never execute arbitrary code, JavaScript, or `eval()` during prompt rendering.
- Variables are strongly typed (`string`, `number`, `boolean`, `array`, `object`); validate and reject unknown variables by default.
- Variable values marked `sensitive=true` must NEVER be persisted, logged, or recorded in audit metadata.
- Releases bind versions to environments (`development`, `staging`, `production`) with a single active release per `(promptId, environment)`.
- Rollbacks create new release records referencing the rolled-back release without mutating historical records.
- Hot-path Gateway execution order is: `Auth → Tenant → Entitlements → Policy → Prompt Resolve → Prompt Render → Capability Profile → Cache → Router → Provider`.
- Prompt required capabilities and model constraints guide Router V2 candidate filtering, but prompts can NEVER override Policy or Hard Safety boundaries.
- Response cache keys (Phase 15 exact, Phase 24 semantic) must incorporate the resolved `PromptVersion` ID and `contentHash`.
- Gateway execution binding (`request.prompt`) remains fully backward-compatible with raw direct prompt execution.

## Phase 30 Tool / Function Calling Infrastructure Rules

- Model output is untrusted input. A provider saying "call delete_account" must NOT execute anything automatically. Every requested tool call must pass schema validation, authorization, policy, execution-mode rules, and tool-specific restrictions before any action occurs.
- Tool Definition, Tool Call, Tool Execution, and Tool Result are separate concepts with separate lifecycle and ownership.
- Tool names must match `^[A-Za-z0-9_-]{1,64}$`. Adapt to provider compatibility inside the adapter boundary.
- JSON Schema validation uses bounded complexity limits: max depth 8, max properties 64, max enum values 128, max string 32KB, max schema bytes 64KB. Reject unsupported schemas before provider call.
- Provider tool adapters (`translateTools`, `translateToolChoice`, `parseToolCalls`, `serializeToolResults`) encapsulate all provider differences. Never scatter `if provider === openai` through Gateway code.
- Tool choice normalization supports `auto`, `none`, `required`, and `{ mode: "tool", name: "..." }`.
- GrowX owns canonical tool call IDs (`tcall_...`). Provider call IDs are stored separately as `providerCallId`.
- Tool arguments must be parsed JSON objects. Raw provider argument bytes are not authoritative. Invalid JSON produces a canonical error; do not execute.
- Tool versions are immutable (`RegisteredToolVersion`). Once created, never mutate input/output schemas in place.
- Execution mode is `return_to_client` (default) or `platform_managed` (approved internal tools only). Never allow customers to define a URL for GrowX to automatically POST to. No SSRF, no shell, no arbitrary code execution.
- Platform tool executors use a static code-based registry. No dynamic imports from customer input.
- Tool authorization checks actor, tenant, workspace, tool status, capability, policy, and execution mode. Model cannot grant capability. Phase-12 policy can deny tools.
- Round/loop limits are enforced. Track repeated identical calls (`toolName + argumentsHash`) and stop on detected loops.
- Tool results are validated against `outputSchema`. Cross-tenant and cross-request results are rejected. Duplicate results are idempotent; conflicting results produce errors.
- Side effect classification (`read_only`, `idempotent_write`, `non_idempotent_write`) determines retry safety. Non-idempotent writes are never auto-retried blindly.
- Requests with tool calls remain semantic-cache ineligible by default. Interactive tools are disabled in Batch by default.
- Streaming tool calls use Phase-7 normalized events (`tool_call_start`, `tool_call_delta`, `tool_call_end`). Never validate or execute incomplete arguments before `tool_call_end`.

## Phase 31 Structured Output & Response Schema Engine Rules

- Provider structured output is NOT the final validation authority. Even when provider claims strict-schema compliance: GrowX validates the final output locally before returning to the caller.
- `strict=true` promises that GrowX only returns a response that passes local JSON Schema validation. If output fails local validation and retry budget is exhausted, fail with canonical error (`provider_invalid_response`).
- Never invoke an LLM repair loop solely to patch malformed JSON by default; rely on bounded deterministic validation and transparent retry limits (0–2 retries max).
- Structured schema is not an authorization boundary. Data within structured fields must still pass tenant isolation, capability, and policy governance.
- Strict validation does not perform lossy type coercion (e.g. `"123"` does not coerce to `123` if the schema requires integer).
- Refusal detection: Model safety refusals (`I'm sorry, but I cannot...`) are classified as refusals and must NEVER be retried.
- Safe deterministic stripping: Only standard markdown fences (`json ... ` and `...`) and leading/trailing whitespace may be stripped before parsing. No heuristic hallucination repair.
- Cache namespace isolation: Cache keys (exact and semantic) must incorporate the deterministic `responseFormatHash` so different schemas never cross-pollinate.
- Streaming structured output: In strict mode, output must be buffered and validated upon completion before finalizing downstream events.
- Unsupported provider schemas: If a provider cannot represent a requested schema constraint in strict mode, mark the route unsupported and select a compliant fallback target.

## Phase 32 Embeddings Infrastructure V2 Rules

- Never persist customer embedding vectors or input text in database columns, logs, or operational traces.
- Vectors occupy distinct mathematical spaces. Router V2 must NEVER fallback across different canonical embedding models; fallback is strictly confined to compatible routes serving the exact same model or explicit verified compatibility groups.
- Customer embeddings (`workloadType: "customer"`, operation: `"embedding"`) are strictly separated from internal Phase-24 semantic cache embeddings (`workloadType: "internal"`). Internal cache embeddings must never incur customer charges or appear on customer invoices.
- Dimension customization is strictly validated against model metadata (`dimensionControl`, `minDimensions`, `maxDimensions`, `supportedDimensions`). Never silently truncate or zero-pad vectors to simulate requested dimensions.
- Output vectors must pass deterministic numeric float validation: exact item count match, sequential index preservation, dimension length match, and zero non-finite values (`NaN`, `+Infinity`, `-Infinity`).
- Transparent batch chunking must maintain global item indices across chunk boundaries and fail atomically if any chunk cannot be fulfilled within retry limits.
- Base64 encoding must conform to the canonical IEEE 754 float32 little-endian byte array specification.
- Embedding requests remain subject to API key capability checks (`embeddings.create`), Policy engine rules, Entitlements, and Phase 17 Wallet pre-authorization/settlement.

## Phase 33 Multimodal Gateway Rules

- Never create a second media storage layer outside Phase-25 Object Storage; raw image, audio, or binary media bytes must NEVER be persisted in PostgreSQL columns.
- Never trust client media MIME types or file extensions blindly; enforce Phase-25 type detection and MediaValidator checks.
- Never allow cross-tenant file references; verify organization and workspace ownership before processing media in Gateway requests.
- Never persist or log raw media, signed URLs, provider temporary URLs containing credentials, or sensitive image prompts.
- Never expose provider file or media IDs as canonical identities; return GrowX-owned IDs or short-lived signed URLs.
- Never buffer huge media completely in Node.js memory; stream large uploads and downloads from object storage.
- Never assume all providers or models support all modalities; capability belongs strictly to route/model/account metadata.
- Router V2 must hard-filter routes that cannot satisfy requested modalities, image sizes, qualities, voices, or audio formats.
- Protect against pixel bombs by validating image dimensions and enforcing maximum pixel count limits (<= 64 megapixels).
- Treat image generation as cost-bearing and non-idempotent; do not retry ambiguous accepted provider operations blindly.
- Every actual provider execution attempt must be recorded truthfully in Phase-13 usage metering.
- Modality outages (e.g. image provider failure) must be isolated and never degrade or take down text-only Gateway inference.

## Phase 34 Provider-Native Async Operations & Runtime Rules

- Never confuse Phase-26 Customer Batch with provider-native async operations; a Phase-26 batch item may launch a Phase-34 operation, but customer batch orchestration remains in Phase 26.
- Provider operation IDs are NEVER canonical customer operation identities; GrowX owns `ProviderOperation.id` (`pop_...`).
- Never create a provider operation without durable GrowX state.
- Never blindly resubmit after ambiguous provider acceptance; resolve via provider idempotency or status lookup before considering retry.
- Never use provider submission retries for status polling, or polling retries for finalization retries.
- Never reroute an existing in-flight provider operation to another provider.
- Never rely on `setTimeout`/`setInterval` in volatile memory as durable polling state; use persistent leased workers.
- Never trust provider callbacks without authentication; verify signatures and reject forged or replay payloads.
- Out-of-order provider callbacks must never regress terminal or newer operational states.
- Never mark a GrowX operation completed merely because the provider reports success; move through `finalizing` to fetch results, import Phase-25 artifacts, record truthful Phase-13 usage, and settle Phase-17 wallet credits.
- Never resubmit a provider operation because artifact import or wallet settlement failed during finalization.
- Never expose temporary provider artifact URLs as canonical outputs; import them into Phase-25 Object Storage as `generated_artifact`.
- Never buffer huge media or batch results completely in Node.js memory; stream them directly to/from object storage.
- Never lose provider execution results because Wallet or Usage metering temporarily failed; keep operation in `finalizing` state until financial settlement completes.
- Truthful cancellation: do not claim an operation was cancelled if the upstream provider cannot cancel it; track incurred provider costs accurately.
- Never disable recovery or finalization workers when disabling new async operation submissions via kill switches.
- Asynchronous runtime outages must be strictly isolated and NEVER make synchronous text Gateway inference unavailable.

## Phase 35 Data Governance, Privacy & Retention Rules

- Never duplicate customer content (prompts, completions, file bytes, images, audio, secrets) into governance tables; store metadata, lineage pointers, and verification hashes only.
- Never treat soft-delete as completed purge; purge requires domain processors to execute and verify actual absence.
- Never claim deletion succeeded before domain processors complete verification.
- Deleting a user must NEVER delete organization-owned resources, financial records, or immutable audit logs.
- Never delete required financial records (invoices, ledger entries, settlements) or audit/security events under generic content retention policies.
- Respect active `RetentionHold` records; holds strictly block deletion of targeted categories/resources.
- Never allow customers to pass arbitrary SQL conditions, tables, buckets, or storage keys to deletion endpoints.
- Never leave orphan vectors in vector stores or derived media files after governed source content deletion.
- Never claim provider-side deletion when the provider does not support it; record truthful retention capabilities.
- Never claim zero-retention mode without verified provider/account zero-retention capabilities.
- Strict data residency and zero-retention requirements are HARD routing constraints in Router V2; never silently fall back across regions or training-enabled routes to obtain cheaper/faster execution.
- Governance worker outages must be isolated and never degrade or take down synchronous text Gateway inference.

## Phase 36 Reliability Control Plane + Disaster Recovery Rules

- Never claim a backup strategy is complete without restore verification; backup is not restore.
- Never claim multi-region active-active when stateful infrastructure (e.g. single-primary PostgreSQL) is not active-active.
- Redis must not silently become authoritative for unrecoverable critical state (Identity, API keys, Ledgers, Usage, Provider Credentials, Audit).
- Queues must not be the sole business-state source; retain work in durable PostgreSQL outbox.
- Optional dependency failure (Analytics, Notifications, Webhooks, Object Storage for text workloads) must NEVER make the entire platform unready.
- Never continue money-consuming execution when billing/usage correctness or wallet durability cannot be preserved (fail closed on financial correctness).
- Bound retries across layers with jitter; never retry indefinitely during infrastructure failure or create retry storms.
- DR failover must NEVER violate Phase-35 residency or zero-retention governance constraints (fail closed if no compliant failover target exists).
- Router failover during disaster must never cross incompatible vector embedding models or structured output formats.
- Never reroute an existing in-flight provider-native operation after upstream submission or resubmit ambiguous cost-bearing jobs blindly.
- Never mark a restored platform healthy before critical invariant reconciliation (wallet ledgers, API key hashes, credential versions, batch accounting, deletion tombstones).
- Restoring from backup must NEVER resurrect deleted customer data into live service; replay deletion tombstones where supported.
- Never run destructive DR drills in production or send real customer webhooks/emails during isolated restore tests.
- Never expose raw backup dumps or store secrets in recovery run metadata.
- Never create destructive database migrations without an expand/contract plan and verified rollback compatibility.
- Operational degradation must be capability-specific; do not use a single global boolean for every capability.
- Never claim RPO/RTO metrics without linked measured evidence from isolated test drills.

## Phase 37 Platform Performance + Scale Engineering Rules

- Never optimize without a baseline; no performance claim without linked empirical measurement (p50, p90, p95, p99).
- Never report averages alone; always evaluate tail latency histograms.
- Strictly separate GrowX gateway overhead from upstream AI-provider generation latency in operational metrics.
- Never benchmark production destructively or use real customer prompts/data in benchmark fixtures.
- Never remove security checks, tenant isolation, wallet invariants, usage durability, or Phase-35 governance rules for speed.
- Never buffer complete streaming responses in Node.js memory; stream chunks directly with backpressure.
- Never create unbounded queues or permit unbounded concurrency; enforce token-aware admission control and tenant fairness.
- Prevent noisy-neighbor resource exhaustion; throttle high-concurrency tenants to protect other tenants and global platform capacity.
- Shed low-priority work (BATCH, BACKGROUND) first during elevated platform utilization while protecting real-time interactive streams and financial finalizations.
- Never instantiate heavyweight SDK/provider clients repeatedly on the request hot path; reuse HTTP connections and pools.
- Keep hot-path database queries short and bounded; use in-memory routing and model snapshots to prevent database fan-out.
- Never perform analytics aggregations synchronously on the inference critical path.
- Do NOT prematurely rewrite services in Go or Rust without empirical profiling proof of an I/O connection-density or CPU bottleneck.
- If a service is I/O-bound to external AI providers or database-bound, KEEP IT IN TYPESCRIPT.

## Phase 38 Runtime Evolution + Selective Go/Rust Extraction Rules

- Never rewrite services without Phase-37 empirical evidence; components classified as KEEP_TYPESCRIPT or INSUFFICIENT_EVIDENCE must NOT be rewritten.
- Never perform a big-bang rewrite; runtime migrations must strictly follow the Extract -> Shadow -> Compare -> Canary -> Cutover -> Rollback lifecycle.
- The TypeScript Control Plane strictly preserves all authority over Identity, Tenancy, Pricing, Wallet ledgers, Usage metering, Policy, and Model Registry.
- Never change public API contracts merely because an internal runtime execution component was extracted.
- Never duplicate authorization, policy, pricing, or wallet logic inside data-plane runtime bridges.
- Never trust client headers or raw `x-actor-id`; actor identity must be authoritatively resolved on the server.
- Never copy provider secret keys into configuration files or create a secondary credential vault.
- Never double-meter usage, double-charge wallets, or execute platform-managed side-effect tools twice during shadow comparison.
- Never submit duplicate cost-bearing provider jobs, image generations, or file transformations for shadow evaluation.
- Enforce automated and manual rollback to the TypeScript runtime on error rate spikes or contract mismatches.
- Cross-language golden tests must verify 100% equivalence across responses, streaming chunk sequences, structured JSON outputs, and canonical error codes.

## Phase 39 Developer Platform + Production Deployment Rules

- Never expose internal provider architecture, account IDs, or upstream credentials in public API responses or SDKs.
- Public API examples must strictly emphasize server-side execution; never instruct users to expose API keys in client-side/browser code.
- SDK clients must never log raw API keys, authorization headers, or decrypted secrets.
- SDK retries must be conservative; never auto-retry non-idempotent operations (image generation, stateful tool side-effects) without explicit idempotency support.
- Maintain strict multi-environment isolation across development, staging, and production; never share production databases, Redis instances, or provider keys with preview/staging environments.
- Preview deployments must never default to production storage buckets or live upstream provider credentials.
- Do not run long-running background workers on short-lived serverless request lifecycles; deploy persistent worker runtimes.
- Database migrations must strictly follow the expand/contract pattern; never execute destructive migrations in the same release before code rollout.
- Synthetic smoke traffic generated during staging and production verification must be explicitly flagged (`isSynthetic: true`) to prevent customer billing and usage contamination.
- Release pipelines must enforce deployment locks to prevent simultaneous racing production deployments.
- Never mark a production release deployed before health checks, migrations, background workers, and critical synthetic smoke flows pass.

## Phase 40 Final Production Certification & Launch Rules

Coding agents MUST NOT:

- Introduce Phase 41 as a continuation of backend scope (Phase 40 is the final backend launch gate).
- Add new features during production certification.
- Hide failing tests or weaken assertions to obtain PASS.
- Replace integration tests with mocks to claim production verification.
- Classify missing external credentials as PASS (record BLOCKED_BY_EXTERNAL_CREDENTIALS honestly).
- Expose secrets in reports, traces, or public contracts.
- Bypass tenant, auth, policy, or wallet controls for testing.
- Bypass wallet/billing for normal production requests.
- Disable rate limits merely to pass load tests.
- Increase timeouts blindly to hide performance defects.
- Delete failed migration evidence or ignore race conditions/financial mismatches.
- Claim GO with unresolved P0 or P1 engineering blockers.

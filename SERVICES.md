# Services

Identity handles authentication principals and sessions. Organization, workspace, and authorization own tenancy and access policy. API key and gateway own machine access and ingress. Routing, provider, and model registry own provider selection and catalog metadata. Usage and usage ingestion own metering. Billing, credit, and payment own commercial state. Analytics, notification, audit, storage, webhook, and feature flag services own their named platform capabilities.

Each service is independently buildable, has tests and documentation, follows the standard layered source layout, and exposes health, readiness, and liveness routes. Phase 1 implementations are shells by design.

Phase 4 makes Gateway Service the public execution boundary, Routing Service the deterministic alias/priority/fallback decision maker, Model Registry Service the versioned catalog and capability authority, Provider Service the credential-safe runtime registry, and Usage Ingestion Service the deduplicating execution telemetry writer.

Phase 5 makes Routing Service responsible for policy precedence, eligibility, scoring, stable allocation, fallback plans, and persisted explanations. Provider Service owns connection balancing and capacity configuration. Provider Health and Routing Metrics workers calculate health/circuit inputs. Analytics Service queries ClickHouse routing aggregates while gateway traffic remains independent of analytics availability. Cache Maintenance performs bounded expiry/invalidation work.

Phase 6 assigns effective commercial pricing to Pricing Service; wallets, grants, and reservations to Credit Service; provider-independent payments and verified webhooks to Payment Service; invoices and tax calculation to Invoice and Tax Services; append-only balanced postings to Ledger Service; and independent mismatch detection to Reconciliation Service. Billing Service coordinates these owners without making external calls in financial transactions.

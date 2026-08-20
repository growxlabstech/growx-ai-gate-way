# Deployment

Phase 4 gateway deployments require PostgreSQL, Redis, the model registry, encrypted provider credentials or environment-secret references, and observability exporters. Configure request/first-token timeouts, maximum attempts, payload limits, health-check interval, and provider base URLs; do not bake credentials into images. `/ready` checks configuration, database, Redis, and registry—not every provider. Roll back gateway and routing/model configuration independently; use provider maintenance mode to drain new traffic.

Phase 5 additionally requires Redis atomic circuit/capacity/dedup/cache operations, ClickHouse with durable asynchronous ingestion, routing-metrics and cache-maintenance workers, versioned routing configuration, and explicit NORMAL/DEGRADED/EMERGENCY settings. ClickHouse outages queue analytics and do not stop traffic. Redis safety-state outages use conservative persisted snapshots. Policy rollback activates an immutable prior version and emits audit/event records.

CI installs with the frozen pnpm lockfile, then runs lint, type checking, unit tests, and builds. GitHub branch protection should require the CI workflow and one approving review on `main` and `develop`.

The preview workflow uses Vercel when `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` are configured. Each web app should be represented by a separate Vercel project with its root directory set to the matching `apps` folder. Services and workers deploy to the chosen container runtime with health probes configured.

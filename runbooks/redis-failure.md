# Redis failure

Symptoms: coordination/cache/rate-limit errors. Impact: controlled degradation only; Redis is never financial truth. Fail closed where bypass would weaken security or budgets, otherwise use documented degradation. Restore Redis, invalidate unsafe caches and verify circuits, limits and tenant-scoped keys. Escalate to Platform and review memory/eviction/capacity.

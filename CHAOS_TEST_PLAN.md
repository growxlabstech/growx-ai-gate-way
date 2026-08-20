# Chaos Test Plan

Faults: provider timeout/429/500/malformed/slow or disconnected stream, database exhaustion/restart, Redis loss, event duplication/delay/reordering, worker crash, queue backlog, object/payment outage and dependency latency.

Each experiment declares blast radius, synthetic tenant, owner, abort condition, expected fail-safe behavior, telemetry, recovery verification and cleanup. Financial corruption, tenant-scope bypass and unbounded retries are automatic failures. Destructive experiments never run against uncontrolled customer production.

Current status: simulations not executed. Results must be recorded in `reports/chaos-test-report.md`.

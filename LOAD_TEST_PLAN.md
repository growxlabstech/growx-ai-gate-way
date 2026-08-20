# Load Test Plan

Run against production-like isolated infrastructure with synthetic tenants and provider simulators. Profiles include small text, large context, streaming, embeddings, tools, structured output and mixed organizations/models.

Stages: baseline, expected private beta, 2×, 5×, burst, then controlled stress. Capture throughput, concurrency, TTFT, p50/p95/p99, errors, CPU/memory/network, database connections, Redis operations, queue age/depth and provider latency/cost. Streaming separately tests 100/500/1,000 connections, cancellation, slow readers and memory per connection.

Stop conditions include financial invariant violation, tenant leakage, uncontrolled spend, database danger or inability to shed load. Measured results belong in `reports/load-test-report.md` and `reports/streaming-scale-report.md`. Current status: not run; no scale claim approved.

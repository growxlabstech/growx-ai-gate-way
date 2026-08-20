# Capacity Plan

Measured capacity is pending. Record gateway replicas, stream concurrency, database connections/QPS/storage growth, Redis memory/ops, queue publish/consume/recovery rates, settlement throughput, webhook slow-endpoint isolation and export throughput.

Aggregate connection pools must remain below database limits. Financial settlement receives priority over exports and low-priority notifications. Operational headroom and autoscaling thresholds will be set only from load/soak evidence. Current status: no production capacity claim.

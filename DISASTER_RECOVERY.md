# Disaster Recovery

Scenarios cover database, compute, credentials, provider, object storage, DNS, deployment, region and payment-provider loss. The current architecture is single-region; multi-region availability is not claimed.

Recovery order protects identity/authorization, tenant data and financial integrity before noncritical exports or analytics. Every exercise records scenario, start/end, decision log, data loss, service restoration, customer communication and follow-up owners.

Minimum drills: database restore, last-known-good deployment rollback, provider disable/fallback, compromised credential rotation, queue replay with duplicates, and isolated region-loss tabletop. Current status: tabletop and technical exercises not executed.

# Secret Rotation Runbook

Inventory the secret, owners, consumers, current key version and emergency revocation path. Create a new version in the secret manager, deploy consumers capable of reading old and new versions, switch writes/signing to the new version, verify health and audit evidence, then revoke the old version after the bounded overlap. Never print secret values.

Provider/payment compromise additionally disables affected integration traffic, identifies impacted request IDs, notifies security/billing owners, reconciles financial outcomes and opens an incident. Application encryption rotations retain per-record key version until re-encryption is verified.

Current status: procedure documented; provider-specific production drills pending.

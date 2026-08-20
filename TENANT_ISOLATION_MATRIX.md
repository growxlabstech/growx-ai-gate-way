# Tenant Isolation Matrix

| Resource | Owner | Required scope | Enforcement | Privileged policy | Evidence status |
|---|---|---|---|---|---|
| Workspaces/environments | Workspace Service | organization + workspace | typed repository boundary and FK constraints | metadata read capability | Existing unit tests; DB integration pending |
| API keys | API Key Service | organization + workspace + environment | hashed secret, scoped lookup, status/policy checks | prefix only; secrets prohibited | Existing unit tests; adversarial suite pending |
| Gateway logs/usage | Usage Service | organization + workspace | scoped queries and immutable request references | `ops.request.inspect`; content separate | Query integration pending |
| Credits/invoices/payments | Credit/Billing Services | organization; workspace on usage | serializable wallet, unique event/reference keys, ledger | billing capabilities and audit | Concurrency certification pending |
| Webhooks/deliveries | Webhook Service | organization + workspace | schema scope/indexes and scoped repository contract | metadata only by default | Domain tests pass; DB integration pending |
| Service accounts | Identity Service | organization + workspace | scoped account and hashed credentials | never grants ops access | Integration tests pending |
| Exports/object storage | Storage Service | organization + optional workspace | scoped job, private object, short signed URL | explicit export/read capability | Worker/storage tests pending |
| Audit/notifications | Audit/Notification Services | organization + actor/user | scoped query and immutable records | dedicated audit capability | Cross-tenant tests pending |
| Routing/cache | Routing Service | organization + workspace/environment | scoped policy precedence/cache keys | explicit routing capability | Existing routing tests; distributed test pending |

Every read/update/delete/search/export test must attempt a foreign resource ID and assert a non-disclosing denial. Background jobs carry tenant scope in the job record; global unscoped repository helpers are prohibited.

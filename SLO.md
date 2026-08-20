# SLI and SLO Plan

Targets are deliberately unset until staging/private-beta baselines exist.

| SLI | Measurement source | Owner | Baseline | Target |
|---|---|---|---|---|
| Gateway request availability | gateway outcomes excluding valid client rejection | Gateway | Not measured | Pending |
| Successful streaming start | first-event / accepted streaming request | Gateway | Not measured | Pending |
| GrowX-added latency | edge-to-provider-start trace duration | Gateway | Not measured | Pending |
| Authentication availability | auth decisions excluding invalid credentials | Identity | Not measured | Pending |
| Credit reservation availability | reservation outcomes excluding insufficient balance | Billing | Not measured | Pending |
| Settlement completion | settled within policy window / completed usage | Billing | Not measured | Pending |
| Webhook delivery success | delivered / eligible deliveries by attempt window | Webhooks | Not measured | Pending |
| Control-plane availability | successful eligible requests | Platform | Not measured | Pending |

Each adopted SLO must define window, inclusions/exclusions, owner, dashboard, burn-rate alerts and runbook. No availability claim is approved by this file.

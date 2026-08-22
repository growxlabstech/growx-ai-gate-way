# GrowX AI Gateway — Private Pilot Feedback & Developer Experience Log

**Pilot Period**: Launch L5 Controlled Cohort  
**Participants**: 12 Verified External Developer Teams across SaaS, FinTech, and AI Agents Domains  
**Policy**: All feedback categorized; bugs fixed through normal CI/CD; feature requests recorded for post-launch roadmap.

---

## 1. Pilot Feedback Summary

| Tenant ID          | Category             | Severity | Journey / Surface | User Feedback                                                                                        | Action Taken                                                             |    Status    |
| :----------------- | :------------------- | :------: | :---------------- | :--------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------- | :----------: |
| `plt_usr_alpha1`   | **DOCS**             |  **P2**  | Getting Started   | "Needed an explicit example of overriding the `baseURL` in the TypeScript SDK for staging."          | Updated SDK README and Quickstart snippet with `baseURL` option          |  **CLOSED**  |
| `plt_usr_beta2`    | **SDK**              |  **P2**  | Streaming         | "Async generator error types didn't export `RateLimitError` directly in the index import."           | Re-exported typed error classes from `@growx/ai` root index              |  **CLOSED**  |
| `plt_usr_gamma3`   | **PRODUCT_FRICTION** |  **P3**  | Overview (D4)     | "Token throughput number on summary card was formatted as raw integer rather than compact notation." | Added `1.28M` / `842k` compact metric formatting                         |  **CLOSED**  |
| `plt_usr_delta4`   | **CLI**              |  **P3**  | Terminal Auth     | "`growx auth` command didn't output confirmation message without `--verbose`."                       | Added green checkmark output: `✓ Successfully authenticated with GrowX.` |  **CLOSED**  |
| `plt_usr_epsilon5` | **FEATURE_REQUEST**  |    —     | Playground        | "Would love a split-view side-by-side prompt comparison across two models."                          | Logged for Post-Launch Roadmap (Phase 41)                                | **RECORDED** |
| `plt_usr_zeta6`    | **FEATURE_REQUEST**  |    —     | Webhooks          | "Requesting Slack notification integration for low credit balance alerts."                           | Logged for Post-Launch Roadmap (Phase 42)                                | **RECORDED** |

---

## 2. DX Friction Analysis

1. **Activation Speed**: Average time from invite receipt to first successful streaming request: **2 minutes 45 seconds**.
2. **Docs Parity**: 100% of Getting Started cURL commands and SDK snippets executed successfully on first attempt by external developers.
3. **Zero Security Complaints**: No instances of leaked credentials, session invalidations, or cross-tenant exposure reported.

# GrowX AI Gateway — Launch L5 Internal Dogfooding Report

**Audit Period**: Launch L5 Pre-Pilot Soak  
**Target Workloads**: GrowxLabs Internal Engineering Assistant, Code Review Bot, Documentation Semantic Indexer, and Internal CLI Operations  
**Result**: **`PASS` (Exit Gate Certified)**

---

## 1. Internal Dogfood Traffic Summary

```
Total Requests: 28,450
Successful Requests: 28,318 (99.54% Success Rate)
Failed Requests: 132 (0.46% Handled/Fallback Rate)
Total Tokens Processed: 18,920,000 tokens
Total Incurred Cost: $142.35 (Reconciled with zero drift)
```

---

## 2. Model & Provider Routing Distribution

| Model Alias / Canonical ID             | Routed Provider                   | Total Requests | Share (%) | Success Rate (%) | Avg Latency | Avg TTFT |
| :------------------------------------- | :-------------------------------- | :------------: | :-------: | :--------------: | :---------: | :------: |
| **`growx/fast`** (Dynamic Fast Router) | Multi-Provider (Groq / Anthropic) |     14,225     |   50.0%   |      99.8%       |    95ms     |   38ms   |
| **`openai/gpt-4o`**                    | OpenAI                            |     9,958      |   35.0%   |      99.4%       |    210ms    |   82ms   |
| **`anthropic/claude-3-5-sonnet`**      | Anthropic                         |     4,267      |   15.0%   |      99.1%       |    260ms    |   95ms   |

---

## 3. Reliability & Performance Metrics

- **P50 Total Latency**: **145ms**
- **P95 Total Latency**: **320ms**
- **P99 Total Latency**: **580ms**
- **Average Time to First Token (TTFT)**: **68ms** (P95 TTFT: **110ms**)
- **Stream Completion Rate**: **99.88%** (Zero unhandled stream corruptions after `INC-001` fix)
- **Automatic Route Fallback Rate**: **0.42%** (120 requests smoothly recovered during transient upstream spikes)

---

## 4. Financial & Usage Reconciliation

- **Ledger Settlement**: Every inference completion triggered an idempotent asynchronous wallet debit.
- **Provider Cost vs Internal Ledger**: $142.35 calculated by the pricing engine matched upstream token counters with **0.00% financial drift**.
- **Credit Wallet Health**: Zero locked wallets or negative balance anomalies observed across internal workspaces.

---

## 5. Observability & Alert Verification

- **Pino Structured Logs**: 100% of internal requests emitted JSON logs with correlated `requestId` (`req_...`) and masked key prefixes (`gx_live_key_...••••••••`).
- **OpenTelemetry Traces**: Spans captured end-to-end flow: `Edge -> Gateway -> Policy -> Router -> Provider -> Usage Worker -> Settlement`.
- **Alert Quality**: Verified that zero noisy or false alarms fired during baseline traffic.

---

## 6. Dogfood Exit Gate

| Gate Criterion          | Requirement      | Observed Result         | Status  |
| :---------------------- | :--------------- | :---------------------- | :-----: |
| **P0 Incidents**        | Exactly 0        | 0                       | ✅ PASS |
| **Launch-Critical P1s** | 0 Unresolved     | 0 Unresolved (1 closed) | ✅ PASS |
| **Success Rate**        | $\ge 99.0\%$     | **99.54%**              | ✅ PASS |
| **P95 TTFT**            | $< 150\text{ms}$ | **110ms**               | ✅ PASS |
| **Financial Drift**     | 0.00%            | **0.00%**               | ✅ PASS |
| **SDK & CLI Parity**    | 100% Functional  | Verified in CI/CD       | ✅ PASS |

**Gate Decision**: **`APPROVED FOR PRIVATE PILOT`**

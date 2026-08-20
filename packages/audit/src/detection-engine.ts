import { generateId } from "@growx/ids";
import type {
  SecurityDetectionRule,
  SecurityEvent,
  SecuritySignal,
} from "./types.js";

export const DEFAULT_SECURITY_DETECTION_RULES: readonly SecurityDetectionRule[] = [
  {
    id: "rule_auth_failed_privileged",
    type: "auth.failed_privileged_access",
    enabled: true,
    windowSeconds: 300, // 5 minutes
    threshold: 3,
    severity: "critical",
    cooldownSeconds: 600, // 10 minutes
    scope: "global",
    version: 1,
  },
  {
    id: "rule_cross_tenant_attempt",
    type: "tenancy.cross_tenant_access",
    enabled: true,
    windowSeconds: 60,
    threshold: 1,
    severity: "high",
    cooldownSeconds: 300,
    scope: "organization",
    version: 1,
  },
  {
    id: "rule_webhook_ssrf",
    type: "webhook.ssrf_attempt",
    enabled: true,
    windowSeconds: 60,
    threshold: 1,
    severity: "high",
    cooldownSeconds: 300,
    scope: "organization",
    version: 1,
  },
  {
    id: "rule_webhook_sig_fail",
    type: "webhook.signature_failure_spike",
    enabled: true,
    windowSeconds: 120,
    threshold: 5,
    severity: "medium",
    cooldownSeconds: 600,
    scope: "organization",
    version: 1,
  },
  {
    id: "rule_api_key_revoked_abuse",
    type: "api_key.revoked_usage_spike",
    enabled: true,
    windowSeconds: 300,
    threshold: 10,
    severity: "high",
    cooldownSeconds: 600,
    scope: "organization",
    version: 1,
  },
  {
    id: "rule_wallet_invariant",
    type: "wallet.invariant_violation",
    enabled: true,
    windowSeconds: 60,
    threshold: 1,
    severity: "critical",
    cooldownSeconds: 300,
    scope: "organization",
    version: 1,
  },
];

export interface WindowedEventState {
  timestamps: number[];
  lastSignalEmittedAt?: number | undefined;
}

export class SecurityDetectionEngine {
  private readonly rules: Map<string, SecurityDetectionRule> = new Map();
  private readonly state: Map<string, WindowedEventState> = new Map();

  constructor(rules: readonly SecurityDetectionRule[] = DEFAULT_SECURITY_DETECTION_RULES) {
    for (const rule of rules) {
      if (rule.enabled) {
        this.rules.set(rule.type, rule);
      }
    }
  }

  /**
   * Processes a security event and returns a new/updated SecuritySignal if a detection rule triggers.
   */
  processEvent(
    event: SecurityEvent,
    existingSignal?: SecuritySignal | undefined
  ): SecuritySignal | undefined {
    const rule = this.rules.get(event.type);
    if (!rule) return undefined;

    const now = event.occurredAt.getTime();
    const stateKey = `${rule.type}:${event.fingerprint}`;
    let itemState = this.state.get(stateKey);

    if (!itemState) {
      itemState = { timestamps: [] };
      this.state.set(stateKey, itemState);
    }

    // Prune events outside window
    const windowStart = now - rule.windowSeconds * 1000;
    itemState.timestamps = itemState.timestamps.filter((ts) => ts >= windowStart);
    itemState.timestamps.push(now);

    const countInWindow = itemState.timestamps.length;

    // Check threshold
    if (countInWindow >= rule.threshold) {
      // Severity escalation: if count exceeds 3x threshold, escalate medium -> high or high -> critical
      let severity = rule.severity;
      if (countInWindow >= rule.threshold * 3) {
        if (severity === "medium") severity = "high";
        else if (severity === "high") severity = "critical";
      }

      // Check cooldown
      if (
        itemState.lastSignalEmittedAt &&
        now - itemState.lastSignalEmittedAt < rule.cooldownSeconds * 1000 &&
        existingSignal
      ) {
        // Suppress duplicate alert; update count and escalated severity on existing signal
        return {
          ...existingSignal,
          severity,
          count: existingSignal.count + 1,
          lastSeenAt: event.occurredAt,
          lastSecurityEventId: event.id,
          updatedAt: new Date(now),
        };
      }

      // Trigger new or escalated signal
      itemState.lastSignalEmittedAt = now;

      if (existingSignal) {
        return {
          ...existingSignal,
          severity,
          count: existingSignal.count + 1,
          lastSeenAt: event.occurredAt,
          lastSecurityEventId: event.id,
          updatedAt: new Date(now),
        };
      }

      return {
        id: generateId("sig"),
        fingerprint: event.fingerprint,
        type: rule.type,
        severity,
        count: countInWindow,
        firstSeenAt: new Date(itemState.timestamps[0] ?? now),
        lastSeenAt: event.occurredAt,
        organizationId: event.organizationId,
        status: "new",
        lastSecurityEventId: event.id,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      };
    }

    return undefined;
  }
}

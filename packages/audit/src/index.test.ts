import { describe, expect, it } from "vitest";
import { generateId } from "@growx/ids";
import {
  calculateEventHash,
  canonicalJsonStringify,
  GENESIS_HASH,
  SecurityDetectionEngine,
  verifyAuditChain,
  type AuditEvent,
  type SecurityEvent,
} from "./index.js";

describe("Phase 22 — @growx/audit Domain & Tamper Chain", () => {
  it("produces deterministic canonical JSON with sorted keys", () => {
    const obj1 = { b: 2, a: 1, nested: { z: 9, y: 8 } };
    const obj2 = { a: 1, nested: { y: 8, z: 9 }, b: 2 };

    expect(canonicalJsonStringify(obj1)).toBe(canonicalJsonStringify(obj2));
    expect(canonicalJsonStringify(obj1)).toBe(
      '{"a":1,"b":2,"nested":{"y":8,"z":9}}',
    );
  });

  it("builds an unbroken tamper-evident audit chain of 100 events", () => {
    const events: AuditEvent[] = [];
    let prevHash = GENESIS_HASH;

    for (let i = 1; i <= 100; i++) {
      const partial = {
        id: `aud_${i}`,
        sequence: i,
        chainScope: "org:org_100",
        organizationId: "org_100",
        actorType: "user" as const,
        actorId: "usr_alice",
        action: "api_key.created",
        resourceType: "api_key",
        resourceId: `key_${i}`,
        sourceService: "api-key-service",
        privileged: false,
        outcome: "success" as const,
        metadata: { name: `Key ${i}` },
        occurredAt: new Date(1700000000000 + i * 1000),
        ingestedAt: new Date(1700000000000 + i * 1000),
        previousHash: prevHash,
      };

      const eventHash = calculateEventHash(partial);
      const fullEvent: AuditEvent = { ...partial, eventHash };
      events.push(fullEvent);
      prevHash = eventHash;
    }

    const verification = verifyAuditChain(events, GENESIS_HASH);
    expect(verification.valid).toBe(true);
  });

  it("detects tampered event content in the middle of a chain", () => {
    const events: AuditEvent[] = [];
    let prevHash = GENESIS_HASH;

    for (let i = 1; i <= 10; i++) {
      const partial = {
        id: `aud_${i}`,
        sequence: i,
        chainScope: "org:org_100",
        organizationId: "org_100",
        actorType: "user" as const,
        actorId: "usr_alice",
        action: "wallet.adjustment_applied",
        resourceType: "wallet",
        resourceId: "wal_1",
        sourceService: "credit-service",
        privileged: true,
        outcome: "success" as const,
        metadata: { amount: 100 },
        occurredAt: new Date(1700000000000 + i * 1000),
        ingestedAt: new Date(1700000000000 + i * 1000),
        previousHash: prevHash,
      };

      const eventHash = calculateEventHash(partial);
      events.push({ ...partial, eventHash });
      prevHash = eventHash;
    }

    // Tamper with event 5 metadata
    events[4]!.metadata = { amount: 1000000 };

    const verification = verifyAuditChain(events, GENESIS_HASH);
    expect(verification.valid).toBe(false);
    expect(verification.firstInvalidSequence).toBe(5);
    expect(verification.error).toContain("Tampered event payload");
  });

  it("detects deleted events (sequence gap)", () => {
    const events: AuditEvent[] = [];
    let prevHash = GENESIS_HASH;

    for (let i = 1; i <= 5; i++) {
      const partial = {
        id: `aud_${i}`,
        sequence: i,
        chainScope: "org:org_100",
        organizationId: "org_100",
        actorType: "user" as const,
        actorId: "usr_alice",
        action: "api_key.revoked",
        resourceType: "api_key",
        resourceId: `key_${i}`,
        sourceService: "api-key-service",
        privileged: false,
        outcome: "success" as const,
        metadata: {},
        occurredAt: new Date(1700000000000 + i * 1000),
        ingestedAt: new Date(1700000000000 + i * 1000),
        previousHash: prevHash,
      };

      const eventHash = calculateEventHash(partial);
      events.push({ ...partial, eventHash });
      prevHash = eventHash;
    }

    // Remove event sequence 3
    events.splice(2, 1);

    const verification = verifyAuditChain(events, GENESIS_HASH);
    expect(verification.valid).toBe(false);
    expect(verification.firstInvalidSequence).toBe(4);
    expect(verification.error).toContain("Sequence discontinuity");
  });

  it("evaluates security detection rules, windowing, cooldown, and escalation", () => {
    const engine = new SecurityDetectionEngine();
    const now = Date.now();

    // 1. Single SSRF event -> triggers High severity signal immediately (threshold = 1)
    const ssrfEvent: SecurityEvent = {
      id: generateId("sec"),
      organizationId: "org_sec_1",
      category: "network",
      type: "webhook.ssrf_attempt",
      severity: "high",
      sourceService: "webhook-service",
      fingerprint: "webhook.ssrf_attempt:org_sec_1:169.254.169.254",
      evidence: { targetUrl: "http://169.254.169.254/latest/meta-data" },
      occurredAt: new Date(now),
      ingestedAt: new Date(now),
    };

    const signal1 = engine.processEvent(ssrfEvent);
    expect(signal1).toBeDefined();
    expect(signal1!.severity).toBe("high");
    expect(signal1!.count).toBe(1);

    // 2. Immediate repeated SSRF within cooldown -> suppresses duplicate alert, increments count
    const repeatEvent: SecurityEvent = {
      ...ssrfEvent,
      id: generateId("sec"),
      occurredAt: new Date(now + 1000),
    };

    const signal2 = engine.processEvent(repeatEvent, signal1);
    expect(signal2).toBeDefined();
    expect(signal2!.count).toBe(2);

    // 3. Escalation test: threshold 1 * 3 = 3 events -> escalates High to Critical
    const thirdEvent: SecurityEvent = {
      ...ssrfEvent,
      id: generateId("sec"),
      occurredAt: new Date(now + 2000),
    };
    const signal3 = engine.processEvent(thirdEvent, signal2);
    expect(signal3).toBeDefined();
    expect(signal3!.count).toBe(3);
    expect(signal3!.severity).toBe("critical");
  });
});

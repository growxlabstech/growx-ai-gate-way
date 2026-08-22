import { describe, expect, it } from "vitest";
import { InMemoryAuditRepository } from "../src/infrastructure/in-memory-repository.js";
import { AuditService } from "../src/application/audit-service.js";

describe("Phase 22 — Concurrent Audit Append & Zero-Gap Sequences", () => {
  it("processes 100 concurrent appends for the same org yielding strictly monotonic sequence 1..100 and valid hash chain", async () => {
    const repository = new InMemoryAuditRepository();
    const auditService = new AuditService(repository);

    const promises = [];
    for (let i = 1; i <= 100; i++) {
      promises.push(
        auditService.record({
          organizationId: "org_concurrent_test",
          actorType: "api_key",
          actorId: "key_prod_1",
          action: "api_key.created",
          resourceType: "api_key",
          resourceId: `key_${i}`,
          sourceService: "api-key-service",
          metadata: { index: i },
        }),
      );
    }

    const recordedEvents = await Promise.all(promises);
    expect(recordedEvents.length).toBe(100);

    // Verify sequences are 1..100 with zero duplicates or gaps
    const sequences = recordedEvents
      .map((e) => e.sequence)
      .sort((a, b) => a - b);
    for (let i = 0; i < 100; i++) {
      expect(sequences[i]).toBe(i + 1);
    }

    // Verify cryptographic chain
    const verifyResult = await auditService.verifyChain(
      "org:org_concurrent_test",
    );
    expect(verifyResult.valid).toBe(true);
  });
});

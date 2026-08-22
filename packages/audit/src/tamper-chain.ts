import { createHash, createHmac } from "node:crypto";
import type { AuditEvent } from "./types.js";

export const GENESIS_HASH = "0".repeat(64);

/**
 * Deterministically serializes an object with sorted keys recursively.
 */
export function canonicalJsonStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalJsonStringify).join(",")}]`;
  }

  const keys = Object.keys(value as Record<string, unknown>).sort();
  const pairs = keys.map(
    (k) =>
      `${JSON.stringify(k)}:${canonicalJsonStringify(
        (value as Record<string, unknown>)[k],
      )}`,
  );
  return `{${pairs.join(",")}}`;
}

/**
 * Computes SHA-256 (or HMAC-SHA256) hash for an audit event chained to previousHash.
 */
export function calculateEventHash(
  event: Omit<AuditEvent, "eventHash">,
  secretKey?: string | undefined,
): string {
  const canonicalData = {
    id: event.id,
    sequence: event.sequence,
    chainScope: event.chainScope,
    organizationId: event.organizationId ?? null,
    workspaceId: event.workspaceId ?? null,
    actorType: event.actorType,
    actorId: event.actorId,
    action: event.action,
    resourceType: event.resourceType,
    resourceId: event.resourceId ?? null,
    sourceService: event.sourceService,
    privileged: event.privileged,
    jitSessionId: event.jitSessionId ?? null,
    breakGlass: event.breakGlass ?? false,
    outcome: event.outcome,
    metadata: event.metadata,
    occurredAt:
      event.occurredAt instanceof Date
        ? event.occurredAt.toISOString()
        : event.occurredAt,
    previousHash: event.previousHash ?? GENESIS_HASH,
  };

  const rawBytes = canonicalJsonStringify(canonicalData);

  if (secretKey) {
    return createHmac("sha256", secretKey)
      .update(rawBytes, "utf8")
      .digest("hex");
  }

  return createHash("sha256").update(rawBytes, "utf8").digest("hex");
}

export interface AuditVerificationResult {
  valid: boolean;
  firstInvalidSequence?: number | undefined;
  expectedHash?: string | undefined;
  actualHash?: string | undefined;
  error?: string | undefined;
}

/**
 * Verifies cryptographic integrity and unbroken sequence chaining across an array of audit events.
 */
export function verifyAuditChain(
  events: readonly AuditEvent[],
  initialPreviousHash: string = GENESIS_HASH,
  secretKey?: string | undefined,
): AuditVerificationResult {
  if (events.length === 0) {
    return { valid: true };
  }

  let currentPreviousHash = initialPreviousHash;
  let expectedSeq = events[0]?.sequence ?? 1;

  for (const event of events) {
    // 1. Check sequence monotonicity
    if (event.sequence !== expectedSeq) {
      return {
        valid: false,
        firstInvalidSequence: event.sequence,
        error: `Sequence discontinuity: expected ${expectedSeq}, got ${event.sequence}`,
      };
    }

    // 2. Check previousHash link
    const eventPrevHash = event.previousHash ?? GENESIS_HASH;
    if (eventPrevHash !== currentPreviousHash) {
      return {
        valid: false,
        firstInvalidSequence: event.sequence,
        expectedHash: currentPreviousHash,
        actualHash: eventPrevHash,
        error: `Broken hash chain at sequence ${event.sequence}: previousHash mismatch`,
      };
    }

    // 3. Compute and verify event hash
    const computedHash = calculateEventHash(event, secretKey);
    if (computedHash !== event.eventHash) {
      return {
        valid: false,
        firstInvalidSequence: event.sequence,
        expectedHash: computedHash,
        actualHash: event.eventHash,
        error: `Tampered event payload at sequence ${event.sequence}`,
      };
    }

    currentPreviousHash = event.eventHash!;
    expectedSeq++;
  }

  return { valid: true };
}

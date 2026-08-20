import { describe, expect, it } from "vitest";
import {
  DEFAULT_WEBHOOK_RETRY_POLICY,
  WebhookSerializer,
  calculateNextAttemptMs,
  canonicalWebhookPayload,
  classifyDeliveryOutcome,
  decryptWebhookSecret,
  encryptWebhookSecret,
  generateWebhookSecret,
  isForbiddenWebhookAddress,
  parseRetryAfterHeader,
  resolveAndValidateDns,
  signWebhook,
  validateWebhookUrl,
  verifyWebhookSignature,
} from "./index.js";

describe("Phase 21 — @growx/webhooks Package", () => {
  describe("SSRF & Network Defense", () => {
    it("identifies forbidden private and metadata IP ranges", () => {
      expect(isForbiddenWebhookAddress("127.0.0.1")).toBe(true);
      expect(isForbiddenWebhookAddress("10.0.0.5")).toBe(true);
      expect(isForbiddenWebhookAddress("192.168.1.1")).toBe(true);
      expect(isForbiddenWebhookAddress("172.20.0.1")).toBe(true);
      expect(isForbiddenWebhookAddress("169.254.169.254")).toBe(true); // AWS/GCP Metadata
      expect(isForbiddenWebhookAddress("0.0.0.0")).toBe(true);
      expect(isForbiddenWebhookAddress("224.0.0.1")).toBe(true);
      expect(isForbiddenWebhookAddress("::1")).toBe(true);
      expect(isForbiddenWebhookAddress("fe80::1")).toBe(true);

      // Public IPs allowed
      expect(isForbiddenWebhookAddress("93.184.216.34")).toBe(false);
      expect(isForbiddenWebhookAddress("8.8.8.8")).toBe(false);
    });

    it("validates webhook URLs and rejects insecure or dangerous configurations", () => {
      // Insecure HTTP in production
      expect(() => validateWebhookUrl("http://example.com/webhook")).toThrow("must use HTTPS");

      // Embedded credentials
      expect(() => validateWebhookUrl("https://admin:pass@example.com/webhook")).toThrow(
        "embedded user/password credentials"
      );

      // Forbidden hostnames
      expect(() => validateWebhookUrl("https://localhost/webhook")).toThrow("forbidden");
      expect(() => validateWebhookUrl("https://test.local/webhook")).toThrow("forbidden");
      expect(() => validateWebhookUrl("https://metadata.google.internal/webhook")).toThrow(
        "forbidden"
      );

      // Forbidden ports
      expect(() => validateWebhookUrl("https://example.com:22/webhook")).toThrow("port is not allowed");

      // Valid HTTPS URL
      const valid = validateWebhookUrl("https://api.example.com/webhook/growx");
      expect(valid.hostname).toBe("api.example.com");
    });

    it("blocks DNS rebinding when hostname resolves to private IP", async () => {
      const mockDns = {
        lookup: async () => ["169.254.169.254"], // Simulated DNS rebinding attack
      };

      await expect(
        resolveAndValidateDns("rebind-attack.example.com", mockDns)
      ).rejects.toThrow("SSRF / DNS Rebinding blocked");
    });
  });

  describe("HMAC Signing, Verification & Encryption", () => {
    const secret = "whsec_0123456789abcdef0123456789abcdef";
    const eventId = "evt_test_123";
    const timestamp = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({ type: "payment.succeeded.v1", data: { id: "pay_1" } });

    it("signs canonical payload deterministically", () => {
      const signature = signWebhook({ id: eventId, timestamp, body, secret });
      expect(signature).toMatch(/^v1=[a-f0-9]{64}$/);

      // Verifies matching signature
      const valid = verifyWebhookSignature({
        id: eventId,
        timestamp,
        body,
        signature,
        secret,
        now: timestamp,
      });
      expect(valid).toBe(true);
    });

    it("invalidates signature if body or timestamp is mutated", () => {
      const signature = signWebhook({ id: eventId, timestamp, body, secret });

      // Mutated body by 1 character
      const mutatedBody = JSON.stringify({ type: "payment.succeeded.v1", data: { id: "pay_2" } });
      const invalidBody = verifyWebhookSignature({
        id: eventId,
        timestamp,
        body: mutatedBody,
        signature,
        secret,
        now: timestamp,
      });
      expect(invalidBody).toBe(false);

      // Expired timestamp (outside tolerance window)
      const invalidTimestamp = verifyWebhookSignature({
        id: eventId,
        timestamp: timestamp - 600, // 10 minutes ago
        body,
        signature,
        secret,
        now: timestamp,
        toleranceSeconds: 300,
      });
      expect(invalidTimestamp).toBe(false);
    });

    it("encrypts and decrypts webhook signing secrets with AES-256-GCM", () => {
      const originalSecret = generateWebhookSecret();
      expect(originalSecret).toMatch(/^whsec_[a-f0-9]{48}$/);

      const encrypted = encryptWebhookSecret(originalSecret);
      expect(encrypted).toContain(":");

      const decrypted = decryptWebhookSecret(encrypted);
      expect(decrypted).toBe(originalSecret);
    });
  });

  describe("Serializers & Redaction", () => {
    it("creates safe envelope and hashes payload", () => {
      const safeData = WebhookSerializer.sanitizePaymentSucceeded({
        paymentId: "pay_abc",
        amount: "100.00",
        currency: "USD",
        status: "paid",
        paymentMethodType: "card",
      });

      const { envelope, payloadHash } = WebhookSerializer.createEnvelope({
        eventId: "evt_pay_1",
        eventType: "payment.succeeded",
        eventVersion: "v1",
        organizationId: "org_1",
        data: safeData,
      });

      expect(envelope.id).toBe("evt_pay_1");
      expect(envelope.data.paymentId).toBe("pay_abc");
      expect(payloadHash.length).toBe(64);
    });
  });

  describe("Retry Policy & Backoff", () => {
    it("calculates exponential backoff and respects Retry-After", () => {
      const policy = DEFAULT_WEBHOOK_RETRY_POLICY;

      // Attempt 1 without Retry-After (jitter disabled for test predictability)
      const delay1 = calculateNextAttemptMs(1, { ...policy, jitter: false }, undefined);
      expect(delay1).toBeGreaterThanOrEqual(1000);

      // Retry-After header parsing
      const seconds = parseRetryAfterHeader("120");
      expect(seconds).toBe(120);

      const retryAfterDelay = calculateNextAttemptMs(1, policy, seconds);
      expect(retryAfterDelay).toBe(120000);
    });

    it("classifies HTTP responses into appropriate delivery outcomes", () => {
      // 200 OK
      expect(classifyDeliveryOutcome({ responseStatus: 200, currentAttempt: 1, maxAttempts: 5 }).status).toBe("succeeded");

      // 500 Server Error on attempt 1 -> retrying
      expect(classifyDeliveryOutcome({ responseStatus: 500, currentAttempt: 1, maxAttempts: 5 }).status).toBe("retrying");

      // 500 Server Error on max attempt 5 -> dead_letter
      expect(classifyDeliveryOutcome({ responseStatus: 500, currentAttempt: 5, maxAttempts: 5 }).status).toBe("dead_letter");

      // 404 Client Error -> permanent dead_letter
      expect(classifyDeliveryOutcome({ responseStatus: 404, currentAttempt: 1, maxAttempts: 5 }).status).toBe("dead_letter");
    });
  });
});

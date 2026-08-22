import type { SemanticCacheEntry, SemanticMissReason } from "./types.js";

const NEGATION_WORDS = new Set([
  "not",
  "no",
  "never",
  "disable",
  "disabled",
  "without",
  "prevent",
  "stop",
  "deny",
  "disallow",
  "false",
]);

export interface CandidateValidationContext {
  organizationId: string;
  workspaceId: string;
  canonicalModel: string;
  systemPromptHash: string;
  policyVersion?: number | undefined;
  parametersHash: string;
  responseFormatHash?: string | undefined;
  rawUserText: string;
}

export class SemanticCacheCandidateValidator {
  /**
   * Deterministic secondary safety checks after vector similarity lookup.
   */
  static validate(
    candidate: SemanticCacheEntry,
    context: CandidateValidationContext,
  ): { valid: boolean; reason?: SemanticMissReason | undefined } {
    const now = new Date();

    // 1. Mandatory Multi-Tenant Isolation
    if (candidate.organizationId !== context.organizationId) {
      return { valid: false, reason: "policy_mismatch" };
    }

    // 2. Workspace Scope Isolation
    if (candidate.workspaceId !== context.workspaceId) {
      return { valid: false, reason: "policy_mismatch" };
    }

    // 3. Lifecycle Status & Quarantine Check
    if (candidate.status === "quarantined") {
      return { valid: false, reason: "quarantined" };
    }
    if (candidate.status === "invalidated" || candidate.status === "expired") {
      return { valid: false, reason: "expired" };
    }

    // 4. TTL Expiration
    if (candidate.expiresAt <= now) {
      return { valid: false, reason: "expired" };
    }

    // 5. System Prompt Compatibility
    if (candidate.systemPromptHash !== context.systemPromptHash) {
      return { valid: false, reason: "policy_mismatch" };
    }

    // 6. Policy Version Compatibility
    const targetPolicyVersion = context.policyVersion ?? 1;
    if (candidate.policyVersion !== targetPolicyVersion) {
      return { valid: false, reason: "policy_mismatch" };
    }

    // 7. Canonical Model Compatibility
    if (candidate.canonicalModel !== context.canonicalModel) {
      return { valid: false, reason: "model_mismatch" };
    }

    // 8. Response Format / Structured Output Compatibility
    if (candidate.responseFormatHash !== context.responseFormatHash) {
      return { valid: false, reason: "format_mismatch" };
    }

    // 9. Numeric Safety Check (e.g. "10 words" vs "100 words")
    const candidateNumbers = this.extractNumbers(candidate.semanticText);
    const queryNumbers = this.extractNumbers(context.rawUserText);
    if (!this.areSetsEqual(candidateNumbers, queryNumbers)) {
      return { valid: false, reason: "numeric_mismatch" };
    }

    // 10. Negation Polarity Safety Check (e.g. "enable logging" vs "disable logging")
    const candidateNegations = this.extractNegations(candidate.semanticText);
    const queryNegations = this.extractNegations(context.rawUserText);
    if (candidateNegations.size !== queryNegations.size) {
      return { valid: false, reason: "negation_mismatch" };
    }

    return { valid: true };
  }

  private static extractNumbers(text: string): Set<string> {
    const matches = text.match(/\b\d+(?:\.\d+)?\b/g);
    return new Set(matches ?? []);
  }

  private static extractNegations(text: string): Set<string> {
    const words = text.toLowerCase().split(/\W+/).filter(Boolean);
    const found = new Set<string>();
    for (const w of words) {
      if (NEGATION_WORDS.has(w)) {
        found.add(w);
      }
    }
    return found;
  }

  private static areSetsEqual(a: Set<string>, b: Set<string>): boolean {
    if (a.size !== b.size) return false;
    for (const item of a) {
      if (!b.has(item)) return false;
    }
    return true;
  }
}

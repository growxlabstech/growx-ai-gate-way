export class SecretRedactor {
  private static readonly SECRET_PATTERNS = [
    /sk-[a-zA-Z0-9_-]{20,}/g,
    /gsk_[a-zA-Z0-9_-]{20,}/g,
    /Bearer\s+[a-zA-Z0-9_.-]{20,}/gi,
    /-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----/g,
    /"apiKey"\s*:\s*"[^"]+"/g,
    /"secret"\s*:\s*"[^"]+"/g,
    /"rawSecret"\s*:\s*"[^"]+"/g,
    /"decryptedCredential"\s*:\s*"[^"]+"/g,
  ];

  public static redactString(input: string): string {
    if (!input) return input;
    let result = input;
    for (const pattern of this.SECRET_PATTERNS) {
      result = result.replace(pattern, (match) => {
        if (match.startsWith("Bearer ")) return "Bearer [REDACTED_SECRET]";
        if (match.startsWith('"apiKey"')) return '"apiKey":"[REDACTED_SECRET]"';
        if (match.startsWith('"secret"')) return '"secret":"[REDACTED_SECRET]"';
        if (match.startsWith('"rawSecret"')) return '"rawSecret":"[REDACTED_SECRET]"';
        if (match.startsWith('"decryptedCredential"')) return '"decryptedCredential":"[REDACTED_SECRET]"';
        return "[REDACTED_SECRET]";
      });
    }
    return result;
  }

  public static redactHeaders(headers: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(headers)) {
      const lower = key.toLowerCase();
      if (
        lower === "authorization" ||
        lower === "x-api-key" ||
        lower === "api-key" ||
        lower === "proxy-authorization" ||
        lower === "x-provider-key"
      ) {
        sanitized[key] = "[REDACTED_HEADER]";
      } else if (typeof value === "string") {
        sanitized[key] = this.redactString(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  public static redactObject<T>(obj: T): T {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === "string") return this.redactString(obj) as unknown as T;
    if (typeof obj !== "object") return obj;

    if (Array.isArray(obj)) {
      return obj.map(item => this.redactObject(item)) as unknown as T;
    }

    const copy: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      if (
        lower === "rawsecret" ||
        lower === "secret" ||
        lower === "decryptedcredential" ||
        lower === "decryptedsecret" ||
        lower === "authorization" ||
        lower === "apikey"
      ) {
        copy[key] = "[REDACTED]";
      } else {
        copy[key] = this.redactObject(value);
      }
    }
    return copy as T;
  }
}

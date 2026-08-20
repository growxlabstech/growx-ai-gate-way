const SECRET_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\bgx_(?:live|test)_[A-Za-z0-9_-]+_[A-Za-z0-9_-]+/g,
  /\b(?:sk|pk)_[A-Za-z0-9_-]{16,}\b/g,
];

export function redactSecret(value: string, replacement = "[REDACTED]"): string {
  return SECRET_PATTERNS.reduce((result, pattern) => result.replace(pattern, replacement), value);
}

export function redactValue(value: unknown): unknown {
  if (typeof value === "string") return redactSecret(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      const sensitive = /secret|token|credential|authorization|api[-_]?key|password|pepper/i.test(key);
      return [key, sensitive ? "[REDACTED]" : redactValue(item)];
    }));
  }
  return value;
}

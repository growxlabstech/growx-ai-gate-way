import type { ApiKeyRecord, ApiKeyScope, ApiKeyStatus, ModelRule } from "./types.js";

export function resolveEffectiveStatus(record: ApiKeyRecord, now = new Date()): ApiKeyStatus {
  if (record.status === "revoked" || record.revokedAt !== null) {
    return "revoked";
  }
  if (record.status === "disabled") {
    return "disabled";
  }
  if (record.status === "expired" || (record.expiresAt !== null && record.expiresAt <= now)) {
    return "expired";
  }
  return "active";
}

export function modelAllowed(rules: readonly ModelRule[], model: string): boolean {
  if (!model || typeof model !== "string") return false;

  const matches = (pattern: string) => {
    if (pattern === "*") return true;
    if (pattern.endsWith("/*")) {
      const prefix = pattern.slice(0, -2);
      return model === prefix || model.startsWith(`${prefix}/`);
    }
    if (pattern.endsWith("*")) {
      return model.startsWith(pattern.slice(0, -1));
    }
    return model === pattern;
  };

  const hasDenyMatch = rules.some((rule) => rule.effect === "deny" && matches(rule.pattern));
  if (hasDenyMatch) {
    return false;
  }

  const allowRules = rules.filter((rule) => rule.effect === "allow");
  if (allowRules.length === 0) {
    return true;
  }

  return allowRules.some((rule) => matches(rule.pattern));
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let res = 0;
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    res = (res << 8) + n;
  }
  return res >>> 0;
}

function isIpv4InCidr(ip: string, cidr: string): boolean {
  if (!cidr.includes("/")) {
    return ip === cidr;
  }
  const [range, bitsStr] = cidr.split("/");
  if (!range || !bitsStr) return false;
  const bits = Number(bitsStr);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;

  const ipInt = ipv4ToInt(ip);
  const rangeInt = ipv4ToInt(range);
  if (ipInt === null || rangeInt === null) return false;

  if (bits === 0) return true;
  const mask = ((0xffffffff << (32 - bits)) >>> 0);
  return (ipInt & mask) === (rangeInt & mask);
}

export function isIpAllowed(clientIp: string, allowlist: readonly string[]): boolean {
  if (!allowlist || allowlist.length === 0) {
    return true;
  }
  if (!clientIp) {
    return false;
  }

  const cleanIp = clientIp.trim().replace(/^::ffff:/, "");

  return allowlist.some((entry) => {
    const cleanEntry = entry.trim().replace(/^::ffff:/, "");
    if (cleanEntry === "*" || cleanEntry === "0.0.0.0/0" || cleanEntry === "::/0") {
      return true;
    }
    if (cleanEntry === cleanIp) {
      return true;
    }
    if (cleanEntry.includes(".") && cleanIp.includes(".")) {
      return isIpv4InCidr(cleanIp, cleanEntry);
    }
    if (cleanEntry.includes(":") && cleanIp.includes(":")) {
      const [prefix] = cleanEntry.split("/");
      return cleanIp.startsWith(prefix ?? cleanEntry);
    }
    return false;
  });
}

export function validateDelegation(
  creatorCapabilities: ReadonlySet<string>,
  requestedScopes: readonly ApiKeyScope[]
): { valid: boolean; unauthorizedScopes: ApiKeyScope[] } {
  const scopePermissionMap: Record<ApiKeyScope, string[]> = {
    "models.read": ["model.read"],
    "responses.create": ["apiKey.create"],
    "chat.completions.create": ["apiKey.create"],
    "embeddings.create": ["apiKey.create"],
    "usage.read": ["usage.read"],
    "analytics.read": ["analytics.read", "usage.read"],
    "files.read": ["files.read"],
    "files.create": ["files.create"],
    "files.delete": ["files.delete"],
    "batches.read": ["batches.read"],
    "batches.create": ["batches.create"],
    "batches.cancel": ["batches.cancel"],
  };

  const unauthorizedScopes: ApiKeyScope[] = [];

  for (const scope of requestedScopes) {
    const requiredPermissions = scopePermissionMap[scope] ?? ["apiKey.create"];
    const hasAny = requiredPermissions.some((perm) => creatorCapabilities.has(perm));
    if (!hasAny) {
      unauthorizedScopes.push(scope);
    }
  }

  return {
    valid: unauthorizedScopes.length === 0,
    unauthorizedScopes,
  };
}

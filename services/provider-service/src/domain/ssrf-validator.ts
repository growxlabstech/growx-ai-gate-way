import { GrowXProviderError } from "@growx/contracts";

const BLOCKED_IP_PATTERNS = [
  /^169\.254\./, // AWS / GCP / Azure link-local metadata
  /^10\./, // Private 10.0.0.0/8
  /^192\.168\./, // Private 192.168.0.0/16
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private 172.16.0.0/12
  /^127\./, // Loopback in production
  /^0\./, // Current network
  /^::1$/, // IPv6 loopback
  /^fe80:/i, // IPv6 link-local
];

export function validateProviderBaseUrl(
  urlStr: string,
  isProduction = process.env.NODE_ENV === "production",
): URL {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new GrowXProviderError(
      "provider_invalid_request",
      `Invalid provider base URL: '${urlStr}'`,
      false,
      400,
    );
  }

  // Scheme verification
  if (isProduction && parsed.protocol !== "https:") {
    throw new GrowXProviderError(
      "provider_invalid_request",
      `Provider base URL must use HTTPS in production. Received: '${parsed.protocol}'`,
      false,
      400,
    );
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new GrowXProviderError(
      "provider_invalid_request",
      `Unsupported protocol '${parsed.protocol}' for provider base URL`,
      false,
      400,
    );
  }

  const hostname = parsed.hostname.toLowerCase();

  // In production, block private IPs and loopback
  if (isProduction) {
    if (hostname === "localhost" || hostname.endsWith(".local")) {
      throw new GrowXProviderError(
        "provider_invalid_request",
        `Localhost provider base URLs are forbidden in production: '${hostname}'`,
        false,
        400,
      );
    }

    for (const pattern of BLOCKED_IP_PATTERNS) {
      if (pattern.test(hostname)) {
        throw new GrowXProviderError(
          "provider_invalid_request",
          `Provider base URL resolves to restricted private address space: '${hostname}'`,
          false,
          400,
        );
      }
    }
  }

  return parsed;
}

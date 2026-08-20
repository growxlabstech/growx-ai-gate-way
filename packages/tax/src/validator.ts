import type {
  TaxIdentifier,
  TaxIdentifierType,
  TaxIdentifierValidationStatus,
} from "./types.js";

// Regex patterns for jurisdiction-specific tax identifier syntax
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const UK_VAT_REGEX = /^GB([0-9]{9}|[0-9]{12}|(GD|HA)[0-9]{3})$/;
const US_EIN_REGEX = /^\d{2}-\d{7}$/;
const EU_VAT_REGEX = /^[A-Z]{2}[0-9A-Z+*.]{2,12}$/;

/**
 * Validates tax identifiers according to statutory syntax rules.
 * Does NOT claim government verification unless verified flag is explicitly supplied.
 */
export class TaxIdentifierValidator {
  /**
   * Validate syntax of a tax identifier.
   */
  static validate(type: TaxIdentifierType, value: string, country: string): {
    isValid: boolean;
    status: TaxIdentifierValidationStatus;
    normalizedValue: string;
    error?: string | undefined;
  } {
    const trimmed = value.trim().toUpperCase();

    if (!trimmed) {
      return {
        isValid: false,
        status: "invalid",
        normalizedValue: "",
        error: "Tax identifier value cannot be empty",
      };
    }

    switch (type) {
      case "GSTIN": {
        if (country !== "IN") {
          return {
            isValid: false,
            status: "invalid",
            normalizedValue: trimmed,
            error: "GSTIN is only valid for India (IN)",
          };
        }
        const matches = GSTIN_REGEX.test(trimmed);
        return {
          isValid: matches,
          status: matches ? "syntactically_valid" : "invalid",
          normalizedValue: trimmed,
          error: matches ? undefined : "Invalid GSTIN format (15 characters: 2 state digits + 10 PAN chars + entity/check chars)",
        };
      }

      case "PAN": {
        if (country !== "IN") {
          return {
            isValid: false,
            status: "invalid",
            normalizedValue: trimmed,
            error: "PAN is only valid for India (IN)",
          };
        }
        const matches = PAN_REGEX.test(trimmed);
        return {
          isValid: matches,
          status: matches ? "syntactically_valid" : "invalid",
          normalizedValue: trimmed,
          error: matches ? undefined : "Invalid PAN format (10 characters: 5 letters + 4 digits + 1 letter)",
        };
      }

      case "VAT_ID": {
        if (country === "GB" || country === "UK") {
          const matches = UK_VAT_REGEX.test(trimmed);
          return {
            isValid: matches,
            status: matches ? "syntactically_valid" : "invalid",
            normalizedValue: trimmed,
            error: matches ? undefined : "Invalid UK VAT ID format",
          };
        }
        const matches = EU_VAT_REGEX.test(trimmed);
        return {
          isValid: matches,
          status: matches ? "syntactically_valid" : "invalid",
          normalizedValue: trimmed,
          error: matches ? undefined : "Invalid VAT ID format",
        };
      }

      case "EIN": {
        const matches = US_EIN_REGEX.test(trimmed);
        return {
          isValid: matches,
          status: matches ? "syntactically_valid" : "invalid",
          normalizedValue: trimmed,
          error: matches ? undefined : "Invalid US EIN format (XX-XXXXXXX)",
        };
      }

      case "OTHER":
      default: {
        return {
          isValid: true,
          status: "unverified",
          normalizedValue: trimmed,
        };
      }
    }
  }

  /**
   * Helper to construct a validated TaxIdentifier object.
   */
  static createTaxIdentifier(params: {
    type: TaxIdentifierType;
    value: string;
    country: string;
    verified?: boolean;
  }): TaxIdentifier {
    const res = TaxIdentifierValidator.validate(params.type, params.value, params.country);
    return {
      type: params.type,
      value: res.normalizedValue,
      country: params.country,
      validationStatus: params.verified ? "verified" : res.status,
      verifiedAt: params.verified ? new Date() : undefined,
    };
  }
}

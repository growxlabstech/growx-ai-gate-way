import type { BillingInterval, SubscriptionPeriod } from "./types.js";

/**
 * Calculates the next billing period based on the current period,
 * billing interval, and anchor date.
 *
 * Handles calendar edge cases:
 * - Monthly: anchor day-of-month with end-of-month clamping (Jan 31 → Feb 28)
 * - Annual: full year from anchor date
 * - Timezone-aware using UTC for consistency
 */
export function calculateNextPeriod(
  currentPeriod: Pick<SubscriptionPeriod, "periodStart" | "periodEnd" | "periodNumber">,
  billingInterval: BillingInterval,
  anchorDate: Date,
): { periodStart: Date; periodEnd: Date; periodNumber: number } {
  const nextPeriodStart = new Date(currentPeriod.periodEnd);
  const periodNumber = currentPeriod.periodNumber + 1;

  let periodEnd: Date;

  switch (billingInterval) {
    case "monthly":
      periodEnd = addMonthsWithClamping(nextPeriodStart, 1, anchorDate.getUTCDate());
      break;
    case "annual":
      periodEnd = addMonthsWithClamping(nextPeriodStart, 12, anchorDate.getUTCDate());
      break;
    case "custom":
      // For custom intervals, default to 30 days
      periodEnd = new Date(nextPeriodStart);
      periodEnd.setUTCDate(periodEnd.getUTCDate() + 30);
      break;
    default:
      throw new Error(`Unknown billing interval: ${billingInterval}`);
  }

  return { periodStart: nextPeriodStart, periodEnd, periodNumber };
}

/**
 * Calculates the initial period for a new subscription.
 */
export function calculateInitialPeriod(
  startDate: Date,
  billingInterval: BillingInterval,
): { periodStart: Date; periodEnd: Date; periodNumber: number } {
  const anchorDay = startDate.getUTCDate();
  let periodEnd: Date;

  switch (billingInterval) {
    case "monthly":
      periodEnd = addMonthsWithClamping(startDate, 1, anchorDay);
      break;
    case "annual":
      periodEnd = addMonthsWithClamping(startDate, 12, anchorDay);
      break;
    case "custom":
      periodEnd = new Date(startDate);
      periodEnd.setUTCDate(periodEnd.getUTCDate() + 30);
      break;
    default:
      throw new Error(`Unknown billing interval: ${billingInterval}`);
  }

  return { periodStart: startDate, periodEnd, periodNumber: 1 };
}

/**
 * Add N months to a date, clamping to the anchor day of month.
 * Handles end-of-month: if anchor is 31 but target month has fewer days,
 * clamp to last day (e.g., Jan 31 + 1 month = Feb 28).
 */
function addMonthsWithClamping(date: Date, months: number, anchorDay: number): Date {
  const result = new Date(date);

  // Set day to 1 first to prevent month overflow (e.g., Jan 31 + 1 month → Mar 3)
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);

  // Clamp to anchor day or last day of month, whichever is smaller
  const lastDayOfMonth = getLastDayOfMonth(result.getUTCFullYear(), result.getUTCMonth());
  const targetDay = Math.min(anchorDay, lastDayOfMonth);
  result.setUTCDate(targetDay);

  // Preserve time components
  result.setUTCHours(date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds());

  return result;
}

/**
 * Returns the last day of a given month (1-indexed result, 0-indexed month input).
 */
function getLastDayOfMonth(year: number, month: number): number {
  // Day 0 of next month = last day of current month
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/**
 * Checks if a subscription period has expired (periodEnd <= now).
 */
export function isPeriodExpired(period: Pick<SubscriptionPeriod, "periodEnd">, now: Date = new Date()): boolean {
  return period.periodEnd <= now;
}

/**
 * Checks if a date falls within a period.
 */
export function isWithinPeriod(
  date: Date,
  period: Pick<SubscriptionPeriod, "periodStart" | "periodEnd">,
): boolean {
  return date >= period.periodStart && date < period.periodEnd;
}

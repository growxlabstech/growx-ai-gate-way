import type { CreditReservation, ICreditRepository } from "../domain/types.js";
import type { CreditService } from "./credit-service.js";

export interface StaleRecoveryResult {
  reservationsExamined: number;
  reservationsReleased: number;
  releasedReservationIds: string[];
}

export class StaleReservationWorker {
  constructor(
    private readonly repository: ICreditRepository,
    private readonly creditService: CreditService,
  ) {}

  /**
   * Sweeps active reservations that have exceeded their expiration TTL and releases them.
   */
  async recoverStaleReservations(
    maxAgeMs: number = 300_000,
    now: Date = new Date(),
  ): Promise<StaleRecoveryResult> {
    const cutoff = new Date(now.getTime() - maxAgeMs);
    const staleReservations =
      await this.repository.listStaleReservations(cutoff);

    let releasedCount = 0;
    const releasedIds: string[] = [];

    for (const res of staleReservations) {
      try {
        await this.creditService.releaseReservation({
          reservationId: res.id,
          reason: "stale_reservation_ttl_expired",
        });
        releasedCount++;
        releasedIds.push(res.id);
      } catch {
        // Safe skip on concurrent race
      }
    }

    return {
      reservationsExamined: staleReservations.length,
      reservationsReleased: releasedCount,
      releasedReservationIds: releasedIds,
    };
  }
}

export interface CacheMaintenanceStore {
  evictExpired(now: Date, limit: number): Promise<number>;
}
export async function maintainCache(
  store: CacheMaintenanceStore,
  batchSize = 1000,
): Promise<number> {
  if (batchSize < 1 || batchSize > 10_000)
    throw new RangeError("Invalid cache maintenance batch size");
  return store.evictExpired(new Date(), batchSize);
}

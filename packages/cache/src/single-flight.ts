export interface InFlightResult<T> {
  value: T;
  deduplicated: boolean;
}

export class SingleFlightGroup<T> {
  private inFlight = new Map<string, Promise<T>>();

  public async run(
    key: string,
    leaseTtlMs: number,
    fn: () => Promise<T>,
  ): Promise<InFlightResult<T>> {
    const existing = this.inFlight.get(key);
    if (existing) {
      const value = await existing;
      return { value, deduplicated: true };
    }

    const promise = (async () => {
      try {
        return await fn();
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, promise);
    const value = await promise;
    return { value, deduplicated: false };
  }

  public async joinOrStart(
    key: string,
    leaseTtlMs: number,
    fn: () => Promise<T>,
  ): Promise<InFlightResult<T>> {
    return this.run(key, leaseTtlMs, fn);
  }

  public get pendingCount(): number {
    return this.inFlight.size;
  }

  public clear(): void {
    this.inFlight.clear();
  }
}

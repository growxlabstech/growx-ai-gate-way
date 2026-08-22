export interface IdempotencyRecord<T> {
  tenantScope: string;
  endpoint: string;
  key: string;
  fingerprint: string;
  status: "processing" | "completed" | "failed";
  response?: T;
  responseReference?: string;
  expiresAt: Date;
}
export interface IdempotencyStore {
  find<T>(
    tenantScope: string,
    endpoint: string,
    key: string,
  ): Promise<IdempotencyRecord<T> | null>;
  claim(record: IdempotencyRecord<unknown>): Promise<boolean>;
  complete<T>(record: IdempotencyRecord<T>): Promise<void>;
}
export class IdempotencyConflictError extends Error {
  readonly code = "idempotency_key_conflict";
  readonly status = 409;
  constructor() {
    super("The idempotency key was already used with a different request.");
  }
}
export async function executeIdempotently<T>(
  store: IdempotencyStore,
  input: {
    tenantScope: string;
    endpoint: string;
    key: string;
    fingerprint: string;
    ttlSeconds: number;
  },
  execute: () => Promise<T>,
): Promise<{ value: T; replayed: boolean }> {
  const existing = await store.find<T>(
    input.tenantScope,
    input.endpoint,
    input.key,
  );
  if (existing) {
    if (existing.fingerprint !== input.fingerprint)
      throw new IdempotencyConflictError();
    if (existing.status === "completed" && existing.response !== undefined)
      return { value: existing.response, replayed: true };
    throw Object.assign(
      new Error("An execution with this idempotency key is still processing."),
      { code: "idempotency_in_progress", status: 409 },
    );
  }
  const base: IdempotencyRecord<T> = {
    tenantScope: input.tenantScope,
    endpoint: input.endpoint,
    key: input.key,
    fingerprint: input.fingerprint,
    status: "processing",
    expiresAt: new Date(Date.now() + input.ttlSeconds * 1000),
  };
  if (!(await store.claim(base)))
    return executeIdempotently(store, input, execute);
  try {
    const value = await execute();
    await store.complete({ ...base, status: "completed", response: value });
    return { value, replayed: false };
  } catch (error) {
    await store.complete({ ...base, status: "failed" });
    throw error;
  }
}

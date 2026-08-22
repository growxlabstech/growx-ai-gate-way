import { describe, expect, it } from "vitest";
import { executeIdempotently, type IdempotencyRecord } from "./index.js";
describe("idempotency", () => {
  it("replays matching requests and rejects conflicts", async () => {
    let record: IdempotencyRecord<unknown> | null = null;
    const store = {
      async find<T>() {
        return record as IdempotencyRecord<T> | null;
      },
      async claim(value: IdempotencyRecord<unknown>) {
        record = value;
        return true;
      },
      async complete<T>(value: IdempotencyRecord<T>) {
        record = value;
      },
    };
    const input = {
      tenantScope: "o:w",
      endpoint: "/v1/responses",
      key: "same",
      fingerprint: "a",
      ttlSeconds: 60,
    };
    expect(
      (await executeIdempotently(store, input, async () => 4)).replayed,
    ).toBe(false);
    expect((await executeIdempotently(store, input, async () => 5)).value).toBe(
      4,
    );
    await expect(
      executeIdempotently(store, { ...input, fingerprint: "b" }, async () => 5),
    ).rejects.toMatchObject({ code: "idempotency_key_conflict" });
  });
});

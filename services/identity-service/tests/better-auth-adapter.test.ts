import { describe, expect, it } from "vitest";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { growxBetterAuthAdapter, protectSessionToken } from "../src/better-auth-adapter";

type Factory = ReturnType<typeof drizzleAdapter>;

describe("GrowX Better Auth compatibility adapter", () => {
  it("uses a deterministic keyed representation without retaining the raw token", () => {
    const raw = "raw-session-token";
    const pepper = "p".repeat(32);
    const protectedValue = protectSessionToken(raw, pepper);
    expect(protectedValue).toBe(protectSessionToken(raw, pepper));
    expect(protectedValue).not.toBe(raw);
    expect(protectedValue).not.toContain(raw);
  });

  it("protects session tokens on create and lookup while returning the logical token", async () => {
    const writes: Array<Record<string, unknown>> = [];
    const lookups: unknown[] = [];
    const baseFactory = (() => ({
      create: async ({ data }: { data: Record<string, unknown> }) => { writes.push(data); return { ...data, expiresAt: new Date(Date.now() + 60_000) }; },
      findOne: async ({ where }: { where: unknown[] }) => { lookups.push(where); return writes[0] ?? null; },
    })) as unknown as Factory;
    const adapter = growxBetterAuthAdapter(baseFactory, { sessionPepper: "s".repeat(32), providerEncryptionSecret: "e".repeat(32) })({});
    const raw = "browser-only-session-token";
    const created = await adapter.create({ model: "sessions", data: { id: "ses_1", token: raw } });
    expect(writes[0]?.token).toBe(protectSessionToken(raw, "s".repeat(32)));
    expect(writes[0]?.token).not.toBe(raw);
    expect(created?.token).toBe(raw);
    const found = await adapter.findOne({ model: "sessions", where: [{ field: "token", value: raw }] });
    expect(lookups).toEqual([[{ field: "token", value: protectSessionToken(raw, "s".repeat(32)) }]]);
    expect((found as { token?: string } | null)?.token).toBe(raw);
  });

  it.each([
    ["revoked", { expiresAt: new Date(Date.now() + 60_000), revokedAt: new Date() }],
    ["expired", { expiresAt: new Date(Date.now() - 1) }],
  ])("fails closed for %s session rows", async (_label, stored) => {
    const baseFactory = (() => ({ findOne: async () => ({ id: "ses_1", token: "protected", ...stored }) })) as unknown as Factory;
    const adapter = growxBetterAuthAdapter(baseFactory, { sessionPepper: "s".repeat(32), providerEncryptionSecret: "e".repeat(32) })({});
    await expect(adapter.findOne({ model: "sessions", where: [{ field: "token", value: "raw" }] })).resolves.toBeNull();
  });

  it("encrypts OAuth credentials at rest and reveals them only at the adapter boundary", async () => {
    let stored: Record<string, unknown> | undefined;
    const baseFactory = (() => ({
      create: async ({ data }: { data: Record<string, unknown> }) => { stored = data; return data; },
      findOne: async () => stored ?? null,
    })) as unknown as Factory;
    const adapter = growxBetterAuthAdapter(baseFactory, { sessionPepper: "s".repeat(32), providerEncryptionSecret: "e".repeat(32) })({});
    const logical = { id: "acc_1", accessToken: "access-secret", refreshToken: "refresh-secret", idToken: "id-secret" };
    const created = await adapter.create({ model: "accounts", data: logical });
    expect(stored?.accessToken).not.toBe(logical.accessToken);
    expect(stored?.refreshToken).not.toBe(logical.refreshToken);
    expect(JSON.stringify(stored)).not.toContain("access-secret");
    expect(created).toMatchObject(logical);
    await expect(adapter.findOne({ model: "accounts", where: [{ field: "id", value: "acc_1" }] })).resolves.toMatchObject(logical);
  });
});

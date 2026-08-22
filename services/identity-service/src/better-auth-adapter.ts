import { createHash } from "node:crypto";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { decryptSecret, encryptSecret, hashToken } from "@growx/cryptography";

type AdapterFactory = ReturnType<typeof drizzleAdapter>;
type Adapter = ReturnType<AdapterFactory>;
type Where = Parameters<Adapter["findOne"]>[0]["where"][number];
const isSession = (model: string) =>
  model === "session" || model === "sessions";
const isAccount = (model: string) =>
  model === "account" || model === "accounts";
export function protectSessionToken(token: string, pepper: string): string {
  return hashToken(token, pepper);
}
function protectWhere(
  where: readonly Where[] | undefined,
  pepper: string,
): Where[] | undefined {
  return where?.map((clause) =>
    clause.field !== "token"
      ? { ...clause }
      : {
          ...clause,
          value: Array.isArray(clause.value)
            ? clause.value.map((value) =>
                protectSessionToken(String(value), pepper),
              )
            : protectSessionToken(String(clause.value), pepper),
        },
  );
}
function encryptionKey(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}
const protectedAccountFields = [
  "accessToken",
  "refreshToken",
  "idToken",
] as const;
function protectAccount(
  data: Record<string, unknown>,
  key: Buffer,
): Record<string, unknown> {
  const result = { ...data };
  for (const field of protectedAccountFields)
    if (typeof result[field] === "string")
      result[field] = encryptSecret(result[field], key);
  return result;
}
function revealAccount(data: unknown, key: Buffer): unknown {
  if (!data || typeof data !== "object") return data;
  const result = { ...(data as Record<string, unknown>) };
  for (const field of protectedAccountFields)
    if (typeof result[field] === "string")
      result[field] = decryptSecret(result[field], key);
  return result;
}
function isUsableSession(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const session = data as Record<string, unknown>;
  if (
    session.revokedAt instanceof Date ||
    typeof session.revokedAt === "string"
  )
    return false;
  const expiresAt = session.expiresAt;
  return !(expiresAt instanceof Date) || expiresAt.getTime() > Date.now();
}

/** Sole translation boundary between Better Auth logical secrets and GrowX storage. */
export function growxBetterAuthAdapter(
  baseFactory: AdapterFactory,
  secrets: { sessionPepper: string; providerEncryptionSecret: string },
): AdapterFactory {
  const key = encryptionKey(secrets.providerEncryptionSecret);
  return ((options) => {
    const base = baseFactory(options);
    return {
      ...base,
      async create(input) {
        if (isSession(input.model) && typeof input.data.token === "string") {
          const rawToken = input.data.token;
          const stored = await base.create({
            ...input,
            data: {
              ...input.data,
              token: protectSessionToken(rawToken, secrets.sessionPepper),
            },
          });
          return stored ? { ...stored, token: rawToken } : stored;
        }
        if (isAccount(input.model))
          return revealAccount(
            await base.create({
              ...input,
              data: protectAccount(input.data, key),
            }),
            key,
          );
        return base.create(input);
      },
      async findOne(input) {
        const rawToken = isSession(input.model)
          ? input.where.find(
              (item) =>
                item.field === "token" && typeof item.value === "string",
            )?.value
          : undefined;
        const result = await base.findOne(
          isSession(input.model)
            ? {
                ...input,
                where: protectWhere(input.where, secrets.sessionPepper)!,
              }
            : input,
        );
        if (isSession(input.model) && result && !isUsableSession(result))
          return null;
        if (result && typeof rawToken === "string")
          return { ...result, token: rawToken };
        return isAccount(input.model) ? revealAccount(result, key) : result;
      },
      async findMany(input) {
        const result = await base.findMany(
          isSession(input.model)
            ? {
                ...input,
                where: protectWhere(input.where, secrets.sessionPepper),
              }
            : input,
        );
        return isAccount(input.model)
          ? result.map((item) => revealAccount(item, key))
          : result;
      },
      async update(input) {
        const rawToken = isSession(input.model)
          ? input.where.find(
              (item) =>
                item.field === "token" && typeof item.value === "string",
            )?.value
          : undefined;
        const result = await base.update({
          ...input,
          where: isSession(input.model)
            ? protectWhere(input.where, secrets.sessionPepper)!
            : input.where,
          update: isAccount(input.model)
            ? protectAccount(input.update, key)
            : input.update,
        });
        if (result && typeof rawToken === "string")
          return { ...result, token: rawToken };
        return isAccount(input.model) ? revealAccount(result, key) : result;
      },
      updateMany(input) {
        return base.updateMany({
          ...input,
          where: isSession(input.model)
            ? protectWhere(input.where, secrets.sessionPepper)!
            : input.where,
          update: isAccount(input.model)
            ? protectAccount(input.update, key)
            : input.update,
        });
      },
      delete(input) {
        return base.delete({
          ...input,
          where: isSession(input.model)
            ? protectWhere(input.where, secrets.sessionPepper)!
            : input.where,
        });
      },
      deleteMany(input) {
        return base.deleteMany({
          ...input,
          where: isSession(input.model)
            ? protectWhere(input.where, secrets.sessionPepper)!
            : input.where,
        });
      },
    };
  }) as AdapterFactory;
}

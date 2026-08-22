import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { loadEnvironment } from "@growx/configuration";
import { createDatabase, schema } from "@growx/database";
import { growxBetterAuthAdapter } from "./better-auth-adapter";

const environment = loadEnvironment();
const database = createDatabase(environment.DATABASE_URL);
const databaseAdapter = growxBetterAuthAdapter(
  drizzleAdapter(database.db, {
    provider: "pg",
    schema,
    usePlural: true,
    transaction: true,
  }),
  {
    sessionPepper: environment.SERVICE_AUTH_SECRET,
    providerEncryptionSecret: environment.SERVICE_AUTH_SECRET,
  },
);
async function enqueueEmail(
  template: string,
  recipient: string,
  variables: Readonly<Record<string, string>>,
): Promise<void> {
  const response = await fetch(
    new URL("/v1/notifications", environment.NOTIFICATION_SERVICE_URL),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        channel: "email",
        template,
        recipient,
        variables,
      }),
    },
  );
  if (!response.ok)
    throw new Error("Notification service rejected authentication email");
}
const socialProviders = {
  ...(environment.GOOGLE_CLIENT_ID && environment.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: environment.GOOGLE_CLIENT_ID,
          clientSecret: environment.GOOGLE_CLIENT_SECRET,
        },
      }
    : {}),
  ...(environment.GITHUB_CLIENT_ID && environment.GITHUB_CLIENT_SECRET
    ? {
        github: {
          clientId: environment.GITHUB_CLIENT_ID,
          clientSecret: environment.GITHUB_CLIENT_SECRET,
        },
      }
    : {}),
};
export const auth = betterAuth({
  baseURL: environment.BETTER_AUTH_URL,
  basePath: "/v1/auth",
  secret: environment.BETTER_AUTH_SECRET,
  logger: { level: environment.NODE_ENV === "development" ? "debug" : "warn" },
  onAPIError: {
    onError(error) {
      const message =
        error instanceof Error ? error.message : "Unknown authentication error";
      console.error("[identity] authentication request failed:", message);
    },
  },
  database: databaseAdapter,
  // A database session row intentionally contains only the protected lookup
  // value. Better Auth's stock session-list response would expose that value as
  // though it were a bearer token, so these token-returning routes fail closed.
  // GrowX session-management endpoints expose metadata only.
  disabledPaths: ["/list-sessions", "/revoke-session"],
  user: { fields: { image: "avatarUrl" } },
  session: {
    fields: { token: "tokenHash", updatedAt: "lastActivityAt" },
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    freshAge: 60 * 60,
    cookieCache: { enabled: false },
  },
  account: {
    fields: {
      password: "passwordHash",
      accessToken: "accessTokenEncrypted",
      refreshToken: "refreshTokenEncrypted",
      idToken: "idTokenEncrypted",
    },
    accountLinking: {
      enabled: true,
      trustedProviders: ["google", "github"],
      allowDifferentEmails: false,
      requireLocalEmailVerified: true,
      allowUnlinkingAll: false,
    },
  },
  trustedOrigins: [environment.PUBLIC_APP_URL ?? "http://localhost:3000"],
  emailAndPassword: { enabled: false },
  socialProviders,
  advanced: {
    useSecureCookies: environment.NODE_ENV === "production",
    crossSubDomainCookies: { enabled: false },
  },
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 600,
      allowedAttempts: 5,
      storeOTP: "hashed",
      resendStrategy: "rotate",
      rateLimit: { window: 60, max: 3 },
      disableSignUp: false,
      sendVerificationOTP: async ({ email, otp, type }) =>
        enqueueEmail("auth-otp", email, { otp, type, expiresInMinutes: "10" }),
    }),
  ],
});

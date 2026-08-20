import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export * from "drizzle-orm";
export * from "./schema.js";
export * as schema from "./schema.js";

export function createDatabase(databaseUrl: string) {
  const client = postgres(databaseUrl, { max: 10, idle_timeout: 20 });
  return {
    db: drizzle(client),
    healthCheck: async () => {
      await client`select 1`;
    },
    close: async () => client.end(),
  };
}

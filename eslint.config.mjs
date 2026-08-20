import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(["**/.next/**", "**/dist/**", "**/coverage/**", ".pnpm-store/**", "next-env.d.ts"]),
  { files: ["**/*.{ts,tsx,mjs}"], rules: { "no-console": "error" } },
]);

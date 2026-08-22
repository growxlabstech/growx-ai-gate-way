import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { openSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const runtime = resolve(root, ".runtime");
const common = {
  ...process.env,
  DATABASE_URL: "postgresql://growx:growx@127.0.0.1:55432/growx",
  REDIS_URL: "redis://127.0.0.1:6379",
  SERVICE_AUTH_SECRET: randomBytes(48).toString("base64url"),
  BETTER_AUTH_SECRET: randomBytes(48).toString("base64url"),
  BETTER_AUTH_URL: "http://localhost:4000",
  PUBLIC_APP_URL: "http://localhost:3000",
  NOTIFICATION_SERVICE_URL: "http://localhost:4013",
};

function launch(name, filter, port) {
  const output = openSync(resolve(runtime, `${name}-live.log`), "a");
  const error = openSync(resolve(runtime, `${name}-live.err.log`), "a");
  const child = spawn(
    process.env.ComSpec ?? "cmd.exe",
    ["/d", "/s", "/c", "pnpm.cmd", "--filter", filter, "dev"],
    {
      cwd: root,
      detached: true,
      env: { ...common, PORT: String(port) },
      stdio: ["ignore", output, error],
      windowsHide: true,
    },
  );
  child.unref();
}

const target = process.argv[2] ?? "all";
if (target === "all" || target === "identity")
  launch("identity", "@growx/identity-service", 4000);
if (target === "all" || target === "notification")
  launch("notification", "@growx/notification-service", 4013);

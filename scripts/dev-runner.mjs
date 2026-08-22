import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";
const pnpmCmd = isWindows ? "pnpm.cmd" : "pnpm";

console.log(
  "Starting all GrowX applications on ports 3000, 3001, 3002, 3003...",
);

const child = spawn(
  pnpmCmd,
  [
    "--parallel",
    "--filter",
    "@growx/console",
    "--filter",
    "@growx/admin",
    "--filter",
    "@growx/docs",
    "--filter",
    "@growx/www",
    "dev",
  ],
  {
    cwd: "c:\\growxlabs\\growx-ai",
    stdio: "inherit",
    shell: false,
  },
);

child.on("exit", (code) => {
  console.log(`Server runner exited with code ${code}.`);
});

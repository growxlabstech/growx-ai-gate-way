import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
const root = process.cwd();
const roots = ["apps", "packages", "services", "workers", "sdk", "openapi"];
const ignored = new Set(["node_modules", "dist", ".next", ".turbo"]);
const findings = [];
const rules = [
  {
    name: "disabled TLS verification",
    pattern:
      /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["']?0/,
  },
  {
    name: "wildcard CORS",
    pattern: /Access-Control-Allow-Origin["']?\s*[:,]\s*["']\*/,
  },
  {
    name: "unbounded retry loop",
    pattern: /while\s*\(\s*true\s*\)[\s\S]{0,300}(?:fetch|request)\s*\(/,
  },
  {
    name: "plaintext GrowX secret",
    pattern: /gx_(?:live|test)_key_[a-f0-9]{32}_[A-Za-z0-9_-]{20,}/,
  },
  {
    name: "embedded provider secret",
    pattern: /(?:sk-proj-|sk-ant-)[A-Za-z0-9_-]{12,}/,
  },
];
async function walk(path) {
  for (const name of await readdir(path)) {
    if (ignored.has(name)) continue;
    const file = join(path, name);
    const metadata = await stat(file);
    if (metadata.isDirectory()) await walk(file);
    else if (/\.(?:ts|tsx|js|mjs|json|ya?ml)$/.test(name)) {
      const source = await readFile(file, "utf8");
      for (const rule of rules)
        if (rule.pattern.test(source))
          findings.push(`${relative(root, file)}: ${rule.name}`);
    }
  }
}
for (const directory of roots) await walk(join(root, directory));
if (findings.length) {
  process.stderr.write(`${findings.join("\n")}\n`);
  process.exitCode = 1;
} else process.stdout.write("Security policy scan passed.\n");

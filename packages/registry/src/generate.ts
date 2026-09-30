/**
 * Writes the registry snapshot that tinycast.store and the Tinycast extension read.
 *
 *   node src/generate.ts [--out <file>]
 *
 * Runs at build time. There is no server: the site is redeployed on a schedule, and the
 * browser falls back to querying GitHub directly when the snapshot is missing.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { discover } from "./github.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const args = process.argv.slice(2);
const outFlag = args.indexOf("--out");
const out = resolve(outFlag >= 0 ? args[outFlag + 1]! : resolve(root, "apps/web/public/registry.json"));

function githubToken(): string | undefined {
  const fromEnv = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (fromEnv) return fromEnv;
  try {
    // Convenience for local runs. Silent when `gh` is missing or logged out.
    return execFileSync("gh", ["auth", "token"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || undefined;
  } catch {
    return undefined;
  }
}

const config = JSON.parse(readFileSync(resolve(root, "registry.config.json"), "utf8")) as {
  include?: string[];
  exclude?: string[];
};

const token = githubToken();
if (!token) console.warn("No GITHUB_TOKEN or `gh` login: using the anonymous rate limit (60 requests/hour).");

const registry = await discover({
  token,
  releases: true,
  include: config.include,
  exclude: config.exclude,
  onSkip: (repo, reason) => console.log(`  skipped ${repo}: ${reason}`),
});
registry.origin = "snapshot";

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(registry, null, 2)}\n`);

const extensions = registry.listings.filter((l) => l.kind === "extension").length;
console.log(`registry: ${extensions} extensions, ${registry.listings.length - extensions} packages -> ${out}`);

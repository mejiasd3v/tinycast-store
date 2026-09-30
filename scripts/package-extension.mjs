/**
 * Builds the Tinycast Store extension and zips it for tinycast.store to serve, so a first install
 * needs no toolchain: unzip, then Settings › Extensions › Add Folder.
 *
 *   node scripts/package-extension.mjs
 *
 * The zip holds one folder, `tinycast-store/`, with exactly what Tinycast keeps of an extension:
 * package.json, one <command>.js per command, and assets/.
 */
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const extension = join(root, "apps/extension");
const dist = join(extension, "dist");
const output = join(root, "apps/web/public/tinycast-store.zip");
const FOLDER = "tinycast-store";

// `-C`, not `--filter`: the workspace root shares the extension's package name.
execFileSync("pnpm", ["-C", extension, "build"], { stdio: "inherit" });

const { commands } = JSON.parse(readFileSync(join(dist, "package.json"), "utf8"));
const staging = mkdtempSync(join(tmpdir(), "tinycast-store-zip-"));
try {
  const folder = join(staging, FOLDER);
  mkdirSync(folder);
  for (const item of ["package.json", "assets", ...commands.map((c) => `${c.name}.js`)]) {
    cpSync(join(dist, item), join(folder, item), { recursive: true });
  }

  mkdirSync(dirname(output), { recursive: true });
  rmSync(output, { force: true });
  // -X drops macOS extra attributes so the zip is the same on every machine.
  execFileSync("zip", ["-qrX", output, FOLDER], { cwd: staging });
  console.log(`extension: ${output}`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}

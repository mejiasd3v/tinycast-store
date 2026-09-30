import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Listing, ListingInstall } from "@tinycast-store/registry";
import { pathsFor, type TinycastPaths } from "../src/installed.ts";
import { systemDeps, type Deps, type Run } from "../src/system.ts";

export const hasZip = spawnSync("zip", ["-v"]).status === 0;

export type Files = Record<string, string>;

/** Builds a zip from a file map. Keys are paths inside the archive. */
export async function makeZip(files: Files): Promise<Uint8Array> {
  const work = await mkdtemp(join(tmpdir(), "fixture-"));
  const content = join(work, "content");
  const archive = join(work, "out.zip");
  try {
    for (const [path, data] of Object.entries(files)) {
      await mkdir(dirname(join(content, path)), { recursive: true });
      await writeFile(join(content, path), data);
    }
    execFileSync("zip", ["-qr", archive, "."], { cwd: content });
    return new Uint8Array(await readFile(archive));
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

export const manifest = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    name: "thing",
    title: "Thing",
    commands: [{ name: "run", title: "Run", mode: "view" }],
    ...extra,
  });

/** A built extension: what `ray build` leaves behind, plus the clutter a repo carries. */
export const builtFiles = (prefix = "", extra: Record<string, unknown> = {}): Files => ({
  [`${prefix}package.json`]: manifest(extra),
  [`${prefix}run.js`]: "module.exports = 1;",
  [`${prefix}run.js.map`]: "{}",
  [`${prefix}assets/icon.png`]: "png",
  [`${prefix}README.md`]: "# hi",
  [`${prefix}node_modules/dep/index.js`]: "dep",
});

export function listing(install: ListingInstall, overrides: Partial<Listing> = {}): Listing {
  return {
    id: "acme/thing",
    kind: "extension",
    owner: { login: "acme", avatarUrl: "" },
    repo: "thing",
    url: "https://github.com/acme/thing",
    stars: 1,
    topics: ["tinycast-extension"],
    pushedAt: "2026-09-01T00:00:00Z",
    defaultBranch: "main",
    install,
    ...overrides,
  };
}

export interface Sandbox {
  deps: Deps;
  paths: TinycastPaths;
  /** URLs requested through `deps.download`. */
  downloads: string[];
  supportRoot: string;
  cleanup: () => Promise<void>;
}

/** A private stand-in for `~/Library/Application Support/<bundle id>`. `archives` maps URL to bytes. */
export async function sandbox(archives: Record<string, Uint8Array>, overrides: Partial<Deps> = {}): Promise<Sandbox> {
  const root = await mkdtemp(join(tmpdir(), "tinycast-app-"));
  const real = systemDeps();
  const downloads: string[] = [];

  // `ditto` is macOS-only; CI on Linux gets `unzip`, which reads the same archives.
  const run: Run = (file, args, options) =>
    file === "/usr/bin/ditto" && !existsSync(file)
      ? real.run("unzip", ["-q", args[2]!, "-d", args[3]!], options)
      : real.run(file, args, options);

  const deps: Deps = {
    ...real,
    run,
    tmpdir: root,
    now: () => new Date("2026-09-30T12:00:00Z"),
    download: async (url) => {
      downloads.push(url);
      const bytes = archives[url];
      if (!bytes) throw new Error(`Download failed (404): ${url}`);
      return bytes;
    },
    ...overrides,
  };
  const supportRoot = join(root, "com.tinycast.app");
  return {
    deps,
    paths: pathsFor(join(supportRoot, "extension-support", "tinycast-store")),
    downloads,
    supportRoot,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

/** Names of everything directly inside a directory, dot-folders included. A missing folder is empty. */
export async function names(dir: string): Promise<string[]> {
  return (await readdir(dir).catch(() => [])).sort();
}

import { join } from "path";
import { parseManifest, type Listing, type ListingInstall, type ListingManifest } from "@tinycast-store/registry";
import { extensionFolder, writeReceipt, type Receipt, type TinycastPaths } from "./installed.ts";
import type { Deps } from "./system.ts";

const DITTO = "/usr/bin/ditto";
const CP = "/bin/cp";
const BUILD_TIMEOUT_MS = 300_000;

/** A failure with a message fit to show a person as-is. */
export class InstallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstallError";
  }
}

export interface InstallResult {
  manifest: ListingManifest;
  directory: string;
  receipt: Receipt;
}

export type Progress = (step: string) => void;

/**
 * Turns a listing into an extension folder Tinycast can load, mirroring what Tinycast's own
 * installer leaves behind: `package.json`, the built `<command>.js` files and `assets/`, nothing else.
 *
 * The new copy is staged next to the destination and swapped in with a rename, so a failure at
 * any step leaves an existing install exactly as it was.
 */
export async function installListing(
  listing: Listing,
  deps: Deps,
  paths: TinycastPaths,
  onProgress: Progress = () => {},
): Promise<InstallResult> {
  const install = listing.install;
  if (listing.kind !== "extension" || !install) {
    throw new InstallError(`${listing.id} is a package, not a single extension. Add it in Settings › Extensions › Registries.`);
  }

  const workspace = await deps.fs.mkdtemp(join(deps.tmpdir, "tinycast-store-"));
  try {
    onProgress("Downloading…");
    const source = await extractArchive(listing.id, install, workspace, deps);
    const built = install.strategy === "source" ? await buildFromSource(source, workspace, deps, onProgress) : source;

    onProgress("Installing…");
    const { manifest, directory } = await place(built, paths, deps);
    const receipt: Receipt = { repo: listing.id, ref: install.ref, strategy: install.strategy, installedAt: deps.now().toISOString() };
    await writeReceipt(deps.fs, paths.receiptsFile, manifest.name, receipt);
    return { manifest, directory, receipt };
  } finally {
    await deps.fs.rm(workspace, { recursive: true, force: true });
  }
}

/** Where each strategy's bytes come from. Branches are fetched as `refs/heads/<ref>` to stay unambiguous. */
function archiveUrl(repo: string, install: ListingInstall): string {
  if (install.strategy === "release") {
    if (!install.zipUrl) throw new InstallError(`${repo} has no release archive to download.`);
    return install.zipUrl;
  }
  return `https://codeload.github.com/${repo}/zip/refs/heads/${install.ref}`;
}

/** Downloads and unzips, returning the folder that holds `package.json`. */
async function extractArchive(repo: string, install: ListingInstall, workspace: string, deps: Deps): Promise<string> {
  const archive = join(workspace, "archive.zip");
  const expanded = join(workspace, "expanded");
  await deps.fs.writeFile(archive, await deps.download(archiveUrl(repo, install)));
  await deps.fs.mkdir(expanded, { recursive: true });

  // `ditto` ships with macOS, keeps file modes, and reads GitHub's zips. There is no unzip in JS land.
  const result = await deps.run(DITTO, ["-x", "-k", archive, expanded]);
  if (result.status !== 0) throw new InstallError(`Couldn't unpack the download: ${tail(result.output)}`);
  return locateManifestRoot(expanded, deps);
}

/** The archive root, or its only folder: GitHub wraps a repo in `<repo>-<ref>/`. */
async function locateManifestRoot(directory: string, deps: Deps): Promise<string> {
  if (await exists(join(directory, "package.json"), deps)) return directory;
  const children = (await deps.fs.readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(directory, entry.name));
  for (const child of children) {
    if (await exists(join(child, "package.json"), deps)) return child;
  }
  throw new InstallError("The download doesn't contain an extension (no package.json).");
}

/**
 * Last resort, for repositories that ship source only. Runs the project's own `ray build` rather
 * than its `build` script, and skips lifecycle scripts, so the only code executed is the toolchain's.
 * A login shell is used because a launcher app inherits none of the PATH that finds Node.
 */
async function buildFromSource(source: string, workspace: string, deps: Deps, onProgress: Progress): Promise<string> {
  const out = join(workspace, "build");
  const manager = await packageManager(source, deps);

  onProgress(`Installing dependencies with ${manager}…`);
  await shell(`${manager} install --ignore-scripts`, source, deps);

  onProgress("Building…");
  await shell(`node_modules/.bin/ray build -e dist -o ${quote(out)}`, source, deps);
  return out;
}

async function packageManager(source: string, deps: Deps): Promise<"pnpm" | "yarn" | "npm"> {
  if (await exists(join(source, "pnpm-lock.yaml"), deps)) return "pnpm";
  if (await exists(join(source, "yarn.lock"), deps)) return "yarn";
  return "npm";
}

/** Common Node install locations, ahead of whatever the login shell finds. */
const EXTRA_PATH = ["$HOME/.local/share/mise/shims", "$HOME/.volta/bin", "/opt/homebrew/bin", "/usr/local/bin"].join(":");

async function shell(command: string, cwd: string, deps: Deps): Promise<void> {
  const result = await deps.run("/bin/zsh", ["-lc", `export PATH="${EXTRA_PATH}:$PATH"; ${command}`], {
    cwd,
    timeoutMs: BUILD_TIMEOUT_MS,
  });
  if (result.status !== 0) {
    throw new InstallError(
      `Building from source failed (needs Node and a package manager on this Mac): ${tail(result.output)}`,
    );
  }
}

function quote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/** The end of the output, which is where package managers put the actual error. */
function tail(output: string): string {
  const lines = output.trim().split("\n").filter(Boolean).slice(-6);
  return lines.length > 0 ? lines.join("\n") : "no output";
}

async function exists(path: string, deps: Deps): Promise<boolean> {
  return deps.fs.stat(path).then(
    () => true,
    () => false,
  );
}

/** Copies the runnable parts of `built` into place, replacing any existing install atomically. */
async function place(built: string, paths: TinycastPaths, deps: Deps): Promise<{ manifest: ListingManifest; directory: string }> {
  const manifest = parseManifest(JSON.parse(await deps.fs.readFile(join(built, "package.json"), "utf8")));
  if (!manifest) {
    throw new InstallError("This isn't an installable macOS extension: its package.json needs a name and at least one command.");
  }

  const commands: string[] = [];
  for (const command of manifest.commands) {
    if (await exists(join(built, `${command.name}.js`), deps)) commands.push(`${command.name}.js`);
  }
  if (commands.length === 0) {
    throw new InstallError(`${manifest.title} has no built command bundles (${manifest.commands[0]!.name}.js). It has to be built with \`ray build\` first.`);
  }

  const folder = extensionFolder(manifest.name);
  const destination = join(paths.extensionsDir, folder);
  await deps.fs.mkdir(paths.extensionsDir, { recursive: true });
  // Dot-prefixed, so Tinycast's scan ignores it while it is half-built.
  const staging = await deps.fs.mkdtemp(join(paths.extensionsDir, `.${folder}-`));
  const previous = `${staging}.previous`;
  let displaced = false;

  try {
    const items = ["package.json", ...commands, ...((await exists(join(built, "assets"), deps)) ? ["assets"] : [])];
    const copy = await deps.run(CP, ["-R", ...items.map((item) => join(built, item)), `${staging}/`]);
    if (copy.status !== 0) throw new InstallError(`Couldn't copy the extension into place: ${tail(copy.output)}`);

    if (await exists(destination, deps)) {
      await deps.fs.rename(destination, previous);
      displaced = true;
    }
    await deps.fs.rename(staging, destination);
    if (displaced) await deps.fs.rm(previous, { recursive: true, force: true });
    return { manifest, directory: destination };
  } catch (error) {
    if (displaced) await deps.fs.rename(previous, destination).catch(() => {});
    await deps.fs.rm(staging, { recursive: true, force: true });
    throw error;
  }
}

import { dirname, join } from "path";
import type { InstallStrategy, Listing } from "@tinycast-store/registry";
import type { FileSystem } from "./system.ts";

/** Where Tinycast keeps extensions, and where this extension keeps its own bookkeeping. */
export interface TinycastPaths {
  extensionsDir: string;
  /** Per-extension scratch folders, one under `extension-support`. */
  supportRoot: string;
  /** Per-extension saved data (`LocalStorage`, `Cache`, preferences), one JSON file each. */
  dataDir: string;
  receiptsFile: string;
}

/**
 * Tinycast hands every extension `<App Support>/<bundle id>/extension-support/<name>` as
 * `environment.supportPath`, so the extensions folder is two levels up and one over. Deriving it
 * keeps release and dev builds of Tinycast (different bundle ids) apart without hard-coding either.
 */
export function pathsFor(supportPath: string): TinycastPaths {
  const appSupport = dirname(dirname(supportPath));
  return {
    extensionsDir: join(appSupport, "extensions"),
    supportRoot: dirname(supportPath),
    dataDir: join(appSupport, "extension-data"),
    receiptsFile: join(supportPath, "installed.json"),
  };
}

/**
 * Tinycast keeps these two names apart, and so must we: the extension's own folder only swaps
 * slashes (`ExtensionCatalog.install`), while its scratch and data files also drop the `@`
 * (`ExtensionCatalog.safeName`). Get one wrong and files are orphaned or the wrong ones removed.
 */
export const extensionFolder = (name: string) => name.replaceAll("/", "-");
export const dataName = (name: string) => name.replaceAll("/", "-").replaceAll("@", "");

/** What we installed, from where. Tinycast's own manifest carries none of this. */
export interface Receipt {
  repo: string;
  /** Release tag for `release` installs, otherwise the branch. */
  ref: string;
  strategy: InstallStrategy;
  installedAt: string;
}

/** Keyed by the extension's manifest `name`. */
export type Receipts = Record<string, Receipt>;

export async function readReceipts(fs: FileSystem, file: string): Promise<Receipts> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(file, "utf8"));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Receipts) : {};
  } catch {
    // Missing on first run; unreadable means we lose update hints, never the installs themselves.
    return {};
  }
}

export async function removeReceipt(fs: FileSystem, file: string, name: string): Promise<void> {
  const receipts = await readReceipts(fs, file);
  delete receipts[name];
  await fs.writeFile(file, `${JSON.stringify(receipts, null, 2)}\n`);
}

export async function writeReceipt(fs: FileSystem, file: string, name: string, receipt: Receipt): Promise<void> {
  const receipts = await readReceipts(fs, file);
  receipts[name] = receipt;
  await fs.mkdir(dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(receipts, null, 2)}\n`);
}

export interface InstalledExtension {
  /** The manifest `name`. */
  name: string;
  title: string;
  receipt?: Receipt;
}

/** Every extension folder Tinycast can see, with our receipt where we made the install. */
export async function scanInstalled(fs: FileSystem, paths: TinycastPaths): Promise<InstalledExtension[]> {
  let entries;
  try {
    entries = await fs.readdir(paths.extensionsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const receipts = await readReceipts(fs, paths.receiptsFile);

  const installed: InstalledExtension[] = [];
  for (const entry of entries) {
    // Dot-folders are our own staging areas; Tinycast skips them too.
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    try {
      const manifest: unknown = JSON.parse(await fs.readFile(join(paths.extensionsDir, entry.name, "package.json"), "utf8"));
      const { name, title } = manifest as { name?: unknown; title?: unknown };
      if (typeof name === "string") {
        installed.push({ name, title: typeof title === "string" ? title : name, receipt: receipts[name] });
      }
    } catch {
      // Half-written or foreign folder: not ours to report.
    }
  }
  return installed;
}

export type InstallState =
  | { kind: "available" }
  | { kind: "installed"; receipt?: Receipt }
  | { kind: "update"; receipt: Receipt; latest: string };

/**
 * `update` only when we can prove it: a release install whose tag moved. Branch installs have no
 * cheap "newer" signal, so they stay `installed` and offer Reinstall.
 */
export function installState(listing: Listing, installed: InstalledExtension[]): InstallState {
  const id = listing.id.toLowerCase();
  const match = installed.find(
    (e) => e.receipt?.repo.toLowerCase() === id || (listing.manifest && e.name === listing.manifest.name),
  );
  if (!match) return { kind: "available" };

  const { receipt } = match;
  const latest = listing.install;
  if (receipt && latest?.strategy === "release" && receipt.strategy === "release" && receipt.ref !== latest.ref) {
    return { kind: "update", receipt, latest: latest.ref };
  }
  return { kind: "installed", receipt };
}

/** The user already approved this repository when they first installed it. */
export function isTrusted(listing: Listing, state: InstallState): boolean {
  return state.kind !== "available" && state.receipt?.repo.toLowerCase() === listing.id.toLowerCase();
}

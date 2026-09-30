import { join } from "path";
import { isSafePackageName } from "@tinycast-store/registry";
import { dataName, extensionFolder, readReceipts, removeReceipt, type TinycastPaths } from "./installed.ts";
import type { Deps } from "./system.ts";

/** Something the person should hear about as written. */
export class UninstallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UninstallError";
  }
}

/** This extension's own manifest name; removing it would pull the rug out from under the caller. */
const SELF = "tinycast-store";

/**
 * Removes an extension this one installed: its folder, scratch folder and saved data, then the
 * receipt. Tinycast's own uninstall also clears things only the app can reach (Keychain sign-ins,
 * shortcuts, aliases, icon choices, its in-memory state), so those stay behind.
 *
 * Only receipts count as ownership. Extensions installed any other way, such as ones the person
 * built or imported from Raycast, are left for Tinycast's Settings to remove.
 */
export async function uninstallExtension(name: string, deps: Deps, paths: TinycastPaths): Promise<void> {
  if (name === SELF) {
    throw new UninstallError("The Tinycast Store can't uninstall itself. Remove it in Settings › Extensions.");
  }
  // The name becomes a path we delete recursively, so it gets the same check as at install time.
  if (!isSafePackageName(name) || !Object.hasOwn(await readReceipts(deps.fs, paths.receiptsFile), name)) {
    throw new UninstallError(`${name} wasn't installed by the Tinycast Store. Remove it in Settings › Extensions.`);
  }

  const gone = { recursive: true, force: true } as const;
  await deps.fs.rm(join(paths.extensionsDir, extensionFolder(name)), gone);
  await deps.fs.rm(join(paths.supportRoot, dataName(name)), gone);
  await deps.fs.rm(join(paths.dataDir, `${dataName(name)}.json`), gone);
  // Last, so a failure above leaves the receipt and the uninstall can be retried.
  await removeReceipt(deps.fs, paths.receiptsFile, name);
}

import type { CommandMode, ListingCommand, ListingManifest } from "./types.ts";

const MODES: readonly CommandMode[] = ["view", "no-view", "menu-bar"];

/**
 * `name` becomes a folder under Tinycast's extensions directory and a command name becomes
 * `<name>.js` read from the download. Neither may contain a path separator or be `.` / `..`;
 * a name of `..` would otherwise resolve to Tinycast's whole support directory.
 * Follows npm's rules: an optional `@scope/`, then lowercase letters, digits, `.`, `_`, `-`.
 */
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;
const COMMAND_NAME = /^[a-z0-9][a-z0-9._-]*$/i;

/** True when `name` is safe to turn into a folder name. Use before deleting or writing by name. */
export function isSafePackageName(name: string): boolean {
  return PACKAGE_NAME.test(name);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.flatMap((v) => text(v) ?? []) : [];
}

function parseCommand(value: unknown): ListingCommand | undefined {
  if (!isRecord(value)) return undefined;
  const name = text(value.name);
  if (!name) return undefined;
  const mode = MODES.find((m) => m === value.mode) ?? "view";
  return {
    name,
    title: text(value.title) ?? name,
    description: text(value.description),
    mode,
  };
}

/**
 * Reads a Raycast-format `package.json`. Returns `undefined` when the repo is not
 * an installable macOS extension: no name, no commands, or macOS excluded.
 */
export function parseManifest(input: unknown): ListingManifest | undefined {
  if (!isRecord(input)) return undefined;
  const name = text(input.name);
  if (!name || !isSafePackageName(name) || !Array.isArray(input.commands)) return undefined;

  const commands = input.commands.flatMap((c) => parseCommand(c) ?? []);
  if (commands.length === 0) return undefined;
  // One hostile command name is a signal about the whole repo: refuse it rather than trim it.
  if (commands.some((c) => !COMMAND_NAME.test(c.name))) return undefined;

  const platforms = strings(input.platforms);
  if (platforms.length > 0 && !platforms.some((p) => p.toLowerCase() === "macos")) {
    return undefined;
  }

  return {
    name,
    title: text(input.title) ?? name,
    description: text(input.description),
    icon: text(input.icon),
    author: text(input.author),
    version: text(input.version),
    categories: strings(input.categories),
    commands,
  };
}

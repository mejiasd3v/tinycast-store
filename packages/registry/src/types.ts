/** GitHub topics that put a repository on tinycast.store. */
export const TOPICS = {
  extension: "tinycast-extension",
  package: "tinycast-package",
} as const;

/**
 * `extension`: a repo whose root is one Tinycast (Raycast-format) extension.
 * `package`: a repo that bundles several extensions or other Tinycast content.
 */
export type ListingKind = "extension" | "package";

export type CommandMode = "view" | "no-view" | "menu-bar";

export interface ListingCommand {
  name: string;
  title: string;
  description?: string;
  mode: CommandMode;
}

/** The parts of an extension's `package.json` the store shows and installs from. */
export interface ListingManifest {
  name: string;
  title: string;
  description?: string;
  /** File name inside `assets/`. */
  icon?: string;
  author?: string;
  version?: string;
  categories: string[];
  commands: ListingCommand[];
}

/**
 * How Tinycast gets the built bundle (`package.json`, `<command>.js`, `assets/`):
 * - `release`: a zip attached to the latest GitHub release. No toolchain needed.
 * - `repo`: the repository root already contains the built `<command>.js`.
 * - `source`: has to be built with Node and `ray build`.
 */
export type InstallStrategy = "release" | "repo" | "source";

export interface ListingInstall {
  strategy: InstallStrategy;
  /** Release tag for `release`, otherwise the default branch. */
  ref: string;
  /** Direct download for `release`. */
  zipUrl?: string;
}

export interface Listing {
  /** `owner/repo`, as GitHub spells it. */
  id: string;
  kind: ListingKind;
  owner: { login: string; avatarUrl: string };
  repo: string;
  url: string;
  homepage?: string;
  description?: string;
  stars: number;
  license?: string;
  topics: string[];
  pushedAt: string;
  defaultBranch: string;
  manifest?: ListingManifest;
  iconUrl?: string;
  install?: ListingInstall;
}

export interface Registry {
  version: 1;
  generatedAt: string;
  /** `snapshot` was built by `pnpm registry:generate`; `live` was queried from GitHub in the browser. */
  origin: "snapshot" | "live";
  listings: Listing[];
}

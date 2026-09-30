import { parseManifest } from "./manifest.ts";
import {
  TOPICS,
  type Listing,
  type ListingInstall,
  type ListingManifest,
  type Registry,
} from "./types.ts";

type Fetch = typeof fetch;

export interface DiscoverOptions {
  /** Raises the GitHub API limit from 60 to 5000 requests an hour. Server-side only. */
  token?: string;
  fetch?: Fetch;
  /** Look up the latest release of each extension for a prebuilt zip. One API call each. */
  releases?: boolean;
  /** `owner/repo` entries to index even without a topic. */
  include?: string[];
  /** `owner/repo` entries to hide. */
  exclude?: string[];
  concurrency?: number;
  /** Called for every repository that carries a topic but is left out. */
  onSkip?: (repo: string, reason: string) => void;
}

export class GitHubError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "GitHubError";
    this.status = status;
  }
}

interface GitHubRepo {
  full_name: string;
  name: string;
  owner: { login: string; avatar_url: string };
  html_url: string;
  homepage: string | null;
  description: string | null;
  stargazers_count: number;
  license: { spdx_id: string | null } | null;
  topics?: string[];
  pushed_at: string;
  default_branch: string;
  archived: boolean;
  private?: boolean;
}

interface GitHubRelease {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  assets: { name: string; browser_download_url: string; content_type?: string }[];
}

const API = "https://api.github.com";
const RAW = "https://raw.githubusercontent.com";
const PAGE_SIZE = 100;
/** The search API stops at 1000 results. */
const MAX_PAGES = 10;

function rawUrl(fullName: string, ref: string, path: string): string {
  return `${RAW}/${fullName}/${encodeURIComponent(ref)}/${path}`;
}

export function iconUrl(fullName: string, ref: string, icon: string): string {
  return rawUrl(fullName, ref, `assets/${icon}`);
}

class Client {
  private readonly fetcher: Fetch;
  private readonly token: string | undefined;

  constructor(fetcher: Fetch | undefined, token: string | undefined) {
    // Bound: browsers throw "Illegal invocation" if the global fetch is called as a method of another object.
    this.fetcher = fetcher ?? globalThis.fetch.bind(globalThis);
    this.token = token;
  }

  async api<T>(path: string): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const response = await this.fetcher(`${API}${path}`, { headers });
    if (!response.ok) throw await githubError(response);
    return (await response.json()) as T;
  }

  /** `undefined` for a missing file, since repositories legitimately lack these. */
  async rawJson(url: string): Promise<unknown> {
    const response = await this.fetcher(url);
    if (!response.ok) return undefined;
    try {
      return await response.json();
    } catch {
      return undefined;
    }
  }

  async exists(url: string): Promise<boolean> {
    try {
      return (await this.fetcher(url, { method: "HEAD" })).ok;
    } catch {
      return false;
    }
  }
}

async function githubError(response: Response): Promise<GitHubError> {
  const remaining = response.headers.get("x-ratelimit-remaining");
  let detail = response.statusText;
  try {
    const body = (await response.json()) as { message?: string };
    if (body.message) detail = body.message;
  } catch {
    // Keep the status text.
  }
  const limited = response.status === 429 || (response.status === 403 && remaining === "0");
  const reset = response.headers.get("x-ratelimit-reset");
  const when = limited && reset ? ` Resets at ${new Date(Number(reset) * 1000).toISOString()}.` : "";
  return new GitHubError(
    response.status,
    `GitHub ${response.status}${limited ? " (rate limited)" : ""}: ${detail}.${when}`,
  );
}

async function searchTopic(client: Client, topic: string): Promise<GitHubRepo[]> {
  const repos: GitHubRepo[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const query = new URLSearchParams({
      q: `topic:${topic}`,
      sort: "updated",
      per_page: String(PAGE_SIZE),
      page: String(page),
    });
    const result = await client.api<{ items: GitHubRepo[] }>(`/search/repositories?${query}`);
    repos.push(...result.items);
    if (result.items.length < PAGE_SIZE) break;
  }
  return repos;
}

async function latestZip(
  client: Client,
  repo: GitHubRepo,
  manifest: ListingManifest,
): Promise<ListingInstall | undefined> {
  let release: GitHubRelease;
  try {
    release = await client.api<GitHubRelease>(`/repos/${repo.full_name}/releases/latest`);
  } catch {
    // No releases is normal (404); a rate limit shouldn't sink the whole listing either.
    return undefined;
  }
  if (release.draft || release.prerelease) return undefined;
  const zips = release.assets.filter((a) => a.name.toLowerCase().endsWith(".zip"));
  const asset = zips.find((a) => a.name.toLowerCase().includes(manifest.name.split("/").pop()!.toLowerCase())) ?? zips[0];
  if (!asset) return undefined;
  return { strategy: "release", ref: release.tag_name, zipUrl: asset.browser_download_url };
}

async function detectInstall(
  client: Client,
  repo: GitHubRepo,
  manifest: ListingManifest,
  releases: boolean,
): Promise<ListingInstall> {
  if (releases) {
    const release = await latestZip(client, repo, manifest);
    if (release) return release;
  }
  const first = manifest.commands[0]!;
  const prebuilt = await client.exists(rawUrl(repo.full_name, repo.default_branch, `${first.name}.js`));
  return { strategy: prebuilt ? "repo" : "source", ref: repo.default_branch };
}

async function toListing(
  client: Client,
  repo: GitHubRepo,
  options: DiscoverOptions,
  forceExtension: boolean,
): Promise<Listing | { skip: string }> {
  const topics = repo.topics ?? [];
  const wantsExtension = forceExtension || topics.includes(TOPICS.extension);
  const wantsPackage = topics.includes(TOPICS.package);

  let manifest: ListingManifest | undefined;
  if (wantsExtension) {
    manifest = parseManifest(
      await client.rawJson(rawUrl(repo.full_name, repo.default_branch, "package.json")),
    );
    if (!manifest && !wantsPackage) {
      return { skip: "no installable extension manifest (package.json with commands) at the repo root" };
    }
  }

  const listing: Listing = {
    id: repo.full_name,
    kind: manifest ? "extension" : "package",
    owner: { login: repo.owner.login, avatarUrl: repo.owner.avatar_url },
    repo: repo.name,
    url: repo.html_url,
    homepage: repo.homepage || undefined,
    description: manifest?.description ?? repo.description ?? undefined,
    stars: repo.stargazers_count,
    license: repo.license?.spdx_id && repo.license.spdx_id !== "NOASSERTION" ? repo.license.spdx_id : undefined,
    topics,
    pushedAt: repo.pushed_at,
    defaultBranch: repo.default_branch,
  };

  if (manifest) {
    listing.manifest = manifest;
    if (manifest.icon) listing.iconUrl = iconUrl(repo.full_name, repo.default_branch, manifest.icon);
    listing.install = await detectInstall(client, repo, manifest, options.releases ?? false);
  }
  return listing;
}

async function mapPool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index]!);
      }
    }),
  );
  return results;
}

/** Newest activity first among equal stars, so fresh work isn't buried. */
export function sortListings(listings: Listing[]): Listing[] {
  return [...listings].sort(
    (a, b) => b.stars - a.stars || b.pushedAt.localeCompare(a.pushedAt) || a.id.localeCompare(b.id),
  );
}

/** Every public repository carrying one of the Tinycast topics, checked and enriched. */
export async function discover(options: DiscoverOptions = {}): Promise<Registry> {
  const client = new Client(options.fetch, options.token);
  const exclude = new Set((options.exclude ?? []).map((id) => id.toLowerCase()));
  const skip = (id: string, reason: string) => options.onSkip?.(id, reason);

  const found = new Map<string, { repo: GitHubRepo; forced: boolean }>();
  for (const topic of Object.values(TOPICS)) {
    for (const repo of await searchTopic(client, topic)) {
      found.set(repo.full_name.toLowerCase(), { repo, forced: false });
    }
  }
  for (const id of options.include ?? []) {
    if (found.has(id.toLowerCase())) continue;
    found.set(id.toLowerCase(), { repo: await client.api<GitHubRepo>(`/repos/${id}`), forced: true });
  }

  const candidates = [...found.entries()].filter(([key, { repo }]) => {
    const reason = exclude.has(key) ? "excluded by registry.config.json" : repo.archived ? "archived" : undefined;
    if (reason) skip(repo.full_name, reason);
    return !reason;
  });

  const results = await mapPool(candidates, options.concurrency ?? 6, ([, { repo, forced }]) =>
    toListing(client, repo, options, forced),
  );

  const listings: Listing[] = [];
  results.forEach((result, index) => {
    if ("skip" in result) skip(candidates[index]![1].repo.full_name, result.skip);
    else listings.push(result);
  });

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    origin: "live",
    listings: sortListings(listings),
  };
}

/** One repository, always with a release lookup. Used at install time, so it is never stale. */
export async function resolveRepo(
  fullName: string,
  options: Pick<DiscoverOptions, "token" | "fetch"> = {},
): Promise<Listing> {
  const client = new Client(options.fetch, options.token);
  const repo = await client.api<GitHubRepo>(`/repos/${fullName}`);
  const result = await toListing(client, repo, { releases: true }, true);
  if ("skip" in result) throw new Error(`${fullName} isn't installable: ${result.skip}.`);
  return result;
}

/** `owner/repo`, or a github.com URL to one. */
export function parseRepoId(input: string): string | undefined {
  const match = input
    .trim()
    .match(/^(?:https?:\/\/)?(?:www\.)?(?:github\.com\/)?([A-Za-z0-9-_.]+)\/([A-Za-z0-9-_.]+?)(?:\.git)?(?:[/?#].*)?$/);
  return match ? `${match[1]}/${match[2]}` : undefined;
}

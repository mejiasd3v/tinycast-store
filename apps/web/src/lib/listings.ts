import type { Listing, ListingKind } from "@tinycast-store/registry";

export type KindFilter = ListingKind | "all";
export type SortKey = "popular" | "updated" | "name";

export interface Filters {
  query: string;
  kind: KindFilter;
  sort: SortKey;
}

function searchText(listing: Listing): string {
  const { manifest } = listing;
  return [
    listing.id,
    listing.description,
    manifest?.title,
    manifest?.author,
    ...(manifest?.categories ?? []),
    ...(manifest?.commands.map((c) => c.title) ?? []),
    ...listing.topics,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

const title = (l: Listing) => l.manifest?.title ?? l.repo;

const sorters: Record<SortKey, (a: Listing, b: Listing) => number> = {
  popular: (a, b) => b.stars - a.stars || b.pushedAt.localeCompare(a.pushedAt),
  updated: (a, b) => b.pushedAt.localeCompare(a.pushedAt),
  name: (a, b) => title(a).localeCompare(title(b)),
};

/** Every word of the query must appear somewhere in the listing. */
export function filterListings(listings: Listing[], { query, kind, sort }: Filters): Listing[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return listings
    .filter((l) => kind === "all" || l.kind === kind)
    .filter((l) => {
      const haystack = searchText(l);
      return words.every((w) => haystack.includes(w));
    })
    .sort(sorters[sort]);
}

/**
 * Tinycast has no web-to-app install action, but it does run any installed command from a
 * `tinycast://extensions/<owner>/<extension>/<command>` link. The Store extension's `install`
 * command takes the repository as an argument.
 */
export function installLink(repoId: string): string {
  const args = encodeURIComponent(JSON.stringify({ repo: repoId }));
  return `tinycast://extensions/tinycast/tinycast-store/install?arguments=${args}`;
}

export const installMethod = {
  release: { label: "Prebuilt", detail: "Downloads the latest release. No developer tools needed." },
  repo: { label: "Prebuilt", detail: "The repository ships built commands. No developer tools needed." },
  source: { label: "Builds from source", detail: "Needs Node.js and a package manager on your Mac." },
} as const;

export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "")}k`;
}

export function timeAgo(iso: string, now = Date.now()): string {
  const days = Math.floor((now - Date.parse(iso)) / 86_400_000);
  if (days < 1) return "today";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

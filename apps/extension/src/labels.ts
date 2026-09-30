import type { Listing, ListingInstall } from "@tinycast-store/registry";

/** How this extension is addressed by tinycast:// links; the owner segment is only a hint. */
const INSTALL_LINK = "tinycast://extensions/tinycast/tinycast-store/install";

/** The link tinycast.store puts behind its Install button. */
export function installLink(repo: string): string {
  return `${INSTALL_LINK}?arguments=${encodeURIComponent(JSON.stringify({ repo }))}`;
}

export function isPrebuilt(install: ListingInstall | undefined): boolean {
  return install?.strategy === "release" || install?.strategy === "repo";
}

export function methodTag(install: ListingInstall | undefined): string {
  return isPrebuilt(install) ? "Prebuilt" : "Builds from source";
}

export function methodDescription(install: ListingInstall | undefined): string {
  switch (install?.strategy) {
    case "release":
      return `Prebuilt release ${install.ref}`;
    case "repo":
      return "Prebuilt, straight from the repository";
    default:
      return "Built on this Mac (needs Node and a package manager)";
  }
}

export function author(listing: Listing): string {
  return listing.manifest?.author ?? listing.owner.login;
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

/** The detail pane body. Metadata (author, stars, license…) sits beside it, not in it. */
export function detailMarkdown(listing: Listing): string {
  const title = listing.manifest?.title ?? listing.repo;
  const parts = [`# ${title}`];
  if (listing.description) parts.push(listing.description);

  if (listing.manifest) {
    const commands = listing.manifest.commands.map(
      (c) => `- **${c.title}** _(${c.mode})_${c.description ? `: ${c.description}` : ""}`,
    );
    parts.push(`## Commands\n\n${commands.join("\n")}`);
  } else {
    parts.push(
      "## Package\n\nThis repository bundles several extensions. To use it, add the repository URL in " +
        "**Settings › Extensions › Registries**, then install from there.",
    );
  }
  return parts.join("\n\n");
}

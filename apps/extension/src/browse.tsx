import { Icon, List, Toast, openExtensionPreferences, showToast } from "@raycast/api";
import { resolveRepo, type Listing } from "@tinycast-store/registry";
import { useMemo, useState } from "react";
import { installState, isTrusted, type InstallState } from "./installed.ts";
import { ListingItem } from "./listing-item.tsx";
import { useRegistry } from "./registry.ts";
import { confirmInstall, installHere, uninstallHere, useInstalled } from "./tinycast.ts";

interface Row {
  listing: Listing;
  state: InstallState;
}

/** Updates first, then what is installed, then everything else; packages are a different kind of thing. */
function sections(rows: Row[]): { title: string; rows: Row[] }[] {
  const extensions = rows.filter((r) => r.listing.kind === "extension");
  return [
    { title: "Updates available", rows: extensions.filter((r) => r.state.kind === "update") },
    { title: "Installed", rows: extensions.filter((r) => r.state.kind === "installed") },
    { title: "Extensions", rows: extensions.filter((r) => r.state.kind === "available") },
    { title: "Packages", rows: rows.filter((r) => r.listing.kind === "package") },
  ].filter((section) => section.rows.length > 0);
}

export default function Browse() {
  const { registry, error, isLoading, reload } = useRegistry();
  const { installed, reload: reloadInstalled } = useInstalled();
  const [showDetail, setShowDetail] = useState(true);

  const rows = useMemo(
    () => (registry?.listings ?? []).map((listing) => ({ listing, state: installState(listing, installed) })),
    [registry, installed],
  );

  async function install({ listing, state }: Row) {
    if (!isTrusted(listing, state) && !(await confirmInstall(listing))) return;

    const title = listing.manifest?.title ?? listing.repo;
    const toast = await showToast({ style: Toast.Style.Animated, title: `Installing ${title}`, message: "Checking the latest release…" });
    try {
      // The list may be minutes old; install whatever the repository ships right now.
      const fresh = await resolveRepo(listing.id);
      const result = await installHere(fresh, (step) => (toast.message = step));
      // Each assignment reaches the screen on its own, so the style flips last.
      toast.title = `Installed ${result.manifest.title}`;
      toast.message = "Open Extensions settings to activate it";
      toast.primaryAction = { title: "Open Extensions Settings", onAction: () => void openExtensionPreferences() };
      toast.style = Toast.Style.Success;
      await reloadInstalled();
    } catch (e) {
      toast.title = `Couldn't install ${title}`;
      toast.message = e instanceof Error ? e.message : String(e);
      toast.style = Toast.Style.Failure;
    }
  }

  async function uninstall({ listing }: Row) {
    const extension = installed.find((e) => e.receipt?.repo.toLowerCase() === listing.id.toLowerCase());
    if (extension && (await uninstallHere(extension))) await reloadInstalled();
  }

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={showDetail && rows.length > 0}
      searchBarPlaceholder="Search Tinycast extensions"
    >
      {sections(rows).map((section) => (
        <List.Section key={section.title} title={section.title} subtitle={String(section.rows.length)}>
          {section.rows.map((row) => (
            <ListingItem
              key={row.listing.id}
              listing={row.listing}
              state={row.state}
              showDetail={showDetail}
              onInstall={() => void install(row)}
              onUninstall={row.state.kind !== "available" && row.state.receipt ? () => void uninstall(row) : undefined}
              onToggleDetail={() => setShowDetail((shown) => !shown)}
              onRefresh={() => void reload()}
            />
          ))}
        </List.Section>
      ))}
      {!isLoading && rows.length === 0 && (
        <List.EmptyView
          icon={Icon.Box}
          title={error ? "Couldn't load extensions" : "No extensions yet"}
          description={error ?? "Tag a public GitHub repository with the tinycast-extension topic to list it here."}
        />
      )}
    </List>
  );
}

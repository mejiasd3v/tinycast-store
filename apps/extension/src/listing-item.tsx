import { Action, ActionPanel, Color, Icon, Image, List } from "@raycast/api";
import type { Listing } from "@tinycast-store/registry";
import type { InstallState } from "./installed.ts";
import { author, detailMarkdown, formatDate, installLink, methodDescription, methodTag } from "./labels.ts";

interface Props {
  listing: Listing;
  state: InstallState;
  showDetail: boolean;
  onInstall: () => void;
  /** Only for extensions the Store installed; anything else is removed in Tinycast's Settings. */
  onUninstall?: () => void;
  onToggleDetail: () => void;
  onRefresh: () => void;
}

/** What the primary action is called, given what is on disk. */
function installVerb(state: InstallState): string {
  switch (state.kind) {
    case "update":
      return `Update to ${state.latest}`;
    case "installed":
      return "Reinstall";
    default:
      return "Install";
  }
}

function accessories(listing: Listing, state: InstallState, showDetail: boolean): List.Item.Accessory[] {
  const items: List.Item.Accessory[] = [];
  if (state.kind === "update") items.push({ tag: { value: "Update", color: Color.Blue } });
  if (state.kind === "installed") {
    items.push({ icon: { source: Icon.CheckCircle, tintColor: Color.Green }, tooltip: "Installed" });
  }
  // The detail pane already says how it installs; the row only has room for it when the pane is closed.
  if (listing.install && !showDetail) items.push({ tag: methodTag(listing.install) });
  items.push({ icon: Icon.Star, text: String(listing.stars), tooltip: "GitHub stars" });
  return items;
}

export function ListingItem({ listing, state, showDetail, onInstall, onUninstall, onToggleDetail, onRefresh }: Props) {
  const { manifest } = listing;
  const isExtension = listing.kind === "extension";

  const install = isExtension ? (
    <Action title={installVerb(state)} icon={Icon.Download} onAction={onInstall} />
  ) : null;

  return (
    <List.Item
      id={listing.id}
      title={manifest?.title ?? listing.repo}
      subtitle={author(listing)}
      icon={listing.iconUrl ? { source: listing.iconUrl, fallback: Icon.Box } : Icon.Box}
      keywords={[
        listing.id,
        listing.description ?? "",
        ...(manifest?.categories ?? []),
        ...(manifest?.commands.map((c) => c.title) ?? []),
        ...listing.topics,
      ]}
      accessories={accessories(listing, state, showDetail)}
      detail={
        <List.Item.Detail
          markdown={detailMarkdown(listing)}
          metadata={
            <List.Item.Detail.Metadata>
              <List.Item.Detail.Metadata.Label
                title="Author"
                text={author(listing)}
                icon={{ source: listing.owner.avatarUrl, mask: Image.Mask.Circle }}
              />
              <List.Item.Detail.Metadata.Label title="Stars" text={String(listing.stars)} icon={Icon.Star} />
              {listing.install && (
                <List.Item.Detail.Metadata.Label title="Installs as" text={methodDescription(listing.install)} />
              )}
              {listing.license && <List.Item.Detail.Metadata.Label title="License" text={listing.license} />}
              <List.Item.Detail.Metadata.Label title="Updated" text={formatDate(listing.pushedAt)} />
              {manifest && manifest.categories.length > 0 && (
                <List.Item.Detail.Metadata.TagList title="Categories">
                  {manifest.categories.map((category) => (
                    <List.Item.Detail.Metadata.TagList.Item key={category} text={category} />
                  ))}
                </List.Item.Detail.Metadata.TagList>
              )}
              <List.Item.Detail.Metadata.Separator />
              <List.Item.Detail.Metadata.Link title="Repository" text={listing.id} target={listing.url} />
            </List.Item.Detail.Metadata>
          }
        />
      }
      actions={
        <ActionPanel>
          {install}
          <Action.OpenInBrowser title="Open on GitHub" url={listing.url} />
          <Action.CopyToClipboard title="Copy Repository URL" content={listing.url} />
          {isExtension && <Action.CopyToClipboard title="Copy Install Link" content={installLink(listing.id)} />}
          {onUninstall && (
            <ActionPanel.Section>
              <Action
                title="Uninstall"
                icon={Icon.Trash}
                style={Action.Style.Destructive}
                shortcut={{ modifiers: ["ctrl"], key: "x" }}
                onAction={onUninstall}
              />
            </ActionPanel.Section>
          )}
          <ActionPanel.Section>
            <Action
              title={showDetail ? "Hide Details" : "Show Details"}
              icon={Icon.Sidebar}
              shortcut={{ modifiers: ["cmd"], key: "d" }}
              onAction={onToggleDetail}
            />
            <Action
              title="Refresh List"
              icon={Icon.ArrowClockwise}
              shortcut={{ modifiers: ["cmd"], key: "r" }}
              onAction={onRefresh}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

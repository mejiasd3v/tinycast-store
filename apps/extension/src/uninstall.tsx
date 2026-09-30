import { Action, ActionPanel, Icon, List } from "@raycast/api";
import { uninstallHere, useInstalled } from "./tinycast.ts";

/**
 * Lists what the Store installed. Extensions from anywhere else are left to Tinycast's Settings,
 * which also cleans up the parts of Tinycast this extension can't reach.
 */
export default function Uninstall() {
  const { installed, isLoading, reload } = useInstalled();
  const ours = installed.filter((extension) => extension.receipt);

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Search extensions installed from the Store">
      {ours.map((extension) => (
        <List.Item
          key={extension.name}
          title={extension.title}
          subtitle={extension.receipt?.repo}
          icon={Icon.Box}
          actions={
            <ActionPanel>
              <Action
                title="Uninstall"
                icon={Icon.Trash}
                style={Action.Style.Destructive}
                onAction={async () => {
                  if (await uninstallHere(extension)) await reload();
                }}
              />
              {extension.receipt && (
                <Action.OpenInBrowser title="Open on GitHub" url={`https://github.com/${extension.receipt.repo}`} />
              )}
            </ActionPanel>
          }
        />
      ))}
      {!isLoading && ours.length === 0 && (
        <List.EmptyView
          icon={Icon.Box}
          title="Nothing to uninstall"
          description="Extensions you install from the Tinycast Store show up here. Others can be removed in Settings › Extensions."
        />
      )}
    </List>
  );
}

import { openExtensionPreferences, showHUD, type LaunchProps } from "@raycast/api";
import { parseRepoId, resolveRepo } from "@tinycast-store/registry";
import { installState, isTrusted } from "./installed.ts";
import { confirmInstall, installHere, scanHere } from "./tinycast.ts";

/**
 * Headless install, reached from the `install` command's argument or from a
 * tinycast://extensions/tinycast/tinycast-store/install?arguments={"repo":"owner/repo"} link.
 * Results go through HUDs: with the palette closed, a toast has nowhere to appear.
 */
export default async function Command(props: LaunchProps<{ arguments: Arguments.Install }>) {
  // Links are external input: an omitted argument may arrive as undefined rather than "".
  const input = props.arguments.repo ?? "";
  const repo = parseRepoId(input);
  if (!repo) {
    return showHUD(input ? `"${input}" isn't a GitHub repository. Use owner/repo.` : "Enter a repository as owner/repo.");
  }

  try {
    const listing = await resolveRepo(repo);
    const trusted = isTrusted(listing, installState(listing, await scanHere()));
    if (!trusted && !(await confirmInstall(listing))) return showHUD("Installation cancelled");

    const title = listing.manifest?.title ?? listing.repo;
    await showHUD(`Installing ${title}…`);
    await installHere(listing);

    await showHUD(`Installed ${title}. Open Settings › Extensions to activate it.`);
    // Tinycast rescans installed extensions when this pane opens, which is what makes the new one appear.
    await openExtensionPreferences();
  } catch (error) {
    await showHUD(`Couldn't install: ${firstLine(error)}`);
  }
}

function firstLine(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.split("\n")[0]!.slice(0, 160);
}

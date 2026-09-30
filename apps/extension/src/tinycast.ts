import { Alert, Toast, confirmAlert, environment, openExtensionPreferences, showToast } from "@raycast/api";
import { useCallback, useEffect, useState } from "react";
import type { Listing } from "@tinycast-store/registry";
import { pathsFor, scanInstalled, type InstalledExtension } from "./installed.ts";
import { installListing, type InstallResult, type Progress } from "./installer.ts";
import { author, methodDescription } from "./labels.ts";
import { systemDeps } from "./system.ts";
import { uninstallExtension } from "./uninstaller.ts";

// Everything here touches Raycast/Tinycast APIs; the logic it drives lives in installer.ts.

/**
 * Extensions execute arbitrary code with the user's permissions, so nothing installs without a
 * clear yes. Also the only guard on the tinycast:// link, which anyone can put on a web page.
 * Declining, or running where alerts are suppressed (background runs), means no.
 */
export async function confirmInstall(listing: Listing): Promise<boolean> {
  const title = listing.manifest?.title ?? listing.repo;
  const confirmed = await confirmAlert({
    title: `Install ${title}?`,
    message:
      `${listing.id}\nby ${author(listing)} · ${listing.stars} stars\n${methodDescription(listing.install)}\n\n` +
      "Extensions run code on your Mac with your permissions. Only install from authors you trust.",
    primaryAction: { title: "Install", style: Alert.ActionStyle.Destructive },
    dismissAction: { title: "Cancel" },
  });
  return confirmed === true;
}

/** Installs into the Tinycast this extension is running in. */
export function installHere(listing: Listing, onProgress?: Progress): Promise<InstallResult> {
  return installListing(listing, systemDeps(), pathsFor(environment.supportPath), onProgress);
}

/**
 * Confirms, removes and reports. Returns whether it was removed, so a caller can refresh its list.
 * The alert names what stays behind, because Tinycast's own state is out of this extension's reach.
 */
export async function uninstallHere(extension: InstalledExtension): Promise<boolean> {
  const confirmed = await confirmAlert({
    title: `Uninstall ${extension.title}?`,
    message:
      "Removes the extension and the data it saved. Shortcuts, aliases and sign-ins you set up for it " +
      "stay in Tinycast's settings and can be cleared there.",
    primaryAction: { title: "Uninstall", style: Alert.ActionStyle.Destructive },
    dismissAction: { title: "Cancel" },
  });
  if (confirmed !== true) return false;

  const toast = await showToast({ style: Toast.Style.Animated, title: `Uninstalling ${extension.title}` });
  try {
    await uninstallExtension(extension.name, systemDeps(), pathsFor(environment.supportPath));
    toast.title = `Uninstalled ${extension.title}`;
    toast.message = "Open Extensions settings to refresh Tinycast";
    toast.primaryAction = { title: "Open Extensions Settings", onAction: () => void openExtensionPreferences() };
    toast.style = Toast.Style.Success;
    return true;
  } catch (e) {
    toast.title = `Couldn't uninstall ${extension.title}`;
    toast.message = e instanceof Error ? e.message : String(e);
    toast.style = Toast.Style.Failure;
    return false;
  }
}

/** The extensions Tinycast has on disk, read fresh. */
export function scanHere(): Promise<InstalledExtension[]> {
  return scanInstalled(systemDeps().fs, pathsFor(environment.supportPath));
}

export function useInstalled() {
  const [installed, setInstalled] = useState<InstalledExtension[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const reload = useCallback(async () => {
    setInstalled(await scanHere());
    setIsLoading(false);
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { installed, isLoading, reload };
}

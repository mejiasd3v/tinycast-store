import type { Listing } from "@tinycast-store/registry";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** The extension's own icon, then its owner's avatar, then an initial. */
export function ListingIcon({ listing, className }: { listing: Listing; className?: string }) {
  const sources = [listing.iconUrl, listing.owner.avatarUrl].filter((s): s is string => Boolean(s));
  const [failed, setFailed] = useState(0);
  const src = sources[failed];
  const title = listing.manifest?.title ?? listing.repo;

  return (
    <div className={cn("grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/10", className)}>
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          className="size-full object-cover"
          onError={() => setFailed((n) => n + 1)}
        />
      ) : (
        <span className="text-lg font-semibold text-muted-foreground">{title.charAt(0).toUpperCase()}</span>
      )}
    </div>
  );
}

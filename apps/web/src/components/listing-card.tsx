import type { Listing } from "@tinycast-store/registry";
import { Package, Star } from "lucide-react";
import { ListingIcon } from "@/components/listing-icon";
import { Badge } from "@/components/ui/badge";
import { formatCount, installMethod, timeAgo } from "@/lib/listings";

export function ListingCard({ listing, onOpen }: { listing: Listing; onOpen: () => void }) {
  const title = listing.manifest?.title ?? listing.repo;
  const method = listing.install ? installMethod[listing.install.strategy] : undefined;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex h-full flex-col gap-3 rounded-2xl bg-card p-4 text-left ring-1 ring-foreground/10 transition-[box-shadow,transform] hover:ring-foreground/25 focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]"
    >
      <div className="flex items-center gap-3">
        <ListingIcon listing={listing} />
        <div className="min-w-0">
          <h3 className="truncate font-medium text-card-foreground">{title}</h3>
          <p className="truncate text-sm text-muted-foreground">{listing.owner.login}</p>
        </div>
      </div>

      <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">
        {listing.description ?? "No description yet."}
      </p>

      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
        {listing.kind === "package" ? (
          <Badge variant="secondary">
            <Package /> Package
          </Badge>
        ) : (
          method && <Badge variant={listing.install?.strategy === "source" ? "outline" : "secondary"}>{method.label}</Badge>
        )}
        <span className="inline-flex items-center gap-1">
          <Star className="size-3.5" aria-hidden /> {formatCount(listing.stars)}
        </span>
        {listing.manifest && (
          <span>
            {listing.manifest.commands.length} command{listing.manifest.commands.length === 1 ? "" : "s"}
          </span>
        )}
        <span className="ml-auto">{timeAgo(listing.pushedAt)}</span>
      </div>
    </button>
  );
}

export function ListingCardSkeleton() {
  return (
    <div className="flex h-44 flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10" aria-hidden>
      <div className="flex items-center gap-3">
        <div className="size-11 animate-pulse rounded-xl bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="h-3 w-full animate-pulse rounded bg-muted" />
      <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
    </div>
  );
}

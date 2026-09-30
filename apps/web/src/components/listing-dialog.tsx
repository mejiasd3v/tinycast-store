import type { Listing } from "@tinycast-store/registry";
import { ExternalLink, Scale, ShieldAlert, Star } from "lucide-react";
import { ButtonLink } from "@/components/button-link";
import { CopyButton } from "@/components/copy-button";
import { GitHubMark } from "@/components/github-mark";
import { ListingIcon } from "@/components/listing-icon";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCount, installLink, installMethod, timeAgo } from "@/lib/listings";

const MODE_LABEL = { view: "View", "no-view": "Background", "menu-bar": "Menu bar" } as const;

export function ListingDialog({ listing, onClose }: { listing: Listing | undefined; onClose: () => void }) {
  return (
    <Dialog open={Boolean(listing)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        {listing && <Body listing={listing} />}
      </DialogContent>
    </Dialog>
  );
}

function Body({ listing }: { listing: Listing }) {
  const title = listing.manifest?.title ?? listing.repo;
  const method = listing.install ? installMethod[listing.install.strategy] : undefined;

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-3">
          <ListingIcon listing={listing} className="size-14 rounded-2xl" />
          <div className="min-w-0">
            <DialogTitle className="truncate text-lg">{title}</DialogTitle>
            <DialogDescription className="truncate">
              by{" "}
              <a className="underline-offset-4 hover:underline" href={`https://github.com/${listing.owner.login}`} target="_blank" rel="noreferrer">
                {listing.owner.login}
              </a>
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <p className="text-sm text-foreground/80">{listing.description ?? "No description yet."}</p>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary">
          <Star /> {formatCount(listing.stars)}
        </Badge>
        {listing.license && (
          <Badge variant="secondary">
            <Scale /> {listing.license}
          </Badge>
        )}
        <span>Updated {timeAgo(listing.pushedAt)}</span>
      </div>

      {listing.kind === "extension" ? <ExtensionInstall listing={listing} method={method?.detail} /> : <PackageInstall listing={listing} />}

      {listing.manifest && (
        <section aria-labelledby="commands-heading" className="space-y-2">
          <h4 id="commands-heading" className="text-sm font-medium">
            Commands
          </h4>
          <ul className="divide-y divide-border rounded-xl ring-1 ring-foreground/10">
            {listing.manifest.commands.map((command) => (
              <li key={command.name} className="flex items-start justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{command.title}</p>
                  {command.description && <p className="text-xs text-muted-foreground">{command.description}</p>}
                </div>
                <Badge variant="outline" className="shrink-0">
                  {MODE_LABEL[command.mode]}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        <ButtonLink variant="outline" size="sm" href={listing.url} target="_blank" rel="noreferrer">
          <GitHubMark className="size-3.5" /> View on GitHub
        </ButtonLink>
        {listing.homepage && (
          <ButtonLink variant="outline" size="sm" href={listing.homepage} target="_blank" rel="noreferrer">
            <ExternalLink /> Website
          </ButtonLink>
        )}
      </div>
    </>
  );
}

function ExtensionInstall({ listing, method }: { listing: Listing; method: string | undefined }) {
  return (
    <section className="space-y-3 rounded-xl bg-muted/60 p-4" aria-labelledby="install-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 id="install-heading" className="text-sm font-medium">
            Install in Tinycast
          </h4>
          {method && <p className="text-xs text-muted-foreground">{method}</p>}
        </div>
        <ButtonLink size="lg" href={installLink(listing.id)}>
          Install
        </ButtonLink>
      </div>
      <p className="text-xs text-muted-foreground">
        Opens Tinycast and runs the <a className="underline underline-offset-4" href="#get">Tinycast Store extension</a>.
        Or paste this in its Install command:
      </p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md bg-background px-2 py-1.5 text-xs ring-1 ring-foreground/10">{listing.id}</code>
        <CopyButton text={listing.id} />
      </div>
      <p className="flex gap-2 text-xs text-muted-foreground">
        <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Extensions run code on your Mac with your permissions. Only install from authors you trust, and read the source first.
      </p>
    </section>
  );
}

function PackageInstall({ listing }: { listing: Listing }) {
  return (
    <section className="space-y-3 rounded-xl bg-muted/60 p-4" aria-labelledby="registry-heading">
      <h4 id="registry-heading" className="text-sm font-medium">
        Add as a registry
      </h4>
      <p className="text-xs text-muted-foreground">
        A package holds several extensions. In Tinycast, open Settings › Extensions › Registries, add this repository, then search
        it from the store.
      </p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md bg-background px-2 py-1.5 text-xs ring-1 ring-foreground/10">{listing.url}</code>
        <CopyButton text={listing.url} />
      </div>
    </section>
  );
}

import type { Registry } from "@tinycast-store/registry";
import { Search, TriangleAlert } from "lucide-react";
import { useMemo } from "react";
import { Guides } from "@/components/guides";
import { ListingCard, ListingCardSkeleton } from "@/components/listing-card";
import { ListingDialog } from "@/components/listing-dialog";
import { REPO_URL, SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQueryParam } from "@/hooks/use-query-param";
import { useRegistry } from "@/hooks/use-registry";
import { filterListings, timeAgo, type KindFilter, type SortKey } from "@/lib/listings";

const SORTS: Record<SortKey, string> = { popular: "Most stars", updated: "Recently updated", name: "Name" };

export default function App() {
  const { state, retry } = useRegistry();
  const [query, setQuery] = useQueryParam("q");
  const [kind, setKind] = useQueryParam("kind");
  const [sort, setSort] = useQueryParam("sort");
  const [openId, setOpenId] = useQueryParam("ext");

  const kindFilter: KindFilter = kind === "extension" || kind === "package" ? kind : "all";
  const sortKey: SortKey = sort === "updated" || sort === "name" ? sort : "popular";

  const listings = state.status === "ready" ? state.registry.listings : [];
  const visible = useMemo(
    () => filterListings(listings, { query, kind: kindFilter, sort: sortKey }),
    [listings, query, kindFilter, sortKey],
  );
  const open = listings.find((l) => l.id.toLowerCase() === openId.toLowerCase());

  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className="mx-auto max-w-6xl space-y-16 px-4 pb-24 pt-14 sm:px-6">
        <section className="space-y-6">
          <div className="max-w-2xl space-y-3">
            <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">Extensions for Tinycast</h1>
            <p className="text-pretty text-lg text-muted-foreground">
              Listed straight from open GitHub repositories tagged <code className="rounded bg-muted px-1.5 py-0.5 text-[0.85em]">tinycast-extension</code>. No
              accounts, no submissions.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search extensions"
                aria-label="Search extensions"
                className="h-10 pl-9"
              />
            </div>
            <Tabs value={kindFilter} onValueChange={(v) => setKind(v === "all" ? "" : String(v))}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="extension">Extensions</TabsTrigger>
                <TabsTrigger value="package">Packages</TabsTrigger>
              </TabsList>
            </Tabs>
            <Select value={sortKey} onValueChange={(v) => setSort(v === "popular" ? "" : String(v))}>
              <SelectTrigger aria-label="Sort" className="w-full sm:w-44">
                <SelectValue>{SORTS[sortKey]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SORTS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Results
            state={state}
            visible={visible}
            hasFilters={Boolean(query) || kindFilter !== "all"}
            onOpen={(id) => setOpenId(id, "push")}
            onRetry={retry}
            onClear={() => {
              setQuery("");
              setKind("");
            }}
          />
        </section>

        <Guides />
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:justify-between sm:px-6">
          <p>
            Open source. Not affiliated with Tinycast or Raycast.{" "}
            <a className="underline underline-offset-4" href={REPO_URL} target="_blank" rel="noreferrer">
              Source
            </a>
          </p>
          {state.status === "ready" && <Freshness registry={state.registry} />}
        </div>
      </footer>

      <ListingDialog listing={open} onClose={() => setOpenId("", "push")} />
    </div>
  );
}

function Freshness({ registry }: { registry: Registry }) {
  return (
    <p>
      {registry.origin === "snapshot"
        ? `Index refreshed ${timeAgo(registry.generatedAt)}`
        : "Live from GitHub. Some details unavailable."}
    </p>
  );
}

interface ResultsProps {
  state: ReturnType<typeof useRegistry>["state"];
  visible: ReturnType<typeof filterListings>;
  hasFilters: boolean;
  onOpen: (id: string) => void;
  onRetry: () => void;
  onClear: () => void;
}

function Results({ state, visible, hasFilters, onOpen, onRetry, onClear }: ResultsProps) {
  if (state.status === "loading") {
    return (
      <Grid>
        {Array.from({ length: 6 }, (_, i) => (
          <ListingCardSkeleton key={i} />
        ))}
      </Grid>
    );
  }

  if (state.status === "error") {
    return (
      <Notice
        icon={<TriangleAlert className="size-5" />}
        title="Couldn't load extensions"
        body={state.message}
        action={<Button onClick={onRetry}>Try again</Button>}
      />
    );
  }

  if (visible.length === 0) {
    return hasFilters ? (
      <Notice title="Nothing matches" body="Try a different search." action={<Button variant="outline" onClick={onClear}>Clear filters</Button>} />
    ) : (
      <Notice title="No extensions yet" body="Add the tinycast-extension topic to a public repository and it will show up here." />
    );
  }

  return (
    <Grid>
      {visible.map((listing) => (
        <ListingCard key={listing.id} listing={listing} onOpen={() => onOpen(listing.id)} />
      ))}
    </Grid>
  );
}

const Grid = ({ children }: { children: React.ReactNode }) => (
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
);

function Notice({ icon, title, body, action }: { icon?: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl px-6 py-16 text-center ring-1 ring-foreground/10">
      {icon}
      <h2 className="font-medium">{title}</h2>
      <p className="max-w-md text-sm text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}

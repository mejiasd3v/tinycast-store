import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Listing } from "@tinycast-store/registry";
import { filterListings, formatCount, installLink, timeAgo } from "./listings.ts";

function listing(id: string, extra: Partial<Listing> = {}): Listing {
  const [login, repo] = id.split("/") as [string, string];
  return {
    id,
    kind: "extension",
    owner: { login, avatarUrl: "" },
    repo,
    url: `https://github.com/${id}`,
    stars: 0,
    topics: ["tinycast-extension"],
    pushedAt: "2026-01-01T00:00:00Z",
    defaultBranch: "main",
    ...extra,
  };
}

const all = [
  listing("a/confetti", { stars: 3, description: "Celebrate with particles", pushedAt: "2026-09-01T00:00:00Z" }),
  listing("b/clipboard-tools", { stars: 10, description: "Clipboard helpers" }),
  listing("c/theme-pack", { kind: "package", stars: 1, topics: ["tinycast-package"] }),
];
const base = { query: "", kind: "all", sort: "popular" } as const;

describe("filterListings", () => {
  it("matches every word, in any field", () => {
    assert.deepEqual(filterListings(all, { ...base, query: "particles confetti" }).map((l) => l.id), ["a/confetti"]);
    assert.deepEqual(filterListings(all, { ...base, query: "particles clipboard" }), []);
  });

  it("filters by kind", () => {
    assert.deepEqual(filterListings(all, { ...base, kind: "package" }).map((l) => l.id), ["c/theme-pack"]);
  });

  it("sorts by popularity and by recency", () => {
    assert.deepEqual(filterListings(all, base).map((l) => l.id), ["b/clipboard-tools", "a/confetti", "c/theme-pack"]);
    assert.equal(filterListings(all, { ...base, sort: "updated" })[0]?.id, "a/confetti");
  });

  it("does not reorder the input", () => {
    const before = all.map((l) => l.id);
    filterListings(all, { ...base, sort: "name" });
    assert.deepEqual(all.map((l) => l.id), before);
  });
});

describe("installLink", () => {
  it("targets the Store extension's install command with the repo as an argument", () => {
    const url = new URL(installLink("quietsato/tinycast-confetti"));
    assert.equal(url.protocol, "tinycast:");
    assert.equal(`${url.host}${url.pathname}`, "extensions/tinycast/tinycast-store/install");
    assert.deepEqual(JSON.parse(url.searchParams.get("arguments")!), { repo: "quietsato/tinycast-confetti" });
  });
});

describe("formatting", () => {
  it("abbreviates counts", () => {
    assert.deepEqual([0, 999, 1000, 1250, 10_400, 125_000].map(formatCount), ["0", "999", "1k", "1.3k", "10k", "125k"]);
  });

  it("describes age", () => {
    const now = Date.parse("2026-09-30T12:00:00Z");
    assert.equal(timeAgo("2026-09-30T01:00:00Z", now), "today");
    assert.equal(timeAgo("2026-09-20T00:00:00Z", now), "10d ago");
    assert.equal(timeAgo("2026-07-01T00:00:00Z", now), "3mo ago");
    assert.equal(timeAgo("2024-09-01T00:00:00Z", now), "2y ago");
  });
});

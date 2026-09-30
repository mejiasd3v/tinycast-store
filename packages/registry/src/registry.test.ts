import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { discover, parseManifest, parseRepoId, resolveRepo } from "./index.ts";

describe("parseManifest", () => {
  it("reads a Raycast-format package.json", () => {
    const manifest = parseManifest({
      name: "confetti",
      title: "Confetti",
      icon: "icon.png",
      categories: ["Fun"],
      commands: [{ name: "confetti", title: "Confetti", mode: "no-view" }, { name: "menu", mode: "menu-bar" }],
    });
    assert.equal(manifest?.title, "Confetti");
    assert.deepEqual(manifest?.commands.map((c) => [c.name, c.title, c.mode]), [
      ["confetti", "Confetti", "no-view"],
      ["menu", "menu", "menu-bar"],
    ]);
  });

  it("rejects manifests Tinycast could not run", () => {
    assert.equal(parseManifest({ name: "x" }), undefined, "no commands");
    assert.equal(parseManifest({ name: "x", commands: [] }), undefined, "empty commands");
    assert.equal(parseManifest({ commands: [{ name: "a" }] }), undefined, "no name");
    assert.equal(parseManifest({ name: "x", platforms: ["Windows"], commands: [{ name: "a" }] }), undefined);
    assert.ok(parseManifest({ name: "x", platforms: ["macOS", "Windows"], commands: [{ name: "a" }] }));
  });

  it("refuses names that could escape the extensions folder", () => {
    const command = [{ name: "run" }];
    for (const name of ["..", ".", "../..", "a/../..", "/etc", "a/b/c", "@scope/..", "@../x", "x y", ""]) {
      assert.equal(parseManifest({ name, commands: command }), undefined, JSON.stringify(name));
    }
    for (const bad of ["../secret", "a/b", "..", ".hidden", "x\\y"]) {
      assert.equal(parseManifest({ name: "ok", commands: [{ name: bad }] }), undefined, JSON.stringify(bad));
    }
    assert.ok(parseManifest({ name: "@scope/pkg.name_1", commands: [{ name: "search-things.v2" }] }));
  });

  it("defaults an unknown command mode to view", () => {
    assert.equal(parseManifest({ name: "x", commands: [{ name: "a", mode: "weird" }] })?.commands[0]?.mode, "view");
  });
});

describe("parseRepoId", () => {
  it("accepts owner/repo and GitHub URLs", () => {
    for (const input of [
      "quietsato/tinycast-confetti",
      "https://github.com/quietsato/tinycast-confetti",
      "github.com/quietsato/tinycast-confetti.git",
      "https://github.com/quietsato/tinycast-confetti/tree/main/src",
    ]) {
      assert.equal(parseRepoId(input), "quietsato/tinycast-confetti", input);
    }
  });

  it("rejects things that are not a repository", () => {
    assert.equal(parseRepoId("just-a-word"), undefined);
    assert.equal(parseRepoId(""), undefined);
  });
});

/** A tiny GitHub: repo metadata, raw files, and releases, keyed by URL. */
function fakeGitHub(repos: Record<string, { meta: object; files?: Record<string, unknown>; release?: object }>) {
  const calls: string[] = [];
  const impl: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push(`${init?.method ?? "GET"} ${url}`);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

    const search = url.match(/search\/repositories\?q=topic%3A([^&]+)/);
    if (search) {
      const topic = decodeURIComponent(search[1]!);
      const items = Object.values(repos)
        .map((r) => r.meta as { topics: string[] })
        .filter((m) => m.topics.includes(topic));
      return json({ items });
    }
    const release = url.match(/api\.github\.com\/repos\/([^/]+\/[^/]+)\/releases\/latest/);
    if (release) {
      const found = repos[release[1]!]?.release;
      return found ? json(found) : json({ message: "Not Found" }, 404);
    }
    const repo = url.match(/api\.github\.com\/repos\/([^/]+\/[^/]+)$/);
    if (repo) return repos[repo[1]!] ? json(repos[repo[1]!]!.meta) : json({ message: "Not Found" }, 404);

    const raw = url.match(/raw\.githubusercontent\.com\/([^/]+\/[^/]+)\/[^/]+\/(.+)$/);
    if (raw) {
      const file = repos[raw[1]!]?.files?.[raw[2]!];
      if (file === undefined) return new Response("", { status: 404 });
      return init?.method === "HEAD" ? new Response("", { status: 200 }) : json(file);
    }
    return new Response("unexpected " + url, { status: 500 });
  };
  return { fetch: impl, calls };
}

function meta(fullName: string, extra: Record<string, unknown> = {}) {
  const [owner, name] = fullName.split("/") as [string, string];
  return {
    full_name: fullName,
    name,
    owner: { login: owner, avatar_url: `https://avatars/${owner}` },
    html_url: `https://github.com/${fullName}`,
    homepage: null,
    description: `${name} repo`,
    stargazers_count: 0,
    license: { spdx_id: "MIT" },
    topics: ["tinycast-extension"],
    pushed_at: "2026-09-01T00:00:00Z",
    default_branch: "main",
    archived: false,
    ...extra,
  };
}

const manifest = (name: string) => ({ name, title: name, commands: [{ name: "run", title: "Run" }] });

describe("discover", () => {
  it("lists valid extensions, drops spam and archived repos, and reports why", async () => {
    const github = fakeGitHub({
      "a/good": { meta: meta("a/good", { stargazers_count: 5 }), files: { "package.json": manifest("good"), "run.js": "" } },
      "b/spam-fork": { meta: meta("b/spam-fork") },
      "c/old": { meta: meta("c/old", { archived: true }), files: { "package.json": manifest("old") } },
      "d/hidden": { meta: meta("d/hidden"), files: { "package.json": manifest("hidden") } },
    });
    const skipped: Record<string, string> = {};
    const registry = await discover({
      fetch: github.fetch,
      exclude: ["D/Hidden"],
      onSkip: (repo, reason) => (skipped[repo] = reason),
    });

    assert.deepEqual(registry.listings.map((l) => l.id), ["a/good"]);
    assert.match(skipped["b/spam-fork"]!, /no installable extension manifest/);
    assert.equal(skipped["c/old"], "archived");
    assert.match(skipped["d/hidden"]!, /excluded/);
  });

  it("keeps a tinycast-package repo without a manifest, as a package", async () => {
    const github = fakeGitHub({ "e/pack": { meta: meta("e/pack", { topics: ["tinycast-package"] }) } });
    const [listing] = (await discover({ fetch: github.fetch })).listings;
    assert.equal(listing?.kind, "package");
    assert.equal(listing?.manifest, undefined);
    assert.equal(listing?.install, undefined);
  });

  it("indexes an included repo that has no topic", async () => {
    const github = fakeGitHub({
      "f/untagged": { meta: meta("f/untagged", { topics: [] }), files: { "package.json": manifest("untagged") } },
    });
    const registry = await discover({ fetch: github.fetch, include: ["f/untagged"] });
    assert.deepEqual(registry.listings.map((l) => l.id), ["f/untagged"]);
  });

  it("sorts by stars, then most recent push", async () => {
    const files = { "package.json": manifest("m") };
    const github = fakeGitHub({
      "a/low": { meta: meta("a/low", { stargazers_count: 1 }), files },
      "a/high": { meta: meta("a/high", { stargazers_count: 9 }), files },
      "a/tie-new": { meta: meta("a/tie-new", { stargazers_count: 1, pushed_at: "2026-09-20T00:00:00Z" }), files },
    });
    const ids = (await discover({ fetch: github.fetch })).listings.map((l) => l.id);
    assert.deepEqual(ids, ["a/high", "a/tie-new", "a/low"]);
  });

  it("does not spend API calls on releases unless asked", async () => {
    const github = fakeGitHub({
      "a/x": { meta: meta("a/x"), files: { "package.json": manifest("x") } },
    });
    await discover({ fetch: github.fetch });
    assert.equal(github.calls.filter((c) => c.includes("/releases/")).length, 0);
  });
});

describe("install strategy", () => {
  const release = {
    tag_name: "v1.2.0",
    draft: false,
    prerelease: false,
    assets: [
      { name: "notes.txt", browser_download_url: "https://dl/notes.txt" },
      { name: "x.zip", browser_download_url: "https://dl/x.zip" },
    ],
  };

  it("prefers a release zip", async () => {
    const github = fakeGitHub({ "a/x": { meta: meta("a/x"), files: { "package.json": manifest("x"), "run.js": "" }, release } });
    const listing = await resolveRepo("a/x", { fetch: github.fetch });
    assert.deepEqual(listing.install, { strategy: "release", ref: "v1.2.0", zipUrl: "https://dl/x.zip" });
  });

  it("uses the repo root when built bundles are committed", async () => {
    const github = fakeGitHub({ "a/x": { meta: meta("a/x"), files: { "package.json": manifest("x"), "run.js": "" } } });
    assert.deepEqual((await resolveRepo("a/x", { fetch: github.fetch })).install, { strategy: "repo", ref: "main" });
  });

  it("falls back to building from source", async () => {
    const github = fakeGitHub({ "a/x": { meta: meta("a/x"), files: { "package.json": manifest("x") } } });
    assert.deepEqual((await resolveRepo("a/x", { fetch: github.fetch })).install, { strategy: "source", ref: "main" });
  });

  it("ignores prereleases and drafts", async () => {
    const github = fakeGitHub({
      "a/x": { meta: meta("a/x"), files: { "package.json": manifest("x") }, release: { ...release, prerelease: true } },
    });
    assert.equal((await resolveRepo("a/x", { fetch: github.fetch })).install?.strategy, "source");
  });

  it("refuses a repo that is not an extension", async () => {
    const github = fakeGitHub({ "a/x": { meta: meta("a/x") } });
    await assert.rejects(resolveRepo("a/x", { fetch: github.fetch }), /isn't installable/);
  });
});

describe("default fetch", () => {
  it("is called as a plain function, as browsers require", async () => {
    const original = globalThis.fetch;
    const github = fakeGitHub({ "a/x": { meta: meta("a/x"), files: { "package.json": manifest("x") } } });
    // Browsers throw "Illegal invocation" when fetch is called as a method of another object.
    globalThis.fetch = function (this: unknown, ...args: Parameters<typeof fetch>) {
      if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
      return github.fetch(...args);
    } as typeof fetch;
    try {
      assert.equal((await discover()).listings.length, 1);
    } finally {
      globalThis.fetch = original;
    }
  });
});

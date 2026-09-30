import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { installState, isTrusted, pathsFor, scanInstalled, writeReceipt, type InstalledExtension } from "../src/installed.ts";
import { installLink, methodTag } from "../src/labels.ts";
import { listing, manifest, sandbox, type Sandbox } from "./helpers.ts";

const open: Sandbox[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((box) => box.cleanup()));
});

describe("pathsFor", () => {
  it("finds the extensions folder from Tinycast's per-extension support path", () => {
    const support = "/Users/me/Library/Application Support/com.tinycast.app/extension-support/tinycast-store";
    assert.deepEqual(pathsFor(support), {
      extensionsDir: "/Users/me/Library/Application Support/com.tinycast.app/extensions",
      supportRoot: "/Users/me/Library/Application Support/com.tinycast.app/extension-support",
      dataDir: "/Users/me/Library/Application Support/com.tinycast.app/extension-data",
      receiptsFile: `${support}/installed.json`,
    });
  });

  it("follows a dev build's different bundle id", () => {
    const { extensionsDir } = pathsFor("/App Support/com.tinycast.app.dev/extension-support/tinycast-store");
    assert.equal(extensionsDir, "/App Support/com.tinycast.app.dev/extensions");
  });
});

describe("scanInstalled", () => {
  it("lists real extension folders with their receipts, skipping staging folders and strangers", async () => {
    const box = await sandbox({});
    open.push(box);
    const { extensionsDir, receiptsFile } = box.paths;
    for (const [folder, content] of [
      ["thing", manifest()],
      [".thing-abc123", manifest({ name: "half-built" })],
      ["stranger", "not json"],
    ] as const) {
      await mkdir(join(extensionsDir, folder), { recursive: true });
      await writeFile(join(extensionsDir, folder, "package.json"), content);
    }
    await mkdir(join(extensionsDir, "empty"));
    const receipt = { repo: "acme/thing", ref: "main", strategy: "repo", installedAt: "2026-09-30T00:00:00Z" } as const;
    await writeReceipt(box.deps.fs, receiptsFile, "thing", receipt);

    assert.deepEqual(await scanInstalled(box.deps.fs, box.paths), [{ name: "thing", title: "Thing", receipt }]);
  });

  it("is empty before Tinycast has created the folder", async () => {
    const box = await sandbox({});
    open.push(box);
    assert.deepEqual(await scanInstalled(box.deps.fs, box.paths), []);
  });
});

describe("installState", () => {
  const receipt = (ref: string, strategy: "release" | "repo" = "release") =>
    ({ repo: "acme/thing", ref, strategy, installedAt: "" }) as const;
  const manifestOf = { name: "thing", title: "Thing", categories: [], commands: [] };
  const latest = listing({ strategy: "release", ref: "v2", zipUrl: "u" }, { manifest: manifestOf });

  it("is available when nothing matches", () => {
    assert.deepEqual(installState(latest, []), { kind: "available" });
  });

  it("offers an update only when a release tag moved", () => {
    const old: InstalledExtension[] = [{ name: "thing", title: "Thing", receipt: receipt("v1") }];
    assert.equal(installState(latest, old).kind, "update");
    assert.equal(installState(latest, [{ name: "thing", title: "Thing", receipt: receipt("v2") }]).kind, "installed");
  });

  it("does not guess at updates for branch installs", () => {
    const branch = listing({ strategy: "repo", ref: "main" }, { manifest: manifestOf });
    assert.equal(installState(branch, [{ name: "thing", title: "Thing", receipt: receipt("main", "repo") }]).kind, "installed");
  });

  it("recognises an extension installed some other way by its manifest name", () => {
    const state = installState(latest, [{ name: "thing", title: "Thing" }]);
    assert.deepEqual(state, { kind: "installed", receipt: undefined });
    assert.equal(isTrusted(latest, state), false, "no receipt means the user never approved this repository");
  });

  it("trusts only the repository the user approved", () => {
    const state = installState(latest, [{ name: "thing", title: "Thing", receipt: receipt("v1") }]);
    assert.equal(isTrusted(latest, state), true);
    assert.equal(isTrusted(listing(latest.install!, { id: "evil/thing", manifest: manifestOf }), state), false);
    assert.equal(isTrusted(latest, { kind: "available" }), false);
  });
});

describe("labels", () => {
  it("builds the deeplink tinycast.store uses, in the shape Tinycast's parser reads", () => {
    const link = installLink("owner/repo");
    assert.equal(
      link,
      "tinycast://extensions/tinycast/tinycast-store/install?arguments=%7B%22repo%22%3A%22owner%2Frepo%22%7D",
    );

    // Tinycast reads host + path as [extensions, owner, extension, command] and the arguments as JSON.
    const url = new URL(link);
    assert.deepEqual([url.host, ...url.pathname.split("/").filter(Boolean)], ["extensions", "tinycast", "tinycast-store", "install"]);
    assert.deepEqual(JSON.parse(url.searchParams.get("arguments")!), { repo: "owner/repo" });
  });

  it("tags how an extension installs", () => {
    assert.equal(methodTag({ strategy: "release", ref: "v1" }), "Prebuilt");
    assert.equal(methodTag({ strategy: "repo", ref: "main" }), "Prebuilt");
    assert.equal(methodTag({ strategy: "source", ref: "main" }), "Builds from source");
  });
});

import assert from "node:assert/strict";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { readReceipts, scanInstalled, writeReceipt } from "../src/installed.ts";
import { UninstallError, uninstallExtension } from "../src/uninstaller.ts";
import { manifest, names, sandbox, type Sandbox } from "./helpers.ts";

const open: Sandbox[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((box) => box.cleanup()));
});

const receipt = { repo: "acme/thing", ref: "main", strategy: "repo", installedAt: "2026-09-30T00:00:00Z" } as const;
const exists = (path: string) => stat(path).then(() => true, () => false);

/** Puts one extension on disk the way Tinycast lays it out, plus the state Tinycast keeps for it. */
async function install(box: Sandbox, name: string, { withReceipt = true } = {}) {
  const { extensionsDir, supportRoot, dataDir, receiptsFile } = box.paths;
  const folder = name.replaceAll("/", "-");
  const data = name.replaceAll("/", "-").replaceAll("@", "");
  await mkdir(join(extensionsDir, folder), { recursive: true });
  await writeFile(join(extensionsDir, folder, "package.json"), manifest({ name }));
  await writeFile(join(extensionsDir, folder, "run.js"), "");
  await mkdir(join(supportRoot, data), { recursive: true });
  await writeFile(join(supportRoot, data, "scratch.txt"), "x");
  await mkdir(dataDir, { recursive: true });
  await writeFile(join(dataDir, `${data}.json`), "{}");
  if (withReceipt) await writeReceipt(box.deps.fs, receiptsFile, name, receipt);
  return { folder, data };
}

async function setup() {
  const box = await sandbox({});
  open.push(box);
  return box;
}

describe("uninstallExtension", () => {
  it("removes the folder, scratch space, saved data and receipt, and nothing else", async () => {
    const box = await setup();
    await install(box, "thing");
    await install(box, "other");

    await uninstallExtension("thing", box.deps, box.paths);

    assert.deepEqual(await names(box.paths.extensionsDir), ["other"]);
    // The Store's own scratch folder holds the receipts, so it stays.
    assert.deepEqual(await names(box.paths.supportRoot), ["other", "tinycast-store"]);
    assert.deepEqual(await names(box.paths.dataDir), ["other.json"]);
    assert.deepEqual(Object.keys(await readReceipts(box.deps.fs, box.paths.receiptsFile)), ["other"]);
  });

  it("uses Tinycast's two different names for a scoped extension", async () => {
    // Folder keeps the @ (`@acme-thing`); scratch and data drop it (`acme-thing`).
    const box = await setup();
    const { folder, data } = await install(box, "@acme/thing");
    assert.deepEqual([folder, data], ["@acme-thing", "acme-thing"]);

    await uninstallExtension("@acme/thing", box.deps, box.paths);

    assert.deepEqual(await names(box.paths.extensionsDir), []);
    assert.deepEqual(await names(box.paths.supportRoot), ["tinycast-store"]);
    assert.deepEqual(await names(box.paths.dataDir), []);
  });

  it("no longer shows up as installed afterwards", async () => {
    const box = await setup();
    await install(box, "thing");
    await uninstallExtension("thing", box.deps, box.paths);
    assert.deepEqual(await scanInstalled(box.deps.fs, box.paths), []);
  });

  it("refuses an extension the Store did not install, and leaves it alone", async () => {
    const box = await setup();
    await install(box, "mine", { withReceipt: false });
    await assert.rejects(uninstallExtension("mine", box.deps, box.paths), UninstallError);
    assert.equal(await exists(join(box.paths.extensionsDir, "mine", "run.js")), true);
    assert.equal(await exists(join(box.paths.dataDir, "mine.json")), true);
  });

  it("does not mistake inherited object keys for receipts", async () => {
    const box = await setup();
    await install(box, "constructor", { withReceipt: false });
    await assert.rejects(uninstallExtension("constructor", box.deps, box.paths), /wasn't installed by the Tinycast Store/);
    assert.equal(await exists(join(box.paths.extensionsDir, "constructor")), true);
  });

  it("never deletes outside the extensions folder, whatever the receipt file says", async () => {
    // The receipts file is ordinary JSON on disk; a tampered key must not become a path.
    const box = await setup();
    const sentinel = join(box.supportRoot, "precious.json");
    await mkdir(box.supportRoot, { recursive: true });
    await writeFile(sentinel, "keep me");
    for (const name of ["..", ".", "../extension-data", "a/../..", ""]) {
      await writeReceipt(box.deps.fs, box.paths.receiptsFile, name, receipt);
      await assert.rejects(uninstallExtension(name, box.deps, box.paths), UninstallError, JSON.stringify(name));
    }
    assert.equal(await readFile(sentinel, "utf8"), "keep me");
  });

  it("will not uninstall the Store itself", async () => {
    const box = await setup();
    await install(box, "tinycast-store");
    await assert.rejects(uninstallExtension("tinycast-store", box.deps, box.paths), /can't uninstall itself/);
    assert.equal(await exists(join(box.paths.extensionsDir, "tinycast-store", "run.js")), true);
  });

  it("keeps the receipt when a removal fails, so it can be retried", async () => {
    const box = await setup();
    await install(box, "thing");
    const failing = { ...box.deps, fs: { ...box.deps.fs, rm: async () => { throw new Error("disk says no"); } } };

    await assert.rejects(uninstallExtension("thing", failing, box.paths), /disk says no/);
    assert.deepEqual(Object.keys(await readReceipts(box.deps.fs, box.paths.receiptsFile)), ["thing"]);

    await uninstallExtension("thing", box.deps, box.paths);
    assert.deepEqual(await names(box.paths.extensionsDir), []);
  });

  it("is safe to run twice", async () => {
    const box = await setup();
    await install(box, "thing");
    await uninstallExtension("thing", box.deps, box.paths);
    await assert.rejects(uninstallExtension("thing", box.deps, box.paths), UninstallError);
  });
});

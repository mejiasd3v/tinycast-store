import assert from "node:assert/strict";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { InstallError, installListing } from "../src/installer.ts";
import { readReceipts } from "../src/installed.ts";
import { builtFiles, hasZip, listing, makeZip, manifest, names, sandbox, type Sandbox } from "./helpers.ts";

const RELEASE_URL = "https://github.com/acme/thing/releases/download/v1.0.0/thing.zip";
const BRANCH_URL = "https://codeload.github.com/acme/thing/zip/refs/heads/main";
const release = { strategy: "release", ref: "v1.0.0", zipUrl: RELEASE_URL } as const;
const repo = { strategy: "repo", ref: "main" } as const;

const open: Sandbox[] = [];
async function setup(archives: Record<string, Uint8Array>, overrides = {}) {
  const box = await sandbox(archives, overrides);
  open.push(box);
  return box;
}
afterEach(async () => {
  await Promise.all(open.splice(0).map((box) => box.cleanup()));
});

const exists = (path: string) => stat(path).then(() => true, () => false);

describe("installListing", { skip: !hasZip && "the zip CLI is needed to build fixtures" }, () => {
  it("installs a release zip: only the manifest, built commands and assets", async () => {
    const box = await setup({ [RELEASE_URL]: await makeZip(builtFiles()) });
    const result = await installListing(listing(release), box.deps, box.paths);

    assert.equal(result.directory, join(box.paths.extensionsDir, "thing"));
    assert.deepEqual(await names(result.directory), ["assets", "package.json", "run.js"]);
    assert.equal(await readFile(join(result.directory, "assets", "icon.png"), "utf8"), "png");
    assert.deepEqual(box.downloads, [RELEASE_URL]);
  });

  it("installs from the repository root of a branch, finding the wrapper folder", async () => {
    const box = await setup({ [BRANCH_URL]: await makeZip(builtFiles("thing-main/")) });
    const result = await installListing(listing(repo), box.deps, box.paths);

    assert.deepEqual(await names(result.directory), ["assets", "package.json", "run.js"]);
    assert.deepEqual(box.downloads, [BRANCH_URL]);
  });

  it("copies only the commands that were built", async () => {
    const twoCommands = manifest({
      commands: [{ name: "run", title: "Run" }, { name: "later", title: "Later" }],
    });
    const box = await setup({ [RELEASE_URL]: await makeZip({ ...builtFiles(), "package.json": twoCommands }) });
    const result = await installListing(listing(release), box.deps, box.paths);
    assert.deepEqual(await names(result.directory), ["assets", "package.json", "run.js"]);
  });

  it("refuses source without built commands, and leaves nothing behind", async () => {
    const box = await setup({ [RELEASE_URL]: await makeZip({ "package.json": manifest(), "src/run.tsx": "x" }) });
    await assert.rejects(installListing(listing(release), box.deps, box.paths), /no built command bundles/);
    assert.deepEqual(await names(box.paths.extensionsDir), []);
    assert.equal(await exists(box.paths.receiptsFile), false);
  });

  it("refuses a package.json Tinycast could not run", async () => {
    const box = await setup({ [RELEASE_URL]: await makeZip({ "package.json": JSON.stringify({ name: "x" }), "run.js": "" }) });
    await assert.rejects(installListing(listing(release), box.deps, box.paths), /isn't an installable macOS extension/);
  });

  it("never lets a manifest name reach outside the extensions folder", async () => {
    // A name of ".." would resolve to Tinycast's whole support directory, and the swap would replace it.
    for (const name of ["..", ".", "../escape"]) {
      const box = await setup({ [RELEASE_URL]: await makeZip(builtFiles("", { name })) });
      const sentinel = join(box.paths.extensionsDir, "..", "precious.json");
      await mkdir(box.paths.extensionsDir, { recursive: true });
      await writeFile(sentinel, "keep me");

      await assert.rejects(installListing(listing(release), box.deps, box.paths), /isn't an installable macOS extension/, name);
      assert.equal(await readFile(sentinel, "utf8"), "keep me", `${name} must not disturb the parent folder`);
    }
  });

  it("refuses an archive with no extension in it", async () => {
    const box = await setup({ [RELEASE_URL]: await makeZip({ "README.md": "nothing here" }) });
    await assert.rejects(installListing(listing(release), box.deps, box.paths), /no package\.json/);
  });

  it("refuses a package, which is not a single extension", async () => {
    const box = await setup({});
    await assert.rejects(
      installListing(listing(release, { kind: "package", install: undefined }), box.deps, box.paths),
      InstallError,
    );
  });

  it("names scoped extensions the way Tinycast does, and keys the receipt by manifest name", async () => {
    const files = builtFiles("", { name: "@acme/thing" });
    const box = await setup({ [RELEASE_URL]: await makeZip(files) });
    const result = await installListing(listing(release), box.deps, box.paths);

    assert.equal(result.directory, join(box.paths.extensionsDir, "@acme-thing"));
    assert.deepEqual(Object.keys(await readReceipts(box.deps.fs, box.paths.receiptsFile)), ["@acme/thing"]);
  });

  it("records where each install came from", async () => {
    const other = { strategy: "release", ref: "v2.0.0", zipUrl: "https://dl/other.zip" } as const;
    const box = await setup({
      [RELEASE_URL]: await makeZip(builtFiles()),
      [other.zipUrl]: await makeZip(builtFiles("", { name: "other" })),
    });
    await installListing(listing(release), box.deps, box.paths);
    await installListing(listing(other, { id: "acme/other" }), box.deps, box.paths);

    assert.deepEqual(await readReceipts(box.deps.fs, box.paths.receiptsFile), {
      thing: { repo: "acme/thing", ref: "v1.0.0", strategy: "release", installedAt: "2026-09-30T12:00:00.000Z" },
      other: { repo: "acme/other", ref: "v2.0.0", strategy: "release", installedAt: "2026-09-30T12:00:00.000Z" },
    });
  });

  describe("replacing an existing install", () => {
    async function withInstalled(overrides = {}) {
      const box = await setup({ [RELEASE_URL]: await makeZip(builtFiles()) }, overrides);
      const destination = join(box.paths.extensionsDir, "thing");
      await mkdir(destination, { recursive: true });
      await writeFile(join(destination, "package.json"), manifest());
      await writeFile(join(destination, "run.js"), "old build");
      await writeFile(join(destination, "stale.js"), "from an older version");
      return { box, destination };
    }

    it("swaps in the new version and drops what it no longer ships", async () => {
      const { box, destination } = await withInstalled();
      await installListing(listing(release), box.deps, box.paths);

      assert.equal(await readFile(join(destination, "run.js"), "utf8"), "module.exports = 1;");
      assert.equal(await exists(join(destination, "stale.js")), false);
      assert.deepEqual(await names(box.paths.extensionsDir), ["thing"], "no staging or backup folders left over");
    });

    it("keeps the working install when the final swap fails", async () => {
      const real = (await setup({})).deps.fs;
      const { box, destination } = await withInstalled({
        fs: {
          ...real,
          // Let the old install be moved aside, then fail putting the new one in its place.
          rename: async (from: string, to: string) => {
            if (to === destination && !from.endsWith(".previous")) throw new Error("disk went away");
            return rename(from, to);
          },
        },
      });

      await assert.rejects(installListing(listing(release), box.deps, box.paths), /disk went away/);
      assert.equal(await readFile(join(destination, "run.js"), "utf8"), "old build");
      assert.equal(await exists(join(destination, "stale.js")), true);
      assert.deepEqual(await names(box.paths.extensionsDir), ["thing"]);
    });

    it("keeps the working install when the new download is bad", async () => {
      const { box, destination } = await withInstalled();
      const broken = { ...box.deps, download: async () => new Uint8Array([1, 2, 3]) };
      await assert.rejects(installListing(listing(release), broken, box.paths), InstallError);
      assert.equal(await readFile(join(destination, "run.js"), "utf8"), "old build");
    });
  });

  describe("building from source", () => {
    const source = { strategy: "source", ref: "main" } as const;

    /** Records shell commands; `ray build` is faked by writing a built extension into its `-o` folder. */
    async function withFakeShell(lockfile: string | undefined, failure?: string) {
      const files = { ...builtFiles("thing-main/"), ...(lockfile ? { [`thing-main/${lockfile}`]: "" } : {}) };
      const commands: string[] = [];
      const box = await setup({ [BRANCH_URL]: await makeZip(files) });
      const real = box.deps.run;
      const run: typeof real = async (file, args, options) => {
        if (file !== "/bin/zsh") return real(file, args, options);
        const command = args[1]!.replace(/^export PATH=[^;]*; /, "");
        commands.push(command);
        if (failure && command.includes(failure)) return { status: 1, output: `noise\nnpm ERR! boom` };
        const out = command.match(/-o '([^']+)'/)?.[1];
        if (out) {
          await mkdir(out, { recursive: true });
          await writeFile(join(out, "package.json"), manifest());
          await writeFile(join(out, "run.js"), "built");
        }
        return { status: 0, output: "" };
      };
      return { box: { ...box, deps: { ...box.deps, run } }, commands };
    }

    it("installs dependencies without lifecycle scripts, then runs ray build, then installs the output", async () => {
      const { box, commands } = await withFakeShell("pnpm-lock.yaml");
      const steps: string[] = [];
      const result = await installListing(listing(source), box.deps, box.paths, (step) => steps.push(step));

      assert.equal(commands[0], "pnpm install --ignore-scripts");
      assert.match(commands[1]!, /^node_modules\/\.bin\/ray build -e dist -o '.+\/build'$/);
      assert.equal(await readFile(join(result.directory, "run.js"), "utf8"), "built");
      assert.deepEqual(steps, ["Downloading…", "Installing dependencies with pnpm…", "Building…", "Installing…"]);
    });

    it("picks the package manager from the lockfile", async () => {
      assert.equal((await withFakeShell("yarn.lock").then(run)).commands[0], "yarn install --ignore-scripts");
      assert.equal((await withFakeShell(undefined).then(run)).commands[0], "npm install --ignore-scripts");

      async function run({ box, commands }: Awaited<ReturnType<typeof withFakeShell>>) {
        await installListing(listing(source), box.deps, box.paths);
        return { commands };
      }
    });

    it("explains what is needed and shows the end of the output when the build fails", async () => {
      const { box } = await withFakeShell(undefined, "npm install");
      await assert.rejects(
        installListing(listing(source), box.deps, box.paths),
        /needs Node and a package manager.*npm ERR! boom/s,
      );
      assert.deepEqual(await names(box.paths.extensionsDir), []);
    });
  });
});

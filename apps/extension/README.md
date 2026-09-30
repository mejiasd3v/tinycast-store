# Tinycast Store (extension)

A [Tinycast](https://tinycast.dev) extension that finds and installs other Tinycast extensions,
straight from the launcher. It lists every public GitHub repository tagged `tinycast-extension` (or
`tinycast-package`), the same list [tinycast.store](https://tinycast.store) shows.

It is a regular Raycast-format extension, so it runs in Tinycast like any other. There is no backend:
the list comes from a static `registry.json` on tinycast.store, and if that is unreachable the
extension asks GitHub directly.

## Commands

| Command | Mode | What it does |
| --- | --- | --- |
| **Browse Extensions** (`browse`) | view | Search the list, read details, install or update. Sections: Updates available, Installed, Extensions, Packages. |
| **Install Extension** (`install`) | no-view | Installs `owner/repo` (or a GitHub URL) without opening the palette. This is what the Install button on tinycast.store calls. |
| **Uninstall Extension** (`uninstall`) | view | Lists extensions the Store installed and removes the one you pick, after a confirmation. Browse has the same action (⌃X). |

Uninstall removes the extension's folder, scratch folder and saved data. It only touches extensions
with a Store receipt, so ones you built or imported are never listed. Tinycast's own uninstall
also clears Keychain sign-ins, shortcuts, aliases and icon choices; an extension can't reach
those, so they stay until you clear them in Settings › Extensions.

Deeplink used by the website:

```
tinycast://extensions/tinycast/tinycast-store/install?arguments=%7B%22repo%22%3A%22owner%2Frepo%22%7D
```

## Getting it

Download `tinycast-store.zip` from tinycast.store, unzip it, then in Tinycast open
**Settings › Extensions › Add Folder** and pick the `tinycast-store` folder.

## How an install works

Tinycast keeps each extension as `package.json`, one built `<command>.js` per command, and `assets/`
under `~/Library/Application Support/<bundle id>/extensions/<name>/`. This extension puts exactly
those files there, choosing the cheapest way to get them:

| Strategy | When | Needs |
| --- | --- | --- |
| `release` | The latest GitHub release has a `.zip` asset | nothing |
| `repo` | The repository root already contains the built `<command>.js` | nothing |
| `source` | Neither | Node and a package manager; runs `ray build` |

The new copy is staged beside the old one and swapped in with a rename, so a failed install never
damages a working one. Receipts live in this extension's support folder (`installed.json`) and drive
the Installed and Update available markers. Updates are only detected for `release` installs; others
offer Reinstall.

**Security.** Extensions run arbitrary code with your permissions. Every first install asks for
confirmation and names the repository, author, stars and install method. Updating something you
already installed from the same repository doesn't ask again. `source` installs skip lifecycle
scripts (`--ignore-scripts`), but the project's build tooling still runs.

## Known limitation: activating a new install

Tinycast rescans installed extensions only at launch, after its own installs, and when
**Settings › Extensions** opens. An extension can't trigger that directly, so after an install:

- **Browse** shows a toast with an **Open Extensions Settings** action.
- **Install** (the deeplink) shows a HUD and opens Settings › Extensions for you.

Opening that pane is what makes the new extension appear. A directory watcher or an install
deeplink in Tinycast would remove the extra step.

## For extension authors

1. Push a public repo whose **root** is the extension (`package.json` with `commands`).
2. Add the GitHub topic `tinycast-extension`.
3. Ship it prebuilt so people don't need Node: commit the built `<command>.js` files, or better,
   attach a zip to each release. Zip contents: `package.json`, the `<command>.js` files, `assets/`.

```yaml
# .github/workflows/release.yml
on:
  push:
    tags: ["v*"]
permissions:
  contents: write
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci && npx ray build -e dist -o build
      - run: cd build && zip -qr ../extension.zip package.json *.js assets
      - uses: softprops/action-gh-release@v2
        with: { files: extension.zip }
```

Repos tagged `tinycast-extension` without a valid manifest at the root are left out of the list.

## Development

From the repository root (`mise install` sets up Node and pnpm):

```sh
pnpm install
pnpm -C apps/extension typecheck
pnpm -C apps/extension test        # installer, receipts, state, deeplink
pnpm -C apps/extension build       # ray build → apps/extension/dist
```

To try a build, add `apps/extension/dist` in **Settings › Extensions › Add Folder**. To render a
command without the app, use the JS harness in Tinycast's repo:
`node Scripts/raycast-runtime/test.mjs <dist> browse`.

`pnpm extension:package` (repo root) builds and zips the extension into the website's `public/`.
`node apps/extension/scripts/make-icon.mjs` regenerates `assets/icon.png`.

Tinycast's `require` knows Node builtins by their plain names, so import `fs/promises`, not
`node:fs/promises`.

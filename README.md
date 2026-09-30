# tinycast.store

Find and install extensions for [Tinycast](https://tinycast.dev). Open source, no backend.

Every public GitHub repository with the topic `tinycast-extension` (one extension) or
`tinycast-package` (a collection) is listed automatically. There are no accounts and no
submissions. See [docs/publishing.md](docs/publishing.md) to list your own.

This repo has two products that share one index:

| | |
|---|---|
| **Website** (`apps/web`) | The catalog at tinycast.store. Vite, React, Tailwind, shadcn/ui. |
| **Tinycast Store extension** (`apps/extension`) | A Tinycast extension that browses the same index and installs and removes extensions from it, from inside the launcher. |
| **Registry** (`packages/registry`) | The GitHub discovery code both of them use. Only depends on `fetch`. |

## How it works, with no backend

```
GitHub search: topic:tinycast-extension, topic:tinycast-package
        │
        ▼   at build time (hourly in CI)
  registry.json ── baked into the static site on Cloudflare
        │
        ├── website reads /registry.json (falls back to querying GitHub from the browser)
        └── extension reads tinycast.store/registry.json (falls back to GitHub the same way)
```

A repository is only listed if its root has a valid extension `package.json` (a `name` and at
least one command, macOS supported). That keeps repos that merely reuse the topic out. Archived
repos are skipped, and `registry.config.json` can hide or force-list a repo.

### How an extension gets installed

Tinycast runs Raycast-format extensions and looks for them in
`~/Library/Application Support/<bundle id>/extensions/<name>/`, containing only `package.json`,
built `<command>.js` files and `assets/`. For each listing the Store extension picks the first
source that works:

1. **Release zip**: the latest GitHub release has a `.zip`. No developer tools needed.
2. **Repo root**: the built `<command>.js` files are committed. No developer tools needed.
3. **Source**: builds with `ray build`. Needs Node and a package manager.

The website's Install button opens
`tinycast://extensions/tinycast/tinycast-store/install?arguments={"repo":"owner/repo"}`. Tinycast
runs any installed command from such a link, so this triggers the Store extension's `install`
command. There is no way to install from the web without the extension already present.

### Uninstalling

The extension's **Uninstall Extension** command (and an **Uninstall** action in Browse) removes an
extension's folder, scratch folder and saved data. It only works on extensions the Store itself
installed, which it knows from a receipt, so your own extensions are never listed. Tinycast's own
uninstall also clears Keychain sign-ins, shortcuts, aliases and icon choices, which an extension
can't reach. Those stay behind and can be cleared in Settings › Extensions.

> **Known limitation.** Tinycast only rescans its extensions at launch, after its own installs, and
> when Settings › Extensions opens. An extension installed by another extension appears after you
> open that settings pane, so the Store extension opens it for you after an install. Fixing this
> properly needs a small change in Tinycast (an install deeplink or a folder watcher).

## Develop

Needs [mise](https://mise.jdx.dev). It installs Node 24 and pnpm.

```sh
mise install
pnpm install
pnpm registry:generate   # fetch the index from GitHub (uses `gh auth token` if you're logged in)
pnpm dev                 # website on http://localhost:5173
pnpm check               # typecheck + tests, everything
```

Without `registry.json` the site queries GitHub from your browser instead, which works but is
rate limited to 10 searches a minute.

### The extension

```sh
pnpm -C apps/extension build            # apps/extension/dist
pnpm extension:package                   # apps/web/public/tinycast-store.zip
```

Load `apps/extension/dist` in Tinycast with Settings › Extensions › Add Folder.

## Deploy to Cloudflare

Infrastructure is code, using [Alchemy](https://alchemy.run) (`alchemy.run.ts`). Your domain must
be a zone in your Cloudflare account.

```sh
pnpm exec alchemy profile edit --add Cloudflare   # once: OAuth or API token
pnpm infra:deploy --stage prod
```

Only the `prod` stage attaches `tinycast.store`. Other stages get a `workers.dev` URL.

CI (`.github/workflows/deploy.yml`) runs checks on every push and pull request. It redeploys
`prod` on pushes to `main` and every hour, which is what refreshes the index. Set these repository
secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

## Layout

```
alchemy.run.ts        Cloudflare stack
apps/web              website
apps/extension        Tinycast Store extension
packages/registry     GitHub discovery, shared
registry.config.json  hide / force-list repos
scripts/              packaging
docs/publishing.md    how to list an extension
```

## Notes

- Alchemy 2 is in beta and Effect 4 is in release-candidate. `pnpm-workspace.yaml` pins Effect to
  `rc.115` because Alchemy `beta.79` imports paths that `rc.118` removed. Unpin once Alchemy catches up.
- Extensions run arbitrary code with your user's permissions. The store shows a warning and asks
  for confirmation, but it does not review or sandbox anything. Only install from authors you trust.
- Names from a repo's `package.json` become folder and file names on disk, so the registry rejects
  any that aren't plain npm-style names (no `..`, no slashes).
- Not affiliated with Tinycast or Raycast.

## License

MIT

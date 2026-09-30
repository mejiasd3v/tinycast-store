# Publishing an extension on tinycast.store

There is no submission form. tinycast.store indexes every public GitHub repository that has the
topic `tinycast-extension` (a single extension) or `tinycast-package` (a collection), and refreshes
about once an hour.

## 1. Make it a Tinycast extension

Tinycast runs Raycast-format extensions: a `package.json` with `commands`, built command bundles,
and an `assets/` folder. Build with `ray build` as you would for Raycast.

The repository root must be the extension, with a `package.json` that has a `name` and at least one
entry in `commands`. If it lists `platforms`, it must include `macOS`. Repositories that fail this
check are left out, even if they carry the topic.

## 2. Add the topic

On GitHub, open the repository, click the gear next to **About**, and add `tinycast-extension`.

## 3. Ship built files (recommended)

Tinycast installs *built* extensions. If yours needs a build, users need Node and a package manager
on their Mac. Avoid that by shipping one of these. The store picks the first that applies:

1. **A release zip.** Attach a `.zip` of the `ray build` output to a GitHub release. It contains
   `package.json`, one `<command>.js` per command, and `assets/`. This also gives users a version
   and lets the store offer updates.
2. **Built files in the repo root.** Commit `<command>.js` next to `package.json`.
3. **Neither.** The store falls back to building from source, and shows "Builds from source".

Example workflow that publishes a zip on every tag:

```yaml
name: Release
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
        with: { node-version: 24 }
      - run: npm ci
      - run: npx ray build -e dist -o build
      - run: cd build && zip -r "../${{ github.event.repository.name }}.zip" .
      - run: gh release create "$GITHUB_REF_NAME" "${{ github.event.repository.name }}.zip" --generate-notes
        env:
          GH_TOKEN: ${{ github.token }}
```

## Packages

A repository tagged `tinycast-package` that has no extension manifest at its root is listed as a
package. Its layout should match `raycast/extensions`: one folder per extension, each with its own
`package.json`. Users add it in Tinycast under Settings > Extensions > Registries.

## Curation

Repositories can be hidden (spam, abuse) or force-listed without a topic in `registry.config.json`.
Open a pull request.

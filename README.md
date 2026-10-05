# Ely GPUI Showcases

Apps built with [Ely GPUI Components](https://github.com/ZacharyZhang-NY/Ely-GPUI-Components). The catalog feeds the Showcase page on the Ely site.

## Submit an app

1. Read [CONTRIBUTING.md](CONTRIBUTING.md), screenshots most of all.
2. Make `apps/<app-id>/`. The id is lowercase kebab-case: `tally`, `log-view`.
3. Put your PNG screenshots in that folder.
4. Add `manifest.json` there.
5. Add `README.md` there if you want a detail page.
6. Run `pnpm install`, `pnpm test` and `pnpm validate`, then open a pull request.

```
apps/
  tally/
    manifest.json
    preview0.png
    preview1.png
    README.md
```

## Manifest

```json
{
  "id": "tally",
  "name": "Tally",
  "author": "Ada Lovelace",
  "description": "Counts what you tell it to, in light and dark.",
  "category": "work",
  "platforms": ["macOS", "Linux"],
  "website": null,
  "source": "https://github.com/ada/tally",
  "publishedAt": "2026-10-04T12:00:00Z",
  "previews": ["preview0.png", "preview1.png"]
}
```

| Field | Rule |
|-------|------|
| `id` | Lowercase letters, digits, single hyphens. Matches the folder. |
| `name` | The app's name, in its own capitals. |
| `author` | A person or an organization. |
| `description` | At most 280 weighted characters, counted by [twitter-text](https://github.com/twitter/twitter-text): an address counts 23, CJK and emoji 2. |
| `category` | `dev` (Developer Tools), `terminal` (Terminal & Network), `system` (System & Desktop) or `work` (Productivity & Media). |
| `platforms` | Some of `macOS`, `Windows`, `Linux`, `Web`. |
| `website`, `source` | Canonical `https` addresses with a plain host, or `null`. One at least. |
| `previews` | PNG file names in the folder. The first is the cover. |
| `building` | Optional. `true` while the app is not out yet. |
| `publishedAt` | ISO 8601 with a zone, such as `2026-10-04T12:00:00Z`: when the app joins the catalog. Maintainers confirm it; later updates keep it. |
| `stars`, `starsUpdatedAt` | CI writes them for GitHub sources. Leave them out. |

Unknown fields fail validation.

## Featured

`featured.json` lists app ids in order. Those apps come first. Maintainers choose them. The rest sort newest first, then by stars.

## Stars

On every push to `main` and each Monday, CI asks GitHub for each GitHub source's stars and commits any change. `starsUpdatedAt` moves only when the count does. `pnpm run update-stars` does the same locally with `GITHUB_TOKEN` set.

## How the site uses this

The Ely site pins a commit of this repo. Its build downloads that commit, runs `scripts/catalog.mjs`, and copies manifests, previews and READMEs. A catalog that fails here fails the site's build.

## License

The scripts are MIT OR Apache-2.0. Each app's files belong to its author, who grants the right to show them on the Ely site.

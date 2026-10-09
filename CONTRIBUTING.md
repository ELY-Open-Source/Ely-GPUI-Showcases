# Contributing

Every merged app is listed. Featured placement is the maintainers' choice and may change.

## Files

- One folder per app: `apps/<app-id>/`. The id is lowercase letters, digits and single hyphens. The manifest's `id` matches it.
- File names in the folder are lowercase: letters, digits, `.`, `_`, `-`. `manifest.json` and `README.md` keep their names.
- The [README](README.md) lists every manifest field.

## Screenshots

- Capture the whole window: title bar, four corners, four edges.
- Use the original size. No scaling, no heavy compression. PNG only; convert, do not rename.
- Show real content. Close unrelated windows, menus, tooltips and notifications.
- Show the app as it ships. No device frames, captions or collages.
- The first file in `previews` is the cover. The others show different features.
- Commit every preview in the app folder. No URLs, no absolute paths, no `../`.

### macOS

Press Shift-Command-4, then Space, and click the window. Option-click drops the shadow.

### Windows

Focus the window and press Alt-Print Screen, or press Windows-Shift-S and pick Window mode. Paste into Paint and save as PNG.

### Linux

Use your desktop's window capture, such as GNOME's Print Screen and its Window mode.

## README and detail page

`apps/<app-id>/README.md` gives the app a detail page. At most 10,240 bytes.

- Describe the product: what it does, how it works, who it is for.
- Links go only to the manifest's `website` or `source`, exactly.
- Images are PNG files in the app folder, by name.
- No raw HTML, no code, inline or in blocks, and no install steps.
- Write characters as they are, not as `&...;` references.
- Any address in the text is the `website` or the `source`.

`pnpm validate` checks the size, the links, the addresses, the images and the markup. Maintainers read the words: a README that tells how to install is sent back.

## Pull request

Run `pnpm install`, `pnpm test` and `pnpm validate`. Then open the pull request. Maintainers may ask for better screenshots.

## Opening a pull request on git.zacharyzhang.com

Forking is disabled on this server. Open pull requests with AGit instead:

1. Register an account at https://git.zacharyzhang.com
2. Clone, commit your changes, then push to a `refs/for/<target-branch>` ref:

   ```bash
   git clone https://git.zacharyzhang.com/ZacharyZhang-NY/Ely-GPUI-Showcases.git
   git push origin HEAD:refs/for/main -o topic=<short-name> -o title="<PR title>" -o description="<PR body>"
   ```

3. To update the pull request, push again with the same `topic`.

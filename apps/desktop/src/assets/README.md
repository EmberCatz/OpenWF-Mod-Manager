# App assets

Local images/fonts bundled with the app itself — not mod content. Mod
thumbnails/screenshots stay external-link-only, see
[../../../docs/architecture.md](../../../docs/architecture.md).

Note this is separate from
[`../../src-tauri/icons/`](../../src-tauri/icons/), which holds the OS-level
app icon (taskbar/window/installer) that `tauri-build` requires — don't mix
the two up.

Drop files in the matching subfolder and tell me the filename(s) — I'll
wire them into the code.

| Folder | For | Notes |
|---|---|---|
| `thumbnails/` | Fallback images used *by* the app UI itself | `default-thumbnail.jpg` is wired in as the grid-view placeholder (`Browse.tsx`'s `DEFAULT_THUMBNAIL_URL`), shown when a mod has no thumbnailUrl — roughly 5:3 (e.g. 400x240) fits the grid card frame best |
| `icons/` | One-off raster/complex icons not worth hand-drawing as SVG | Most UI icons are inline SVG components in `../icons.tsx` already — only drop something here if it can't reasonably be a simple SVG |
| `logos/` | App branding (title bar, About section, etc.) | |
| `fonts/` | Custom font files (`.woff2` preferred) | Only needed if you want something other than the system font currently set in `styles.css` |

Any common format works (`.png`, `.jpg`, `.webp`, `.svg`, `.woff2`, etc.).

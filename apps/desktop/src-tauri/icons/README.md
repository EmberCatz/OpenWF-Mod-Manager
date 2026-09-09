These are placeholder icons (a flat brand-color square, generated via
`tauri icon` from a solid-color PNG) — good enough to make the build
succeed, not a real logo. Replace them once there's an actual design by
running:

```
npm run tauri icon path/to/source-icon.png --workspace apps/desktop
```

That regenerates `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`,
and `icon.ico`, which `tauri.conf.json` already points at.

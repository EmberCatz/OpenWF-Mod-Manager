Empty on purpose. Generate the real icon set from a source PNG with:

```
npm run tauri icon path/to/source-icon.png --workspace apps/desktop
```

This populates `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`,
and `icon.ico`, which `tauri.conf.json` already points at. The build will
fail until this has been run once.

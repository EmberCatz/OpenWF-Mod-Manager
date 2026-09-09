import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Standard Tauri + Vite setup: fixed dev port Tauri expects, and it ignores
// src-tauri/ so Rust rebuilds don't trigger a frontend HMR loop.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});

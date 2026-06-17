import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Config de Vite afinada para Tauri.
// El puerto fijo y el HMR explicito permiten que la webview de Tauri se conecte.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  // Evita que Vite oculte errores de Rust en consola.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // No vigilar el backend Rust desde el dev server del frontend.
      ignored: ["**/src-tauri/**"],
    },
  },
  // Tauri usa Chromium en Linux/Windows y WebKit en macOS.
  build: {
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});

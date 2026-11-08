import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Deterministic production build: force the production bundles of CJS deps
// (react/react-dom/scheduler pick the development variants when
// process.env.NODE_ENV is unset or set to something like "test"), and pin
// the production JSX transform (react/jsx-runtime instead of the dev one).
// Scoped to build only so the dev server keeps fast-refresh dev React.
export default defineConfig(({ command }) => ({
  ...(command === "build"
    ? {
        define: { "process.env.NODE_ENV": JSON.stringify("production") },
        esbuild: { jsxDev: false },
      }
    : {}),
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "लातूर शेतकरी खरेदी (Latur FPC)",
        short_name: "खरेदी ॲप",
        description: "लातूर शेतकरी उत्पादक कंपनी खरेदी व भरणा ॲप (Offline-First Procurement)",
        theme_color: "#1c1917",
        background_color: "#fafaf9",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          {
            src: "/icon.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,json}"],
        navigateFallback: "index.html",
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/devices": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/sync": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/purchases": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/sms-log": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
}));

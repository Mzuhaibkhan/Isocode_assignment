import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
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
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

const BACKEND_URL = process.env.VITE_API_URL || "https://solana-dexscreener-application-3.onrender.com";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5000,
    proxy: {
      // REST API  →  https://your-render-app.onrender.com/analytics/...
      "/api": {
        target: BACKEND_URL,
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      // WebSocket →  wss://your-render-app.onrender.com/ws
      "/ws": {
        target: BACKEND_URL.replace("https://", "wss://").replace("http://", "ws://"),
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    target: "esnext",
    minify: "esbuild",
  },
});


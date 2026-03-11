import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { resolve } from "path";

const BACKEND_URL = process.env.VITE_API_URL || "https://solana-dexscreener-project.onrender.com";

export default defineConfig({
  plugins: [
    react(), 
    tailwindcss(),
    nodePolyfills({
      include: ["buffer", "crypto", "stream", "util"],
      globals: { Buffer: true }
    })
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // REST API  →  https://your-render-app.onrender.com/analytics/...
      "/api": {
        target: BACKEND_URL,
        changeOrigin: true,
        secure: true,
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


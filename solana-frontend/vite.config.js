import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { resolve } from "path";

const BACKEND_URL = process.env.VITE_API_URL || "http://localhost:5000";

export default defineConfig({
  plugins: [
    react(), 
    tailwindcss(),
    nodePolyfills({
      globals: { Buffer: true, process: true }
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
      // REST API  →  http://localhost:5000/api/...
      "/api": {
        target: BACKEND_URL,
        changeOrigin: true,
        secure: false, // Local backend is HTTP
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            if (req.headers.cookie) {
              proxyReq.setHeader('cookie', req.headers.cookie);
            }
          });
        }
      },
      // WebSocket →  ws://localhost:5000/ws
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


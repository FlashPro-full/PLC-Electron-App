import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: __dirname,
  publicDir: false,
  server: {
    port: 5173,
    proxy: {
      "/socket.io": { target: "http://127.0.0.1:5049", ws: true },
      "/api": "http://127.0.0.1:5049",
      "/book-dict": "http://127.0.0.1:5049",
      "/get-settings": "http://127.0.0.1:5049",
      "/update-pushers": "http://127.0.0.1:5049",
      "/update-belt-speed": "http://127.0.0.1:5049",
      "/trigger-pusher": "http://127.0.0.1:5049",
      "/test-integration": "http://127.0.0.1:5049",
    },
  },
  build: {
    outDir: path.resolve(__dirname, "../../dist/client"),
    emptyOutDir: true,
  },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwind()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: process.env.JARVIS_API_TARGET || "http://127.0.0.1:8000",
      },
      "/ws": {
        target: (
          process.env.JARVIS_API_TARGET || "http://127.0.0.1:8000"
        ).replace(/^http/, "ws"),
        ws: true,
      },
    },
  },
  build: { chunkSizeWarningLimit: 650 },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 4312,
    strictPort: false,
    proxy: {
      "/api/v1": {
        target: process.env.VITE_NOTIFICATION_PROXY_TARGET || "http://127.0.0.1:8088",
        changeOrigin: true,
      },
      "/api/auth-v1": {
        target: process.env.VITE_AUTH_PROXY_TARGET || "http://127.0.0.1:5101",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/auth-v1/, "/api/v1"),
      },
    },
  },
  preview: {
    host: true,
    port: 4412,
  },
});

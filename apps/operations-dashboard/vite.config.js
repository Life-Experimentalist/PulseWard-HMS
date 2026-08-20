import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const port = Number(env.OPS_DASHBOARD_PORT || 4312);

  return {
    plugins: [react()],
    server: {
      host: true,
      port,
      strictPort: false,
      proxy: {
        "/api": {
          target: "http://localhost:8787",
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: true,
      port: port + 100,
    },
  };
});

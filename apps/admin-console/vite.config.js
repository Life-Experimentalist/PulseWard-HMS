import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const port = Number(env.ADMIN_CONSOLE_PORT || 4180);

  return {
    plugins: [react()],
    build: {
      target: "es2020",
      sourcemap: false,
      reportCompressedSize: false,
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ["react", "react-dom"],
          },
        },
      },
    },
    server: {
      host: "0.0.0.0",
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
      host: "0.0.0.0",
      port,
      strictPort: false,
    },
  };
});

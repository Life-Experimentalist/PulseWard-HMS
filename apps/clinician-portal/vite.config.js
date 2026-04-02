import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 4311,
    strictPort: false,
  },
  preview: {
    host: true,
    port: 4411,
  },
});

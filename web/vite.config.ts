import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/auth": "http://localhost:3000",
      "/devices": "http://localhost:3000",
      "/vaults": "http://localhost:3000",
      "/sync": "http://localhost:3000",
      "/health": "http://localhost:3000",
    },
  },
});

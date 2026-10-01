import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react-icons")) {
              return "icons";
            }
            if (id.includes("katex")) {
              return "katex";
            }
            if (
              id.includes("react-markdown") ||
              id.includes("remark-") ||
              id.includes("rehype-") ||
              id.includes("micromark") ||
              id.includes("mdast") ||
              id.includes("unist") ||
              id.includes("hast") ||
              id.includes("vfile") ||
              id.includes("property-information") ||
              id.includes("html-void-elements")
            ) {
              return "markdown-engine";
            }
            if (id.includes("@capacitor")) {
              return "capacitor";
            }
            if (id.includes("react") || id.includes("react-dom") || id.includes("scheduler")) {
              return "react-core";
            }
          }
        },
      },
    },
  },
});

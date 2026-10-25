import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwind()],
  server: { proxy: { "/api": "http://127.0.0.1:8787" } },
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        manualChunks: (id: string) =>
          id.includes("node_modules/react") ? "react" : undefined,
      },
    },
  },
});

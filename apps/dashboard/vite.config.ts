import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { nodePolyfills } from "vite-plugin-node-polyfills";

const port = (() => {
  const raw = process.env.PORT;
  if (!raw) return 5173;
  const parsed = Number(raw);
  if (Number.isNaN(parsed) || parsed <= 0) return 5173;
  return parsed;
})();

const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [
    nodePolyfills({
      globals: { Buffer: true, global: true, process: true },
      protocolImports: true,
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "vite-plugin-node-polyfills/shims/buffer": path.resolve(
        import.meta.dirname,
        "node_modules/vite-plugin-node-polyfills/shims/buffer"
      ),
      "vite-plugin-node-polyfills/shims/global": path.resolve(
        import.meta.dirname,
        "node_modules/vite-plugin-node-polyfills/shims/global"
      ),
      "vite-plugin-node-polyfills/shims/process": path.resolve(
        import.meta.dirname,
        "node_modules/vite-plugin-node-polyfills/shims/process"
      ),
    },
    dedupe: ["react", "react-dom", "@solana/web3.js", "@coral-xyz/anchor"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: false,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});

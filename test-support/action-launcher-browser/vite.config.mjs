import { defineConfig } from "vite";
import path from "node:path";

const root = path.resolve(process.cwd());
const fixturePath = path.resolve(root, "test-support/action-launcher-browser/fake-obr-sdk.js");

export default defineConfig({
  root,
  cacheDir: path.resolve(root, "node_modules/.vite/action-launcher-browser"),
  resolve: {
    alias: {
      "@owlbear-rodeo/sdk": fixturePath,
    },
  },
  optimizeDeps: {
    exclude: ["@owlbear-rodeo/sdk"],
  },
  server: {
    cors: true,
  },
});

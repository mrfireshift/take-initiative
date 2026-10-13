// Browser preview of the Boss Actions console with a simulated Owlbear SDK (no room required).
// npx vite --config test-support/boss-actions-browser/vite.config.mjs --port 5199
// then open /test-support/boss-actions-browser/frame.html?scenario=icekiss
import { defineConfig } from "vite";
import path from "node:path";

const root = path.resolve(process.cwd());

export default defineConfig({
  root,
  cacheDir: path.resolve(root, "node_modules/.vite/boss-actions-browser"),
  define: { __TAKE_INITIATIVE_BUILD_INFO__: JSON.stringify({ version: "preview" }) },
  resolve: {
    alias: {
      "@owlbear-rodeo/sdk": path.resolve(root, "test-support/boss-actions-browser/fake-obr-sdk.js"),
    },
  },
  optimizeDeps: {
    exclude: ["@owlbear-rodeo/sdk"],
  },
  server: {
    cors: true,
  },
});

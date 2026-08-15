import { defineConfig } from "vite";
import path from "node:path";

const root = path.resolve(process.cwd());

export default defineConfig({
  root,
  cacheDir: path.resolve(root, "node_modules/.vite/combat-log-browser"),
  plugins: [{
    name: "combat-log-browser-sdk-fixture",
    enforce: "pre",
    transform(code, id) {
      if (!id.includes(`${path.sep}src${path.sep}`)) return null;
      const next = code
        .replaceAll('from "@owlbear-rodeo/sdk"', 'from "/test-support/combat-log-browser/fake-obr-sdk.js"')
        .replaceAll("from '@owlbear-rodeo/sdk'", 'from "/test-support/combat-log-browser/fake-obr-sdk.js"')
        .replaceAll('import("@owlbear-rodeo/sdk")', 'import("/test-support/combat-log-browser/fake-obr-sdk.js")')
        .replaceAll("import('@owlbear-rodeo/sdk')", 'import("/test-support/combat-log-browser/fake-obr-sdk.js")');
      return next === code ? null : { code: next, map: null };
    },
  }],
  resolve: {
    alias: {
      "@owlbear-rodeo/sdk": path.resolve(root, "test-support/combat-log-browser/fake-obr-sdk.js"),
    },
  },
  optimizeDeps: {
    exclude: ["@owlbear-rodeo/sdk"],
  },
  server: {
    cors: true,
  },
});

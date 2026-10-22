// Table rotation lab (dev tool, no Owlbear room): a fake Owlbear page running the real userscript, with the real
// background bridge in a cross-origin iframe.
// npx vite --config test-support/table-rotation/vite.config.mjs --port 5197
// then open http://127.0.0.1:5197/test-support/table-rotation/host.html (the plugin iframe loads from localhost).
import { defineConfig } from "vite";
import path from "node:path";

const root = path.resolve(process.cwd());

export default defineConfig({
  root,
  cacheDir: path.resolve(root, "node_modules/.vite/table-rotation"),
  server: { host: "127.0.0.1", cors: true },
});

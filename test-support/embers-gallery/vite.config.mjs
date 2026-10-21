// Embers galleries and the JB2A library browser (dev tool, no Owlbear room).
// npx vite --config test-support/embers-gallery/vite.config.mjs --port 5198
// then open /test-support/embers-gallery/library.html
// /jb2a/<path> serves a file of the JB2A Patreon library, extracted on demand (see jb2aZip.mjs); /jb2a-shapes.json lists
// the library by shape.
import { defineConfig } from "vite";
import path from "node:path";
import { createReadStream } from "node:fs";
import { jb2aFile, jb2aShapes } from "./jb2aZip.mjs";

const root = path.resolve(process.cwd());
const TYPES = { ".webm": "video/webm", ".webp": "image/webp", ".json": "application/json" };

function jb2aLibrary() {
  return {
    name: "jb2a-library",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const url = decodeURIComponent((req.url || "").split("?")[0]);
          if (url === "/jb2a-shapes.json") {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(await jb2aShapes()));
            return;
          }
          if (!url.startsWith("/jb2a/")) return next();
          const relative = url.slice("/jb2a/".length);
          if (relative.includes("..")) throw new Error("Percorso non valido.");
          const file = await jb2aFile(relative);
          res.setHeader("Content-Type", TYPES[path.extname(file)] || "application/octet-stream");
          res.setHeader("Cache-Control", "max-age=86400");
          createReadStream(file).pipe(res);
        } catch (error) {
          res.statusCode = 404;
          res.end(String(error?.message || error));
        }
      });
    },
  };
}

export default defineConfig({
  root,
  cacheDir: path.resolve(root, "node_modules/.vite/embers-gallery"),
  plugins: [jb2aLibrary()],
  server: { cors: true },
});

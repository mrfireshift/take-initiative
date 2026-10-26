// Vite plugin, dev server only (`npm run dev`): POST /__perf-runs { name, content } saves a performance probe export
// as perf-runs/<name>.json, so the measurement session (src/perfSessionRunner.js) needs no copy and paste. The name is
// a short slug and an existing file is never overwritten: the next free "-2", "-3"… is used. Nothing is served back.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export const PERF_RUNS_ROUTE = "/__perf-runs";
const MAX_BODY_BYTES = 64 * 1024 * 1024;

export function perfRunFileName(directory, name, exists = existsSync) {
  const slug = String(name || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) throw new Error("nome non valido");
  for (let index = 1; index < 1000; index += 1) {
    const file = path.join(directory, `${slug}${index === 1 ? "" : `-${index}`}.json`);
    if (!exists(file)) return file;
  }
  throw new Error("troppi file con questo nome");
}

export function perfRunsDevPlugin({ directory = path.resolve(process.cwd(), "perf-runs") } = {}) {
  return {
    name: "take-initiative-perf-runs",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (String(request.url || "").split("?")[0] !== PERF_RUNS_ROUTE) return next();
        const fail = (status, message) => {
          response.statusCode = status;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: message }));
        };
        if (request.method !== "POST") return fail(405, "solo POST");
        const chunks = [];
        let bytes = 0;
        request.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes > MAX_BODY_BYTES) { fail(413, "export troppo grande"); request.destroy(); return; }
          chunks.push(chunk);
        });
        request.on("end", () => {
          if (response.writableEnded) return;
          try {
            const { name, content } = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            if (typeof content !== "string") throw new Error("contenuto mancante");
            JSON.parse(content);
            mkdirSync(directory, { recursive: true });
            const file = perfRunFileName(directory, name);
            writeFileSync(file, content);
            response.setHeader("Content-Type", "application/json; charset=utf-8");
            response.end(JSON.stringify({ file: path.relative(process.cwd(), file).replace(/\\/g, "/") }));
          } catch (error) {
            fail(400, String(error?.message || error));
          }
        });
      });
    },
  };
}

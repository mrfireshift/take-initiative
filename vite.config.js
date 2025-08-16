// vite.config.js
import { defineConfig } from "vite";
import path from "node:path";   // 👈 usa path cross-platform (Windows ok)

export default defineConfig({
  base: "/", // (se userai GitHub Pages con sottocartella, poi lo cambiamo)

  server: {
    cors: { origin: "https://www.owlbear.rodeo" },
  },

  build: {
    rollupOptions: {
      // 👇 usa percorsi ASSOLUTI (Windows-friendly)
      input: {
        main:    path.resolve(process.cwd(), "index.html"),
        ctxAdd:  path.resolve(process.cwd(), "ctx-add.html"),
        ctxMark: path.resolve(process.cwd(), "ctx-mark.html"),
      },
    },
  },
});

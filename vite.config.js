// vite.config.js
import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  base: "/", // se un giorno userai GitHub Pages in sottocartella, qui cambierai

  server: { cors: { origin: "https://www.owlbear.rodeo" } },

  build: {
    rollupOptions: {
      input: {
        main:    path.resolve(process.cwd(), "index.html"),
        ctxAdd:  path.resolve(process.cwd(), "ctx-add.html"),
        ctxMark: path.resolve(process.cwd(), "ctx-mark.html"),
      },
    },
  },
});
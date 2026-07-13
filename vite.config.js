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
        ctxSpells: path.resolve(process.cwd(), "ctx-spells.html"),
        ctxRemoveCondition: path.resolve(process.cwd(), "ctx-remove-condition.html"),
        effectsModal: path.resolve(process.cwd(), "effects-modal.html"),
        spellsModal: path.resolve(process.cwd(), "spells-modal.html"),
        historyModal: path.resolve(process.cwd(), "history-modal.html"),
      },
    },
  },
});

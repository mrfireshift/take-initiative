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
        actionLauncher: path.resolve(process.cwd(), "action-launcher.html"),
        background: path.resolve(process.cwd(), "background.html"),
        ctxAdd:  path.resolve(process.cwd(), "ctx-add.html"),
        ctxMark: path.resolve(process.cwd(), "ctx-mark.html"),
        ctxElevation: path.resolve(process.cwd(), "ctx-elevation.html"),
        ctxSpells: path.resolve(process.cwd(), "ctx-spells.html"),
        ctxRemoveCondition: path.resolve(process.cwd(), "ctx-remove-condition.html"),
        effectsModal: path.resolve(process.cwd(), "effects-modal.html"),
        spellsModal: path.resolve(process.cwd(), "spells-modal.html"),
        quickHpModal: path.resolve(process.cwd(), "quick-hp-modal.html"),
        historyModal: path.resolve(process.cwd(), "history-modal.html"),
        clocksModal: path.resolve(process.cwd(), "clocks-modal.html"),
        distance3dModal: path.resolve(process.cwd(), "distance-3d-modal.html"),
        aoeSettings: path.resolve(process.cwd(), "aoe-settings.html"),
        concentrationWarning: path.resolve(process.cwd(), "concentration-warning.html"),
        speedWarning: path.resolve(process.cwd(), "speed-warning.html"),
        turnNotice: path.resolve(process.cwd(), "turn-notice.html"),
        initiativeCardModal: path.resolve(process.cwd(), "initiative-card-modal.html"),
        factionConfigurator: path.resolve(process.cwd(), "faction-configurator.html"),
        compactEffects: path.resolve(process.cwd(), "compact-effects.html"),
      },
    },
  },
});

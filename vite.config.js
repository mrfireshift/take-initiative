// vite.config.js
import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { createBuildMetadata } from "./scripts/build-metadata.mjs";
import path from "node:path";   // 👈 usa path cross-platform (Windows ok)

const packageJson = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig(() => {
  const buildInfo = createBuildMetadata({ version: packageJson.version });

  return {
  base: "/", // (se userai GitHub Pages con sottocartella, poi lo cambiamo)

  define: {
    __TAKE_INITIATIVE_BUILD_INFO__: JSON.stringify(buildInfo),
  },

  plugins: [{
    name: "take-initiative-build-info",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "build-info.json",
        source: `${JSON.stringify(buildInfo, null, 2)}\n`,
      });
    },
  }],

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
        spellUnifiedPanel: path.resolve(process.cwd(), "spell-unified-panel.html"),
        referenceModal: path.resolve(process.cwd(), "reference-modal.html"),
        quickHpModal: path.resolve(process.cwd(), "quick-hp-modal.html"),
        historyModal: path.resolve(process.cwd(), "history-modal.html"),
        clocksModal: path.resolve(process.cwd(), "clocks-modal.html"),
        distance3dModal: path.resolve(process.cwd(), "distance-3d-modal.html"),
        aoeSettings: path.resolve(process.cwd(), "aoe-settings.html"),
        concentrationWarning: path.resolve(process.cwd(), "concentration-warning.html"),
        speedWarning: path.resolve(process.cwd(), "speed-warning.html"),
        turnNotice: path.resolve(process.cwd(), "turn-notice.html"),
        zoneTriggerNotice: path.resolve(process.cwd(), "zone-trigger-notice.html"),
        initiativeCardModal: path.resolve(process.cwd(), "initiative-card-modal.html"),
        factionConfigurator: path.resolve(process.cwd(), "faction-configurator.html"),
        compactEffects: path.resolve(process.cwd(), "compact-effects.html"),
        initiativeCardContextMenu: path.resolve(process.cwd(), "initiative-card-context-menu.html"),
        trackerQuickActions: path.resolve(process.cwd(), "tracker-quick-actions.html"),
        compactAdminMenu: path.resolve(process.cwd(), "compact-admin-menu.html"),
        compactRoundTab: path.resolve(process.cwd(), "compact-round-tab.html"),
        preparedSpellResolution: path.resolve(process.cwd(), "prepared-spell-resolution.html"),
        spellActiveResolution: path.resolve(process.cwd(), "spell-active-resolution.html"),
        delayedBlastFireballResolution: path.resolve(process.cwd(), "delayed-blast-fireball-resolution.html"),
        spellTurnActionChoice: path.resolve(process.cwd(), "spell-turn-action-choice.html"),
        customAuraModal: path.resolve(process.cwd(), "custom-aura-modal.html"),
        optionsModal: path.resolve(process.cwd(), "options-modal.html"),
      },
    },
  },
  };
});

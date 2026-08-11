const freeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
};

const damage = ({ formula, type, onSave = "none", baseSlot = 0, additionalPerSlotAbove = 0 }) => ({
  formula,
  type,
  onSave,
  ...(baseSlot > 0 ? { baseSlot } : {}),
  ...(additionalPerSlotAbove > 0 ? { additionalPerSlotAbove } : {}),
});

// Azioni ripetibili dopo il lancio. Il contratto è volutamente indipendente
// dalla Console HP: il pannello usa soltanto questa dichiarazione per
// esporre il comando e delega la risoluzione al popup dedicato.
export const SPELL_ACTIVE_RESOLUTION_ACTIONS = freeze({
  "call-lightning": [
    {
      id: "call-lightning-strike",
      label: "Richiama fulmine",
      buttonLabel: "Richiama fulmine",
      detail: "Azione: scegli il punto del fulmine e risolvi un TS Destrezza per le creature nella sagoma.",
      economy: "action",
      resolutionKind: "save-area",
      subjectMode: "none",
      requiresTargets: false,
      turnStartPrompt: true,
      placementRuleId: "call-lightning:cast",
      rangeOrigin: "caster",
      save: { ability: "dex", onSuccess: "half" },
      damage: damage({
        formula: "3d10",
        type: "fulmine",
        onSave: "half",
        baseSlot: 3,
        additionalPerSlotAbove: 1,
      }),
      naturalStormBonus: {
        formula: "1d10",
        type: "fulmine",
        label: "Bonus manuale per tempesta naturale",
      },
      requiresParentInstance: true,
    },
  ],
  "xanathar-investitura-della-fiamma": [
    {
      id: "flame-investiture-line",
      label: "Linea di fuoco",
      buttonLabel: "Linea di fuoco",
      detail: "Azione: traccia una linea di fuoco lunga 4,5 m e larga 1,5 m adiacente al caster.",
      economy: "action",
      resolutionKind: "save-area",
      subjectMode: "none",
      requiresTargets: false,
      turnStartPrompt: true,
      availableAfterCast: true,
      placementRuleId: "xanathar-investitura-della-fiamma:linea-di-fuoco",
      rangeOrigin: "caster",
      save: { ability: "dex", onSuccess: "half" },
      damage: damage({
        formula: "4d8",
        type: "fuoco",
        onSave: "half",
      }),
      requiresParentInstance: true,
    },
  ],
  "xanathar-sfera-della-tempesta": [
    {
      id: "storm-sphere-lightning",
      label: "Fulmine",
      buttonLabel: "Fulmine",
      detail: "Azione bonus: scegli una creatura entro 18 m dal centro della Sfera della Tempesta.",
      economy: "bonus-action",
      resolutionKind: "single-attack",
      subjectMode: "none",
      requiresTargets: false,
      turnStartPrompt: true,
      requiresZoneRoot: true,
      rangeOrigin: "root",
      range: { value: 18, unit: "m" },
      maxTargets: 1,
      attack: {
        outcomes: ["hit", "miss"],
        advantageWhen: "inside-root",
      },
      damage: damage({
        formula: "4d6",
        type: "fulmine",
        baseSlot: 4,
        additionalPerSlotAbove: 1,
      }),
      requiresParentInstance: true,
    },
  ],
});

export function getSpellActiveResolutionActions(spellId) {
  return SPELL_ACTIVE_RESOLUTION_ACTIONS[String(spellId || "").trim()] || [];
}

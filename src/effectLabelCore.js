const COMPACT_EFFECT_LABELS = Object.freeze({
  "Confusione: azioni e movimento casuali": "No reaz. · Tira d10 inizio turno",
  "Gravità invertita: sospeso": "Sospeso verso l'alto",
  "Lentezza: -2 CA/TS Des · no reazioni": "Vel. ½ · CA -2 · TS Des -2 · No reazioni · Azione O Bonus",
  "Zona di Verità: non può mentire": "Non può mentire",
  "Fulgore: invisibilità inefficace": "No invisibilità",
  "Acido ritardato: 5d4 a fine turno": "5d4 acido a fine turno",
  "Simpatia: attratto dalla destinazione": "Attratto alla destinazione",
  "Calma: indifferente agli ostili": "Indifferente agli ostili",
  "Mutaforma: bloccato nella forma originale": "Forma originale bloccata",
  "Discordia: svantaggio ad attacchi e prove": "Svant. attacchi/prove",
  "Disperazione: non può attaccare": "Non può attaccare",
  "Follia: azioni incontrollate": "Azioni incontrollate",
  "Taglia +1 · Vant. For/TS · +1d4": "Taglia +1 / Vant. For/TS / +1d4",
  "Taglia -1 · Svant. For/TS · -1d4": "Taglia -1 / Svant. For/TS / -1d4",
  "Vant. prove For · Trasporto x2": "Vant. For / Trasporto ×2",
  "Vant. prove Des · Cadute 6m": "Vant. Des / Cadute 6m",
  "Vant. prove Cos · 2d6 PF temp": "Vant. Cos / 2d6 PFt",
  "No reazioni · turno limitato": "No reazioni / turno limitato",
  "Res. acido/freddo/fulmine/fuoco/tuono": "Resistenze elementali",
  "Imm. freddo · Res. fuoco · aura ghiaccio": "Imm. freddo / Res. fuoco / aura ghiaccio",
  "Volo · attacchi distanza svant.": "Volo / svant. attacchi distanza",
  "Imm. fuoco · Res. freddo · aura fuoco": "Imm. fuoco / Res. freddo / aura fuoco",
  "Res. armi non magiche · passo nella roccia": "Res. armi non magiche / passo nella roccia",
  "Bestia: vant. attacchi vicino al caster": "Vant. attacchi vicino al caster",
  "Localizzato · invis. inefficace": "Localizzato / no invis.",
  "Oscurato · Res. radiosi · ritorsione": "Oscurato / Res. radiosi / ritorsione",
  "Prossimo attacco con arma: svant.": "Prossimo attacco: svant.",
  "Vel. max 3m · svantaggi · rischio spell": "Vel. 3m / svantaggi / TS per spell",
  "-1d6 Att/prove/TS concentrazione": "-1d6 Att/prove/TS",
  "1 attacco: vant. · +1d8 forza": "1 attacco: vant. / +1d8 forza",
  "Tenser: 50 PFt · vant. · +2d12 forza": "50 PFt / vant. / +2d12 forza",
  "Res. psichici · vant. TS Int/Sag/Car": "Res. psichici / vant. TS Int/Sag/Car",
  "Bestia: +3m · scurovisione · vant. For · +1d6": "+3m / scurovisione / vant. For / +1d6",
  "Albero: 10 PFt · vant. Cos · Des/Sag · terreno diff.": "10 PFt / vant. Cos / Des/Sag / terreno diff.",
  "+2 CA · volo · Imm. fuoco/veleno": "+2 CA / volo / Imm. fuoco/veleno",
  "+2 CA · volo · Imm. radiosi/necrotici": "+2 CA / volo / Imm. radiosi/necrotici",
  "Niente res. acido · +2d6/turno": "Acido: no res. / +2d6/turno",
  "Niente res. freddo · +2d6/turno": "Freddo: no res. / +2d6/turno",
  "Niente res. fulmine · +2d6/turno": "Fulmine: no res. / +2d6/turno",
  "Niente res. fuoco · +2d6/turno": "Fuoco: no res. / +2d6/turno",
  "Niente res. tuono · +2d6/turno": "Tuono: no res. / +2d6/turno",
  // Controllare Venti mantiene il dettaglio completo nel tooltip; la pill
  // sulla mappa usa una sintesi a riga singola.
  "Folate / Svantaggio a distanza / Controvento ×2": "Folate / Dist.− / Vento ×2",
  "Discendente / Svantaggio a distanza / TS Forza se vola": "Discendente / Dist.− / TS volo",
  "Ascendente / Caduta dimezzata / Salto in alto +3 m": "Ascendente / Caduta ½ / Salto +3",
});

const EFFECT_SUMMARY_PARTS = Object.freeze({
  "slow-penalty": Object.freeze([
    Object.freeze({ id: "speed-half", label: "Vel ½" }),
    Object.freeze({ id: "ac-dex-save-penalty", label: "CA −2 / TS Des −2" }),
    Object.freeze({ id: "no-reactions", label: "No reaz." }),
    Object.freeze({ id: "action-or-bonus", label: "Azione o Bonus" }),
    Object.freeze({ id: "attack-limit", label: "Max 1 att." }),
    Object.freeze({ id: "spell-delay", label: "Spell 1 az.: d20" }),
  ]),
  "fear-forced-flight": Object.freeze([
    Object.freeze({ id: "fear-flight", label: "Scatto: allontanati dal caster" }),
  ]),
  "confusion-random-turn": Object.freeze([
    Object.freeze({ id: "confusion-no-reactions", label: "No reaz." }),
    Object.freeze({ id: "confusion-random-table", label: "Tira d10 inizio turno" }),
  ]),
});

const EFFECT_SUMMARY_PARTS_BY_CONDITION = Object.freeze({
  "Lentezza: -2 CA/TS Des · no reazioni": EFFECT_SUMMARY_PARTS["slow-penalty"],
});

function normalizedSummaryParts(value) {
  return (Array.isArray(value) ? value : [])
    .map((part, index) => {
      const id = String(part?.id || part?.key || `part-${index + 1}`).trim();
      const label = String(part?.label || part?.text || "").trim();
      return id && label
        ? { id, label, ...(part?.stack === true ? { stack: true } : {}) }
        : null;
    })
    .filter(Boolean);
}

export function effectSummaryPartsFor(effect = {}) {
  const descriptor = typeof effect === "string"
    ? { effectId: effect }
    : effect && typeof effect === "object"
      ? effect
      : {};
  const effectId = String(descriptor.effectId || descriptor.id || "").trim();
  const condition = String(
    descriptor.condition || descriptor.conditionName || descriptor.name || "",
  ).trim();
  const configured = Array.isArray(descriptor.summaryParts)
    ? descriptor.summaryParts
    : EFFECT_SUMMARY_PARTS[effectId] || EFFECT_SUMMARY_PARTS_BY_CONDITION[condition] || [];
  return normalizedSummaryParts(configured);
}

export function compactSpellEffectLabel(value) {
  const label = String(value || "").trim();
  return (COMPACT_EFFECT_LABELS[label] || label).replace(/\s*·\s*/gu, " / ");
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function compactLinkedSpellEffectLabel(value, spellName) {
  const label = compactSpellEffectLabel(value);
  const title = String(spellName || "").trim();
  if (!label || !title) return label;

  const escapedTitle = escapeRegExp(title);
  const withoutPrefix = label.replace(
    new RegExp(`^\\s*${escapedTitle}\\s*(?:[:/–—-])\\s*`, "iu"),
    "",
  );
  const withoutSuffix = withoutPrefix.replace(
    new RegExp(`\\s*(?:[/–—-]\\s*|\\(\\s*)${escapedTitle}\\s*\\)?\\s*$`, "iu"),
    "",
  ).trim();
  return withoutSuffix || label;
}

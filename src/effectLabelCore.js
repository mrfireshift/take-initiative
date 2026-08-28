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
  ]),
  "fear-forced-flight": Object.freeze([
    Object.freeze({ id: "fear-flight", label: "Scatto: allontanati dal caster" }),
  ]),
  "confusion-random-turn": Object.freeze([
    Object.freeze({ id: "confusion-no-reactions", label: "No reaz." }),
    Object.freeze({ id: "confusion-random-table", label: "Tira d10 inizio turno" }),
  ]),
  "next-melee-hit-acido": Object.freeze([
    Object.freeze({ id: "absorb-elements-melee-damage-acido", label: "+1d6 acido in mischia" }),
  ]),
  "next-melee-hit-freddo": Object.freeze([
    Object.freeze({ id: "absorb-elements-melee-damage-freddo", label: "+1d6 freddo in mischia" }),
  ]),
  "next-melee-hit-fulmine": Object.freeze([
    Object.freeze({ id: "absorb-elements-melee-damage-fulmine", label: "+1d6 fulmine in mischia" }),
  ]),
  "next-melee-hit-fuoco": Object.freeze([
    Object.freeze({ id: "absorb-elements-melee-damage-fuoco", label: "+1d6 fuoco in mischia" }),
  ]),
  "next-melee-hit-tuono": Object.freeze([
    Object.freeze({ id: "absorb-elements-melee-damage-tuono", label: "+1d6 tuono in mischia" }),
  ]),
  "spirit-shroud-radiosi": Object.freeze([
    Object.freeze({ id: "spirit-shroud-radiosi-damage", label: "+1d8 radiosi entro 3m" }),
  ]),
  "spirit-shroud-necrotici": Object.freeze([
    Object.freeze({ id: "spirit-shroud-necrotici-damage", label: "+1d8 necrotici entro 3m" }),
  ]),
  "spirit-shroud-freddo": Object.freeze([
    Object.freeze({ id: "spirit-shroud-freddo-damage", label: "+1d8 freddo entro 3m" }),
  ]),
  "hail-of-thorns-trigger": Object.freeze([
    Object.freeze({ id: "hail-of-thorns-trigger-attack", label: "Pross. att. distanza" }),
    Object.freeze({ id: "hail-of-thorns-trigger-area", label: "Area 1,5 m" }),
    Object.freeze({ id: "hail-of-thorns-trigger-damage", label: "1d10 perforanti" }),
  ]),
  "lightning-arrow-trigger": Object.freeze([
    Object.freeze({ id: "lightning-arrow-trigger-attack", label: "Pross. att. distanza" }),
    Object.freeze({ id: "lightning-arrow-trigger-primary-damage", label: "4d8 fulmine" }),
    Object.freeze({ id: "lightning-arrow-trigger-area-damage", label: "Area 3 m: 2d8 fulmine" }),
  ]),
  "branding-smite-ready": Object.freeze([
    Object.freeze({ id: "branding-smite-trigger", label: "Pross. colpo" }),
    Object.freeze({ id: "branding-smite-trigger-damage", label: "+2d6 radiosi" }),
  ]),
  "ensnaring-strike-ready": Object.freeze([
    Object.freeze({ id: "ensnaring-strike-trigger", label: "Pross. colpo" }),
    Object.freeze({ id: "ensnaring-strike-recurring-damage", label: "1d6 perforanti/turno" }),
  ]),
  "wrathful-smite-ready": Object.freeze([
    Object.freeze({ id: "wrathful-smite-trigger", label: "Pross. colpo" }),
    Object.freeze({ id: "wrathful-smite-damage", label: "+1d6 psichici" }),
  ]),
  "searing-smite-ready": Object.freeze([
    Object.freeze({ id: "searing-smite-trigger", label: "Pross. colpo" }),
    Object.freeze({ id: "searing-smite-trigger-damage", label: "+1d6 fuoco" }),
    Object.freeze({ id: "searing-smite-trigger-recurring-damage", label: "1d6 fuoco/inizio turno" }),
  ]),
  "thunderous-smite-ready": Object.freeze([
    Object.freeze({ id: "thunderous-smite-trigger", label: "Pross. colpo" }),
    Object.freeze({ id: "thunderous-smite-damage", label: "+2d6 tuono" }),
    Object.freeze({ id: "thunderous-smite-push", label: "Spinta 3 m" }),
  ]),
  "hail-of-thorns-resolution": Object.freeze([
    Object.freeze({ id: "hail-of-thorns-resolution-area", label: "Area 1,5 m" }),
    Object.freeze({ id: "hail-of-thorns-resolution-damage", label: "1d10 perforanti" }),
  ]),
  "lightning-arrow-resolution": Object.freeze([
    Object.freeze({ id: "lightning-arrow-resolution-primary-damage", label: "4d8 fulmine" }),
    Object.freeze({ id: "lightning-arrow-resolution-area-damage", label: "Area 3 m: 2d8 fulmine" }),
  ]),
  "blinding-smite-ready": Object.freeze([
    Object.freeze({ id: "blinding-smite-trigger", label: "Pross. colpo" }),
    Object.freeze({ id: "blinding-smite-damage", label: "+3d8 radiosi" }),
  ]),
  "staggering-smite-ready": Object.freeze([
    Object.freeze({ id: "staggering-smite-trigger", label: "Pross. colpo" }),
    Object.freeze({ id: "staggering-smite-damage", label: "+4d6 psichici" }),
  ]),
  "banishing-smite-ready": Object.freeze([
    Object.freeze({ id: "banishing-smite-trigger", label: "Pross. colpo" }),
    Object.freeze({ id: "banishing-smite-damage", label: "+5d10 forza" }),
    Object.freeze({ id: "banishing-smite-threshold", label: "Esilio ≤50 PF" }),
  ]),
  "arms-of-hadar-no-reactions": Object.freeze([
    Object.freeze({ id: "arms-of-hadar-no-reactions", label: "No reaz." }),
  ]),
  "compulsion-forced-movement": Object.freeze([
    Object.freeze({ id: "compulsion-forced-movement", label: "Movimento imposto" }),
  ]),
  "reverse-gravity-suspended": Object.freeze([
    Object.freeze({ id: "reverse-gravity-suspended", label: "Sospeso" }),
  ]),
  "stinking-cloud-lost-action": Object.freeze([
    Object.freeze({ id: "stinking-cloud-lost-action", label: "Azione persa" }),
  ]),
  "zone-of-truth-no-lies": Object.freeze([
    Object.freeze({ id: "zone-of-truth-no-lies", label: "No menzogne" }),
  ]),
  "ice-investiture-slow": Object.freeze([
    Object.freeze({ id: "ice-investiture-slow", label: "Vel ½" }),
  ]),
  "sympathy-attraction": Object.freeze([
    Object.freeze({ id: "sympathy-attraction", label: "Verso destinazione" }),
  ]),
  "calm-emotions-indifference": Object.freeze([
    Object.freeze({ id: "calm-emotions-indifference", label: "Indifferente ostili" }),
  ]),
  "moonbeam-shapechanger-reversion": Object.freeze([
    Object.freeze({ id: "moonbeam-shapechanger-form", label: "Forma originale" }),
    Object.freeze({ id: "moonbeam-shapechanger-no-change", label: "No nuova forma" }),
  ]),
  "zephyr-strike-speed": Object.freeze([
    Object.freeze({ id: "zephyr-strike-speed", label: "Vel +9 m" }),
  ]),
  "gaseous-form-movement": Object.freeze([
    Object.freeze({ id: "gaseous-form-fly-only", label: "Solo volo 3 m" }),
  ]),
  "calm-emotions-suppression": Object.freeze([
    Object.freeze({ id: "calm-emotions-suppressed", label: "Aff./Spav. soppressi" }),
  ]),
  "eyebite-panicked": Object.freeze([
    Object.freeze({ id: "eyebite-forced-flight", label: "Scatto: allontanati dal caster" }),
  ]),
  "eyebite-sickened": Object.freeze([
    Object.freeze({ id: "eyebite-attack-check-penalty", label: "Svant. attacchi/prove" }),
  ]),
  "ensnaring-strike-damage": Object.freeze([
    Object.freeze({ id: "ensnaring-strike-recurring-damage", label: "Danni perforanti/turno" }),
  ]),
  "banishing-smite-demiplane": Object.freeze([
    Object.freeze({ id: "banishing-smite-exiled", label: "Esiliato" }),
  ]),
  "banishing-smite-home-plane": Object.freeze([
    Object.freeze({ id: "banishing-smite-exiled", label: "Esiliato" }),
  ]),
  "symbol-discord": Object.freeze([
    Object.freeze({ id: "symbol-discord-attacks", label: "Svant. attacchi" }),
    Object.freeze({ id: "symbol-discord-checks", label: "Svant. prove" }),
  ]),
  "symbol-despair": Object.freeze([
    Object.freeze({ id: "symbol-despair-no-attacks", label: "No attacchi" }),
    Object.freeze({ id: "symbol-despair-no-harmful-targets", label: "No bersagli dannosi" }),
  ]),
  "symbol-insanity": Object.freeze([
    Object.freeze({ id: "symbol-insanity-no-actions", label: "No azioni" }),
    Object.freeze({ id: "symbol-insanity-no-communication", label: "No parole/compr." }),
    Object.freeze({ id: "symbol-insanity-gm-movement", label: "Mov. controllato GM" }),
  ]),
  "attack-save-penalty": Object.freeze([
    Object.freeze({ id: "bane-attack-penalty", label: "Att −1d4" }),
    Object.freeze({ id: "bane-save-penalty", label: "TS −1d4" }),
  ]),
  "attack-save-bonus": Object.freeze([
    Object.freeze({ id: "bless-attack-bonus", label: "Att +1d4" }),
    Object.freeze({ id: "bless-save-bonus", label: "TS +1d4" }),
  ]),
  "hex-forza": Object.freeze([
    Object.freeze({ id: "hex-damage-bonus", label: "+1d6 necrotici dal caster" }),
    Object.freeze({ id: "hex-ability-check-disadvantage", label: "Svant. prove Forza" }),
  ]),
  "hex-destrezza": Object.freeze([
    Object.freeze({ id: "hex-damage-bonus", label: "+1d6 necrotici dal caster" }),
    Object.freeze({ id: "hex-ability-check-disadvantage", label: "Svant. prove Destrezza" }),
  ]),
  "hex-costituzione": Object.freeze([
    Object.freeze({ id: "hex-damage-bonus", label: "+1d6 necrotici dal caster" }),
    Object.freeze({ id: "hex-ability-check-disadvantage", label: "Svant. prove Costituzione" }),
  ]),
  "hex-intelligenza": Object.freeze([
    Object.freeze({ id: "hex-damage-bonus", label: "+1d6 necrotici dal caster" }),
    Object.freeze({ id: "hex-ability-check-disadvantage", label: "Svant. prove Intelligenza" }),
  ]),
  "hex-saggezza": Object.freeze([
    Object.freeze({ id: "hex-damage-bonus", label: "+1d6 necrotici dal caster" }),
    Object.freeze({ id: "hex-ability-check-disadvantage", label: "Svant. prove Saggezza" }),
  ]),
  "hex-carisma": Object.freeze([
    Object.freeze({ id: "hex-damage-bonus", label: "+1d6 necrotici dal caster" }),
    Object.freeze({ id: "hex-ability-check-disadvantage", label: "Svant. prove Carisma" }),
  ]),
  "agathys-armor": Object.freeze([
    Object.freeze({ id: "agathys-temporary-hit-points", label: "5 PF temp." }),
    Object.freeze({ id: "agathys-cold-retaliation", label: "5 danni freddo in mischia" }),
  ]),
  "magic-weapon-bonus": Object.freeze([
    Object.freeze({ id: "magic-weapon-magical", label: "Arma magica" }),
    Object.freeze({ id: "magic-weapon-attack-damage-bonus", label: "+1 Att/danni" }),
  ]),
  "flame-blade-damage": Object.freeze([
    Object.freeze({ id: "flame-blade-fire-damage", label: "3d6 fuoco" }),
  ]),
  "xanathar-lama-dombra-damage": Object.freeze([
    Object.freeze({ id: "xanathar-lama-dombra-psychic-damage", label: "2d8 psichici" }),
  ]),
  "elemental-weapon-acido": Object.freeze([
    Object.freeze({ id: "elemental-weapon-acido-magical", label: "Arma magica" }),
    Object.freeze({ id: "elemental-weapon-acido-attack-bonus", label: "+1 Att" }),
    Object.freeze({ id: "elemental-weapon-acido-damage", label: "+1d4 acido" }),
  ]),
  "elemental-weapon-freddo": Object.freeze([
    Object.freeze({ id: "elemental-weapon-freddo-magical", label: "Arma magica" }),
    Object.freeze({ id: "elemental-weapon-freddo-attack-bonus", label: "+1 Att" }),
    Object.freeze({ id: "elemental-weapon-freddo-damage", label: "+1d4 freddo" }),
  ]),
  "elemental-weapon-fulmine": Object.freeze([
    Object.freeze({ id: "elemental-weapon-fulmine-magical", label: "Arma magica" }),
    Object.freeze({ id: "elemental-weapon-fulmine-attack-bonus", label: "+1 Att" }),
    Object.freeze({ id: "elemental-weapon-fulmine-damage", label: "+1d4 fulmine" }),
  ]),
  "elemental-weapon-fuoco": Object.freeze([
    Object.freeze({ id: "elemental-weapon-fuoco-magical", label: "Arma magica" }),
    Object.freeze({ id: "elemental-weapon-fuoco-attack-bonus", label: "+1 Att" }),
    Object.freeze({ id: "elemental-weapon-fuoco-damage", label: "+1d4 fuoco" }),
  ]),
  "elemental-weapon-tuono": Object.freeze([
    Object.freeze({ id: "elemental-weapon-tuono-magical", label: "Arma magica" }),
    Object.freeze({ id: "elemental-weapon-tuono-attack-bonus", label: "+1 Att" }),
    Object.freeze({ id: "elemental-weapon-tuono-damage", label: "+1d4 tuono" }),
  ]),
  "ray-of-enfeeblement-penalty": Object.freeze([
    Object.freeze({ id: "ray-of-enfeeblement-strength-damage", label: "Danni Forza dimezzati" }),
  ]),
  "witch-bolt-link": Object.freeze([
    Object.freeze({ id: "witch-bolt-damage", label: "1d12 fulmine" }),
    Object.freeze({ id: "witch-bolt-repeat-action", label: "Azione: ripeti" }),
  ]),
  "searing-smite-burning": Object.freeze([
    Object.freeze({ id: "searing-smite-save", label: "TS Cos inizio turno" }),
    Object.freeze({ id: "searing-smite-fire-damage", label: "1d6 fuoco" }),
  ]),
  "grasping-vine-command": Object.freeze([
    Object.freeze({ id: "grasping-vine-bonus-action", label: "Azione bonus" }),
    Object.freeze({ id: "grasping-vine-pull", label: "Trascina 6 m" }),
  ]),
  "swift-quiver-attacks": Object.freeze([
    Object.freeze({ id: "swift-quiver-bonus-action", label: "Azione bonus" }),
    Object.freeze({ id: "swift-quiver-two-attacks", label: "2 attacchi distanza" }),
  ]),
  "no-reaction-and-limited-turn-options": Object.freeze([
    Object.freeze({ id: "mind-whip-no-reactions", label: "No reaz." }),
    Object.freeze({ id: "mind-whip-limited-turn", label: "Solo mov./az./bonus" }),
  ]),
  "incoming-attack-advantage": Object.freeze([
    Object.freeze({ id: "faerie-fire-incoming-advantage", label: "Attacchi contro vant." }),
    Object.freeze({ id: "faerie-fire-no-invisibility", label: "No invis." }),
  ]),
  "location-known": Object.freeze([
    Object.freeze({ id: "mind-spike-location", label: "Localizzato" }),
    Object.freeze({ id: "mind-spike-no-hiding", label: "No nascondersi" }),
    Object.freeze({ id: "mind-spike-no-invisibility", label: "No invis." }),
  ]),
  "ice-investiture": Object.freeze([
    Object.freeze({ id: "ice-investiture-cold-immunity", label: "Imm. freddo" }),
    Object.freeze({ id: "ice-investiture-fire-resistance", label: "Res. fuoco" }),
    Object.freeze({ id: "ice-investiture-difficult-terrain-aura", label: "Terreno diff. aura" }),
  ]),
  "wind-investiture": Object.freeze([
    Object.freeze({ id: "wind-investiture-flight", label: "Volo 18 m" }),
    Object.freeze({ id: "wind-investiture-ranged-disadvantage", label: "Svant. att. distanza" }),
  ]),
  "flame-investiture": Object.freeze([
    Object.freeze({ id: "flame-investiture-fire-immunity", label: "Imm. fuoco" }),
    Object.freeze({ id: "flame-investiture-cold-resistance", label: "Res. freddo" }),
  ]),
  "stone-investiture": Object.freeze([
    Object.freeze({ id: "stone-investiture-weapon-resistance", label: "Res. armi non magiche" }),
    Object.freeze({ id: "stone-investiture-rock-walk", label: "Passo nella roccia" }),
  ]),
  "freedom-of-movement-immunities": Object.freeze([
    Object.freeze({ id: "freedom-of-movement-difficult-terrain", label: "No terreno diff." }),
    Object.freeze({ id: "freedom-of-movement-speed-reduction", label: "No riduz. velocità mag." }),
    Object.freeze({ id: "freedom-of-movement-condition-immunity", label: "Imm. Par./Tratt. mag." }),
    Object.freeze({ id: "freedom-of-movement-escape", label: "Libera con 1,5 m" }),
  ]),
  "holy-aura-protection": Object.freeze([
    Object.freeze({ id: "holy-aura-saving-throw-advantage", label: "Vant. TS" }),
    Object.freeze({ id: "holy-aura-incoming-attack-disadvantage", label: "Attacchi contro svant." }),
  ]),
  "tensers-transformation": Object.freeze([
    Object.freeze({ id: "tensers-temporary-hit-points", label: "50 PF temp." }),
    Object.freeze({ id: "tensers-weapon-attack-advantage", label: "Vant. att. armi" }),
    Object.freeze({ id: "tensers-force-damage", label: "+2d12 forza" }),
    Object.freeze({ id: "tensers-martial-proficiency", label: "Comp. marziali" }),
  ]),
  "aura-of-purity": Object.freeze([
    Object.freeze({ id: "aura-of-purity-poison-resistance", label: "Res. veleno" }),
    Object.freeze({ id: "aura-of-purity-disease-immunity", label: "Imm. malattie" }),
    Object.freeze({ id: "aura-of-purity-condition-save-advantage", label: "Vant. TS condizioni" }),
  ]),
  "aura-of-life": Object.freeze([
    Object.freeze({ id: "aura-of-life-necrotic-resistance", label: "Res. necrotici" }),
    Object.freeze({ id: "aura-of-life-hit-point-maximum", label: "Max PF protetto" }),
    Object.freeze({ id: "aura-of-life-heal-at-zero", label: "+1 PF a 0" }),
  ]),
  "circle-of-power": Object.freeze([
    Object.freeze({ id: "circle-of-power-magic-save-advantage", label: "Vant. TS magia" }),
    Object.freeze({ id: "circle-of-power-zero-save-damage", label: "TS riuscito: 0 danni" }),
  ]),
  "aura-of-purity-zone": Object.freeze([
    Object.freeze({ id: "aura-of-purity-poison-resistance", label: "Res. veleno" }),
    Object.freeze({ id: "aura-of-purity-disease-immunity", label: "Imm. malattie" }),
    Object.freeze({ id: "aura-of-purity-condition-save-advantage", label: "Vant. TS condizioni" }),
  ]),
  "aura-of-life-zone": Object.freeze([
    Object.freeze({ id: "aura-of-life-necrotic-resistance", label: "Res. necrotici" }),
    Object.freeze({ id: "aura-of-life-hit-point-maximum", label: "Max PF protetto" }),
    Object.freeze({ id: "aura-of-life-heal-at-zero", label: "+1 PF a 0" }),
  ]),
  "circle-of-power-zone": Object.freeze([
    Object.freeze({ id: "circle-of-power-magic-save-advantage", label: "Vant. TS magia" }),
    Object.freeze({ id: "circle-of-power-zero-save-damage", label: "TS riuscito: 0 danni" }),
  ]),
  "enervation-link": Object.freeze([
    Object.freeze({ id: "enervation-repeat-damage", label: "Azione: ripeti danni" }),
    Object.freeze({ id: "enervation-heal-half", label: "Cura metà danni" }),
  ]),
  "immolation-burning": Object.freeze([
    Object.freeze({ id: "immolation-end-turn-save", label: "TS Des fine turno" }),
    Object.freeze({ id: "immolation-fire-damage", label: "4d6 fuoco" }),
  ]),
  "holy-weapon": Object.freeze([
    Object.freeze({ id: "holy-weapon-magical", label: "Arma magica" }),
    Object.freeze({ id: "holy-weapon-radiant-damage", label: "+2d8 radiosi" }),
  ]),
  "elemental-resistances": Object.freeze([
    Object.freeze({ id: "elemental-resistances-five-types", label: "Res. 5 elementi" }),
    Object.freeze({ id: "elemental-resistances-reaction-immunity", label: "Reaz.: Imm. tipo" }),
  ]),
  "intellect-fortress": Object.freeze([
    Object.freeze({ id: "intellect-fortress-psychic-resistance", label: "Res. psichici" }),
    Object.freeze({ id: "intellect-fortress-mental-save-advantage", label: "Vant. TS Int/Sag/Car" }),
  ]),
  "feign-death-protections": Object.freeze([
    Object.freeze({ id: "feign-death-damage-resistance", label: "Res. danni (no psichici)" }),
    Object.freeze({ id: "feign-death-speed-zero", label: "Vel 0" }),
    Object.freeze({ id: "feign-death-disease-poison-suspended", label: "Malattie/veleno sospesi" }),
  ]),
  "primal-beast-benefits": Object.freeze([
    Object.freeze({ id: "primal-beast-speed", label: "Vel +3 m" }),
    Object.freeze({ id: "primal-beast-darkvision", label: "Scurovisione" }),
    Object.freeze({ id: "primal-beast-strength-advantage", label: "Vant. att. Forza" }),
    Object.freeze({ id: "primal-beast-force-damage", label: "+1d6 forza" }),
  ]),
  "great-tree-benefits": Object.freeze([
    Object.freeze({ id: "great-tree-temporary-hit-points", label: "10 PF temp." }),
    Object.freeze({ id: "great-tree-constitution-save-advantage", label: "Vant. TS Cos" }),
    Object.freeze({ id: "great-tree-dex-wis-attack-advantage", label: "Vant. att. Des/Sag" }),
    Object.freeze({ id: "great-tree-difficult-terrain-aura", label: "Terreno diff. aura" }),
  ]),
  "lower-planes-benefits": Object.freeze([
    Object.freeze({ id: "lower-planes-armor-class", label: "+2 CA" }),
    Object.freeze({ id: "lower-planes-flight", label: "Volo 12 m" }),
    Object.freeze({ id: "lower-planes-elemental-immunity", label: "Imm. fuoco/veleno" }),
    Object.freeze({ id: "lower-planes-poisoned-immunity", label: "Imm. avvelenato" }),
    Object.freeze({ id: "lower-planes-magical-attacks", label: "Attacchi magici" }),
    Object.freeze({ id: "lower-planes-extra-attack", label: "Attacco extra" }),
  ]),
  "upper-planes-benefits": Object.freeze([
    Object.freeze({ id: "upper-planes-armor-class", label: "+2 CA" }),
    Object.freeze({ id: "upper-planes-flight", label: "Volo 12 m" }),
    Object.freeze({ id: "upper-planes-elemental-immunity", label: "Imm. radiosi/necrotici" }),
    Object.freeze({ id: "upper-planes-charmed-immunity", label: "Imm. affascinato" }),
    Object.freeze({ id: "upper-planes-magical-attacks", label: "Attacchi magici" }),
    Object.freeze({ id: "upper-planes-extra-attack", label: "Attacco extra" }),
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

function isSaveReminderSummaryPart(part, effect) {
  if (!effect?.saveReminder) return false;
  const id = String(part?.id || "").trim().toLocaleLowerCase("it");
  return /(?:^|-)save(?::.*)?$/u.test(id);
}

function summaryPartsWithResolvedMechanics(parts, effectId, mechanics) {
  if (!mechanics || typeof mechanics !== "object") return parts;
  const temporaryHitPoints = Number(mechanics.tempHp?.amount);
  const retaliationDamage = Number(mechanics.retaliationDamage?.amount);
  const damageType = String(mechanics.retaliationDamage?.type || "freddo").trim();
  const weaponBonus = Number(mechanics.weaponBonus?.bonus);
  const attackBonus = Number(mechanics.attackRoll?.bonus);
  const damageDice = String(mechanics.damageBonus?.dice || "").trim();
  const bonusDamageType = String(mechanics.damageBonus?.type || "").trim();
  const areaDamageDice = String(mechanics.areaDamage?.dice || "").trim();
  const areaDamageType = String(mechanics.areaDamage?.type || "").trim();
  const replacementDamageDice = String(mechanics.damageReplacement?.dice || "").trim();
  const replacementDamageType = String(mechanics.damageReplacement?.type || "").trim();
  return parts.map((part) => {
    if (effectId === "agathys-armor"
      && part.id === "agathys-temporary-hit-points"
      && Number.isFinite(temporaryHitPoints)) {
      return { ...part, label: `${Math.round(temporaryHitPoints)} PF temp.` };
    }
    if (effectId === "agathys-armor"
      && part.id === "agathys-cold-retaliation"
      && Number.isFinite(retaliationDamage)) {
      return { ...part, label: `${Math.round(retaliationDamage)} danni ${damageType} in mischia` };
    }
    if (effectId === "magic-weapon-bonus"
      && part.id === "magic-weapon-attack-damage-bonus"
      && Number.isFinite(weaponBonus)) {
      return { ...part, label: `+${Math.round(weaponBonus)} Att/danni` };
    }
    if (effectId === "flame-blade-damage"
      && part.id === "flame-blade-fire-damage"
      && damageDice) {
      return { ...part, label: `${damageDice} ${bonusDamageType || "fuoco"}` };
    }
    if (effectId === "xanathar-lama-dombra-damage"
      && part.id === "xanathar-lama-dombra-psychic-damage"
      && damageDice) {
      return { ...part, label: `${damageDice} ${bonusDamageType || "psichici"}` };
    }
    if (effectId === "next-melee-hit-acido"
      || effectId === "next-melee-hit-freddo"
      || effectId === "next-melee-hit-fulmine"
      || effectId === "next-melee-hit-fuoco"
      || effectId === "next-melee-hit-tuono") {
      if (part.id.startsWith("absorb-elements-melee-damage-") && damageDice) {
        const type = bonusDamageType || effectId.slice("next-melee-hit-".length);
        return { ...part, label: `+${damageDice} ${type} in mischia` };
      }
    }
    if (effectId.startsWith("spirit-shroud-")
      && part.id.endsWith("-damage")
      && damageDice) {
      const type = bonusDamageType || effectId.slice("spirit-shroud-".length);
      return { ...part, label: `+${damageDice} ${type} entro 3m` };
    }
    if (effectId === "hail-of-thorns-trigger"
      && part.id === "hail-of-thorns-trigger-damage"
      && areaDamageDice) {
      return { ...part, label: `${areaDamageDice} ${areaDamageType || "perforanti"}` };
    }
    if (effectId === "lightning-arrow-trigger"
      && part.id === "lightning-arrow-trigger-primary-damage"
      && replacementDamageDice) {
      return { ...part, label: `${replacementDamageDice} ${replacementDamageType || "fulmine"}` };
    }
    if (effectId === "lightning-arrow-trigger"
      && part.id === "lightning-arrow-trigger-area-damage"
      && areaDamageDice) {
      return { ...part, label: `Area 3 m: ${areaDamageDice} ${areaDamageType || "fulmine"}` };
    }
    if (effectId.startsWith("elemental-weapon-")
      && part.id.endsWith("-attack-bonus")
      && Number.isFinite(attackBonus)) {
      return { ...part, label: `+${Math.round(attackBonus)} Att` };
    }
    if (effectId.startsWith("elemental-weapon-")
      && part.id.endsWith("-damage")
      && damageDice) {
      const type = bonusDamageType || effectId.slice("elemental-weapon-".length);
      return { ...part, label: `+${damageDice} ${type}` };
    }
    return part;
  });
}

export function effectSummaryPartsFor(effect = {}, options = {}) {
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
  const normalizedParts = normalizedSummaryParts(configured);
  const presentationParts = options?.suppressSaveReminderParts
    ? normalizedParts.filter((part) => !isSaveReminderSummaryPart(part, descriptor))
    : normalizedParts;
  return summaryPartsWithResolvedMechanics(
    presentationParts,
    effectId,
    descriptor.mechanics,
  );
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

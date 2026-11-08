// Reaction prompts, lot R0 (docs/STUDIO_AVVISI_REAZIONE.md): the reactions the plugin can notice, by the moment it
// sees (PHB 2014 and the 2014 supplements). Pure data: nothing here is spent or written. reactionCandidatesCore.js reads
// it against an event; the prompt (lot R1 on) shows the candidates and its Usa opens the flow named by `flow`.
//
// trigger, the moment the plugin sees:
// - "hit": the GM picks Hit or Critical in the attack console or the Boss console;
// - "damage": an outcome with damage (a hit, a failed or a passed save), before Registra;
// - "miss": the GM picks Miss;
// - "spell-cast": a creature casts a spell (the spell panel, the 🪄 menu, the attack console);
// - "move-leave" / "move-enter": a creature leaves or enters another's reach (the Speed Tracker, lot R5);
// - "turn-end-near": a creature ends its turn near another.
// timing: "before" changes the outcome or the damage of the trigger, so it is decided before the write (the console
// stops); "after" answers without changing it, so it is a notice.
// protects: "self" (the reactor is the target), "self-or-ally" (the reactor or a friendly creature within
// rangeMeters of it), "ally" (a friendly creature other than the reactor, within rangeMeters), "other" (a creature
// other than the reactor, the attacker hostile to the reactor and within attackerRangeMeters of it).
// requiresReactorCondition / requiresAttackerCondition: an active pill on the reactor (Rage, Bladesong) or, from the
// reactor, on the attacker (Hexblade's Curse).
// attackerRangeMeters: the attacker within this distance of the reactor (unknown distance: the reaction stays).
// filters: range ("melee" | "ranged"), attackRoll (an attack with a roll), critical, damageTypes (any of them).
// flow: what Usa opens, an existing flow: "cast-spell" (castReactionSpell), "spell-panel" (openReactionSpellPanel),
// "use-feature" (the Capacità tab's use: resource and reaction), "off-turn-attack" (the console off turn, with the
// reaction), "counterspell" (openCounterspellPopover), "note" (the rule only: the GM applies it at the table).
// effect: what the reaction does, for the prompt's text and, from lot R3, the modifier ("ac-bonus", "halve",
// "reduce", "resistance", "downgrade-critical", "reroll", "retaliation", "attack", "counter", "other").
// lot: the lot of the study that wires it.

export const REACTION_TRIGGERS = Object.freeze(["hit", "damage", "miss", "spell-cast", "move-leave", "move-enter", "turn-end-near"]);
export const REACTION_TIMINGS = Object.freeze(["before", "after"]);
export const REACTION_FLOWS = Object.freeze(["cast-spell", "spell-panel", "use-feature", "off-turn-attack", "counterspell", "note"]);

// The option switch of each trigger (reactionPromptOptions in reactionCandidatesCore.js).
export const REACTION_TRIGGER_OPTION = Object.freeze({
  hit: "hit", damage: "damage", miss: "miss", "spell-cast": "spellCast",
  "move-leave": "move", "move-enter": "move", "turn-end-near": "move",
});

export const ELEMENTAL_DAMAGE_TYPES = Object.freeze(["acid", "cold", "fire", "lightning", "thunder"]);

const entry = (value) => Object.freeze({
  protects: "self",
  rangeMeters: null,
  attackerRangeMeters: null,
  filters: Object.freeze({}),
  ...value,
  ...(value.filters ? { filters: Object.freeze({ ...value.filters }) } : {}),
  triggers: Object.freeze([...value.triggers]),
  ...(value.featureIds ? { featureIds: Object.freeze([...value.featureIds]) } : {}),
  effect: Object.freeze({ ...value.effect }),
});
const spell = (value) => entry({ source: "spell", ...value });
const feature = (value) => entry({ source: "class-feature", flow: "use-feature", ...value });

export const REACTION_TRIGGER_CATALOG = Object.freeze([
  // A. Hit, before the damage: they change the outcome.
  spell({ id: "shield", label: "Scudo", spellId: "shield", slotLevel: 1, triggers: ["hit"], timing: "before",
    filters: { attackRoll: true }, skipIfActiveSpell: true, flow: "cast-spell", lot: "R1",
    effect: { kind: "ac-bonus", amount: 5 }, short: "+5 CA",
    rule: "+5 CA fino al suo prossimo turno, anche contro questo attacco." }),
  feature({ id: "beast-tail", label: "Coda", featureIds: ["barbaro-cammino-della-bestia-forma-della-bestia-coda"],
    triggers: ["hit"], timing: "before", filters: { attackRoll: true }, attackerRangeMeters: 3, lot: "R3a",
    effect: { kind: "ac-bonus", dice: "1d8" }, short: "+1d8 CA",
    rule: "Colpito da un attacco con tiro entro 3 m: tira 1d8 e lo aggiunge alla CA, anche contro questo attacco." }),
  feature({ id: "arcane-deflection", label: "Deviazione Arcana", featureIds: ["mago-magia-della-guerra-deviazione-arcana"],
    triggers: ["hit"], timing: "before", filters: { attackRoll: true }, lot: "R3a",
    effect: { kind: "ac-bonus", amount: 2 }, short: "+2 CA",
    rule: "+2 CA contro l'attacco; fino alla fine del suo prossimo turno lancia solo trucchetti." }),
  feature({ id: "glorious-defense", label: "Difesa Gloriosa", featureIds: ["paladino-giuramento-di-gloria-difesa-gloriosa"],
    triggers: ["hit"], timing: "before", protects: "self-or-ally", rangeMeters: 3, filters: { attackRoll: true }, lot: "R3a",
    effect: { kind: "ac-bonus", ability: "cha" }, short: "+ Car alla CA",
    rule: "Lui o una creatura entro 3 m colpita: + modificatore di Carisma alla CA; se l'attacco manca, un attacco con arma contro l'attaccante." }),
  feature({ id: "warding-maneuver", label: "Manovra Protettrice", featureIds: ["guerriero-cavaliere-errante-manovra-protettrice"],
    triggers: ["hit"], timing: "before", protects: "self-or-ally", rangeMeters: 1.5, filters: { attackRoll: true }, lot: "R3a",
    effect: { kind: "ac-bonus", dice: "1d8", thenResistance: true }, short: "+1d8 CA, poi resistenza",
    rule: "Lui o una creatura entro 1,5 m colpita: +1d8 alla CA; se l'attacco colpisce lo stesso, resistenza al suo danno." }),
  feature({ id: "sentinel-at-deaths-door", label: "Sentinella alla Porta della Morte",
    featureIds: ["chierico-dominio-della-tomba-sentinella-alla-porta-della-morte"],
    triggers: ["hit"], timing: "before", protects: "self-or-ally", rangeMeters: 9, filters: { critical: true }, lot: "R3a",
    effect: { kind: "downgrade-critical" }, short: "Critico → colpo normale",
    rule: "Una creatura entro 9 m subisce un critico: diventa un colpo normale." }),
  feature({ id: "armor-of-hexes", label: "Armatura dei Sortilegi", featureIds: ["warlock-la-lama-del-sortilegio-armatura-dei-sortilegi"],
    triggers: ["hit"], timing: "before", filters: { attackRoll: true },
    requiresAttackerCondition: "Maledizione della Lama del Sortilegio", lot: "R3a",
    effect: { kind: "other" }, short: "d6: con 4+ manca",
    rule: "Colpito dal bersaglio della sua maledizione: tira un d6, con 4 o più l'attacco manca." }),
  feature({ id: "runic-shield", label: "Scudo Runico", featureIds: ["guerriero-cavaliere-runico-scudo-runico"],
    triggers: ["hit"], timing: "before", protects: "self-or-ally", rangeMeters: 18, filters: { attackRoll: true }, lot: "R3a",
    effect: { kind: "reroll" }, short: "L'attaccante ritira il d20",
    rule: "Una creatura entro 18 m colpita: l'attaccante ritira il d20 e usa il nuovo tiro." }),

  // B. Hit or damage, before the write: they change the damage.
  spell({ id: "absorb-elements", label: "Assorbire elementi", spellId: "xanathar-assorbire-elementi", slotLevel: 1,
    triggers: ["damage"], timing: "before", filters: { damageTypes: ELEMENTAL_DAMAGE_TYPES }, skipIfActiveSpell: true,
    flow: "spell-panel", lot: "R1", effect: { kind: "resistance", variantByType: true }, short: "Resistenza al tipo",
    rule: "Resistenza al tipo del danno, anche contro questo danno; +1d6 al suo prossimo colpo in mischia." }),
  feature({ id: "uncanny-dodge", label: "Schivata Prodigiosa", featureIds: ["ladro-schivata-prodigiosa",
    "ranger-cacciatore-difesa-del-cacciatore-superiore-schivata-prodigiosa",
    "ranger-revised-conclave-del-cacciatore-difesa-superiore-del-cacciatore-schivata-prodigiosa"],
  triggers: ["hit"], timing: "before", filters: { attackRoll: true }, lot: "R3b",
  effect: { kind: "halve" }, short: "Danno dimezzato",
  rule: "Colpito da un attaccante che vede: dimezza il danno di questo attacco." }),
  feature({ id: "parry-maneuver", label: "Parata", featureIds: ["guerriero-maestro-di-battaglia-manovre-parata"],
    triggers: ["damage"], timing: "before", filters: { range: "melee", attackRoll: true }, lot: "R3b",
    effect: { kind: "reduce", dice: "superiority", ability: "dex" }, short: "− dado di superiorità + Des",
    rule: "Danneggiato da un attacco in mischia: riduce il danno di un dado di superiorità + modificatore di Destrezza." }),
  feature({ id: "deflect-missiles", label: "Deviare Proiettili", featureIds: ["monaco-deviare-proiettili"],
    triggers: ["hit"], timing: "before", filters: { range: "ranged", attackRoll: true }, lot: "R3b",
    effect: { kind: "reduce", dice: "1d10", ability: "dex", plusLevel: "monaco" }, short: "− 1d10 + Des + livello",
    rule: "Colpito da un attacco con arma a distanza: riduce il danno di 1d10 + Destrezza + livello da monaco." }),
  feature({ id: "song-of-defense", label: "Canzone di Difesa", featureIds: ["mago-canto-della-lama-canzone-di-difesa"],
    triggers: ["damage"], timing: "before", requiresReactorCondition: "Melodia della Lama", lot: "R3b",
    effect: { kind: "reduce", perSlotLevel: 5 }, short: "− 5 per livello dello slot",
    rule: "Subisce danni con il Canto della Lama attivo: spende uno slot e riduce il danno di 5 per livello dello slot." }),
  feature({ id: "protective-field", label: "Campo Protettivo", featureIds: ["guerriero-guerriero-psionico-potere-psionico-campo-protettivo"],
    triggers: ["damage"], timing: "before", protects: "self-or-ally", rangeMeters: 9, lot: "R3b",
    effect: { kind: "reduce", dice: "psionic", ability: "int" }, short: "− dado psionico + Int",
    rule: "Lui o una creatura entro 9 m subisce danni: li riduce di un dado psionico + modificatore di Intelligenza." }),
  feature({ id: "spirit-shield", label: "Spiriti Protettori", featureIds: ["barbaro-cammino-del-guardiano-ancestrale-spiriti-protettori"],
    triggers: ["damage"], timing: "before", protects: "ally", rangeMeters: 9, requiresReactorCondition: "Ira", lot: "R3b",
    effect: { kind: "reduce", dice: "2d6" }, short: "− 2d6 (3d6, 4d6)",
    rule: "Un alleato entro 9 m subisce danni, con l'Ira attiva: li riduce di 2d6 (3d6 al 10°, 4d6 al 14°)." }),
  feature({ id: "guardian-coil", label: "Spirale Guardiana", featureIds: ["warlock-l-insondabile-spirale-guardiana"],
    triggers: ["damage"], timing: "before", lot: "R3b",
    effect: { kind: "reduce", dice: "1d8" }, short: "− 1d8 (2d8)",
    rule: "Una creatura entro 3 m dal tentacolo subisce danni: li riduce di 1d8 (2d8 al 10°). Un alleato resta a giudizio del GM." }),
  feature({ id: "deflect-energy", label: "Corpo del Sé Astrale", featureIds: ["monaco-via-del-se-astrale-corpo-del-se-astrale"],
    triggers: ["damage"], timing: "before", filters: { damageTypes: ["acid", "cold", "fire", "force", "lightning", "thunder"] },
    requiresReactorCondition: "Braccia del Sé Astrale", lot: "R3b",
    effect: { kind: "reduce", dice: "1d10", ability: "wis", plusLevel: "monaco" }, short: "− 1d10 + Sag + livello",
    rule: "Con il corpo astrale: subisce acido, freddo, fuoco, forza, fulmine o tuono e lo riduce di 1d10 + Saggezza + livello da monaco." }),
  feature({ id: "spectral-defense", label: "Difesa Spettrale", featureIds: ["ranger-viandante-dell-orizzonte-difesa-spettrale"],
    triggers: ["damage"], timing: "before", filters: { attackRoll: true }, lot: "R3b",
    effect: { kind: "resistance", instance: true }, short: "Resistenza a questo danno",
    rule: "Subisce danni da un attacco: resistenza a tutto il danno di questo attacco." }),
  feature({ id: "swarming-dispersal", label: "Dispersione Brulicante", featureIds: ["ranger-custode-degli-sciami-dispersione-brulicante"],
    triggers: ["damage"], timing: "before", lot: "R3b",
    effect: { kind: "resistance", instance: true, teleportMeters: 9 }, short: "Resistenza, poi 9 m",
    rule: "Subisce danni: resistenza a questo danno, poi si teletrasporta fino a 9 m." }),
  feature({ id: "dampen-elements", label: "Mitigare Elementi", featureIds: ["chierico-dominio-della-natura-mitigare-elementi"],
    triggers: ["damage"], timing: "before", protects: "self-or-ally", rangeMeters: 9, filters: { damageTypes: ELEMENTAL_DAMAGE_TYPES }, lot: "R3b",
    effect: { kind: "resistance", instance: true }, short: "Resistenza a questo danno",
    rule: "Lui o una creatura entro 9 m subisce acido, freddo, fuoco, fulmine o tuono: resistenza a questo danno." }),
  feature({ id: "tomb-of-levistus", label: "Tomba di Levistus", featureIds: ["warlock-suppliche-occulte-tomba-di-levistus"],
    triggers: ["damage"], timing: "before", lot: "R3b",
    effect: { kind: "other", tempHp: true }, short: "PF temporanei, poi incapacitato",
    rule: "Subisce danni: 10 PF temporanei per livello da warlock che assorbono questo danno; vulnerabile al fuoco e incapacitato fino alla fine del suo prossimo turno." }),
  feature({ id: "cutting-words", label: "Parole Taglienti", featureIds: ["bardo-collegio-della-sapienza-parole-taglienti"],
    triggers: ["damage"], timing: "before", protects: "other", attackerRangeMeters: 18, lot: "R3b",
    effect: { kind: "reduce", dice: "bardic" }, short: "− dado di Ispirazione",
    rule: "Una creatura entro 18 m tira i danni: il dado di Ispirazione Bardica li riduce (anche un tiro per colpire o una prova)." }),

  // C. After the damage: notices.
  spell({ id: "hellish-rebuke", label: "Intimorire infernale", spellId: "hellish-rebuke", slotLevel: 1, triggers: ["damage"],
    timing: "after", attackerRangeMeters: 18, flow: "spell-panel", targetsAttacker: true, lot: "R1",
    effect: { kind: "retaliation", dice: "2d10", type: "fire" }, short: "2d10 fuoco",
    rule: "Dopo il danno, l'attaccante entro 18 m tira un TS Destrezza: 2d10 fuoco, metà se lo supera." }),
  feature({ id: "berserker-retaliation", label: "Ritorsione", featureIds: ["barbaro-cammino-del-berserker-ritorsione"],
    triggers: ["damage"], timing: "after", attackerRangeMeters: 1.5, flow: "off-turn-attack", targetsAttacker: true, lot: "R3c",
    effect: { kind: "attack" }, short: "Attacco in mischia",
    rule: "Danneggiato da una creatura entro 1,5 m: un attacco con arma in mischia contro di lei." }),
  feature({ id: "wrath-of-the-storm", label: "Collera della Tempesta", featureIds: ["chierico-dominio-della-tempesta-collera-della-tempesta"],
    triggers: ["hit"], timing: "after", attackerRangeMeters: 1.5, targetsAttacker: true, lot: "R3c",
    effect: { kind: "retaliation", dice: "2d8", types: ["lightning", "thunder"] }, short: "2d8 fulmine o tuono",
    rule: "Colpito da una creatura entro 1,5 m: TS Destrezza, 2d8 fulmine o tuono, metà se lo supera." }),
  feature({ id: "storms-fury", label: "Furia della Tempesta", featureIds: ["stregone-stregoneria-della-tempesta-furia-della-tempesta"],
    triggers: ["hit"], timing: "after", filters: { range: "melee", attackRoll: true }, targetsAttacker: true, lot: "R3c",
    effect: { kind: "retaliation", type: "lightning", perLevel: "stregone" }, short: "Fulmine = livello",
    rule: "Colpito in mischia: l'attaccante subisce danni da fulmine pari al livello da stregone, TS Forza o spinto fino a 6 m." }),
  feature({ id: "raging-storm", label: "Tempesta Furibonda", featureIds: ["barbaro-cammino-dell-araldo-della-tempesta-tempesta-furibonda"],
    triggers: ["hit"], timing: "after", attackerRangeMeters: 3, requiresReactorCondition: "Ira", targetsAttacker: true, lot: "R3c",
    effect: { kind: "retaliation" }, short: "Danni all'attaccante",
    rule: "Deserto: colpito da una creatura nell'aura, TS Destrezza o danni da fuoco pari a metà del livello da barbaro." }),
  feature({ id: "misty-escape", label: "Fuga Velata", featureIds: ["warlock-il-signore-fatato-fuga-velata"],
    triggers: ["damage"], timing: "after", lot: "R3c",
    effect: { kind: "other" }, short: "Invisibile e 18 m",
    rule: "Subisce danni: diventa invisibile e si teletrasporta fino a 18 m." }),
  feature({ id: "rebuke-the-violent", label: "Intimorire i Violenti",
    featureIds: ["paladino-giuramento-di-redenzione-incanalare-divinita-intimorire-i-violenti"],
    triggers: ["damage"], timing: "after", protects: "other", attackerRangeMeters: 9, targetsAttacker: true, lot: "R3c",
    effect: { kind: "retaliation", type: "radiant", equalToDamage: true }, short: "Radiosi pari al danno",
    rule: "Una creatura entro 9 m danneggia un altro: TS Saggezza, radiosi pari al danno inflitto, metà se lo supera." }),

  // D. Miss: notices.
  feature({ id: "riposte", label: "Replica", featureIds: ["guerriero-maestro-di-battaglia-manovre-replica"],
    triggers: ["miss"], timing: "after", filters: { range: "melee" }, flow: "off-turn-attack", targetsAttacker: true, lot: "R3c",
    effect: { kind: "attack", plusDice: "superiority" }, short: "Attacco + dado di superiorità",
    rule: "Mancato in mischia: un attacco in mischia contro l'attaccante, con il dado di superiorità ai danni." }),
  feature({ id: "stand-against-the-tide", label: "Opporsi alla Marea", featureIds: [
    "ranger-cacciatore-difesa-del-cacciatore-superiore-opporsi-alla-marea",
    "ranger-revised-conclave-del-cacciatore-difesa-superiore-del-cacciatore-opporsi-alla-marea"],
  triggers: ["miss"], timing: "after", filters: { range: "melee" }, flow: "note", lot: "R3c",
  effect: { kind: "other" }, short: "Ripete su un altro",
  rule: "Mancato in mischia: l'attaccante ripete l'attacco contro un'altra creatura a scelta del ranger." }),
  feature({ id: "redirect-attack", label: "Andatura Ondeggiante", featureIds: ["monaco-via-del-maestro-ubriaco-andatura-ondeggiante"],
    triggers: ["miss"], timing: "after", filters: { range: "melee" }, lot: "R3c",
    effect: { kind: "other" }, short: "1 ki: devia l'attacco",
    rule: "Mancato in mischia: con 1 ki l'attaccante colpisce una creatura entro 1,5 m da sé, diversa dal monaco." }),
  feature({ id: "giant-killer", label: "Uccisore di Giganti", featureIds: ["ranger-cacciatore-preda-del-cacciatore-uccisore-di-giganti",
    "ranger-revised-conclave-del-cacciatore-preda-del-cacciatore-uccisore-di-giganti"],
  triggers: ["hit", "miss"], timing: "after", attackerRangeMeters: 1.5, flow: "off-turn-attack", targetsAttacker: true, lot: "R3c",
  effect: { kind: "attack" }, short: "Attacco (Grande o più)",
  rule: "Una creatura Grande o più grande entro 1,5 m lo attacca: subito dopo, un attacco con arma contro di lei." }),

  // E. A spell cast nearby.
  spell({ id: "counterspell", label: "Controincantesimo", spellId: "counterspell", slotLevel: 3, triggers: ["spell-cast"],
    timing: "before", casterRangeMeters: 18, flow: "counterspell", targetsCaster: true, lot: "R2",
    effect: { kind: "counter" }, short: "Contrasta",
    rule: "Una creatura entro 18 m lancia un incantesimo: lo contrasta, automatico fino al livello dello slot, oltre prova con CD 10 + livello." }),
  feature({ id: "magic-users-nemesis", label: "Nemesi degli Incantatori", featureIds: ["ranger-uccisore-di-mostri-nemesi-degli-incantatori"],
    triggers: ["spell-cast"], timing: "before", casterRangeMeters: 18, targetsCaster: true, lot: "R2",
    effect: { kind: "counter", save: "wis" }, short: "TS Saggezza o fallisce",
    rule: "Una creatura entro 18 m lancia un incantesimo: TS Saggezza contro la CD del ranger, o l'incantesimo fallisce." }),
  feature({ id: "spell-thief", label: "Ladro di Incantesimi", featureIds: ["ladro-mistificatore-arcano-ladro-di-incantesimi"],
    triggers: ["spell-cast"], timing: "before", requiresSpellTarget: true, targetsCaster: true, lot: "R2",
    effect: { kind: "counter", save: "spellcasting" }, short: "Ruba l'incantesimo",
    rule: "Bersaglio di un incantesimo: il caster tira un TS con la sua caratteristica da incantatore; se fallisce, l'effetto non ha effetto sul ladro, che ruba l'incantesimo." }),

  // F. Movement (lot R5, off by default).
  entry({ id: "opportunity-attack", label: "Attacco di opportunità", source: "universal", triggers: ["move-leave"], timing: "after",
    flow: "off-turn-attack", targetsMover: true, lot: "R5", effect: { kind: "attack" }, short: "Attacco in mischia",
    rule: "Una creatura ostile esce dalla sua portata: un attacco in mischia contro di lei." }),
  feature({ id: "halo-of-spores", label: "Alone di Spore", featureIds: ["druido-circolo-delle-spore-alone-di-spore"],
    triggers: ["move-enter"], timing: "after", targetsMover: true, lot: "R5",
    effect: { kind: "retaliation", dice: "1d4", type: "necrotic", save: "con" }, short: "1d4 necrotici",
    rule: "Una creatura entra entro 3 m o vi inizia il turno: TS Costituzione o 1d4 necrotici (di più ai livelli alti)." }),
  feature({ id: "skirmisher", label: "Schermagliatore", featureIds: ["ladro-esploratore-schermagliatore"],
    triggers: ["turn-end-near"], timing: "after", targetsMover: true, flow: "note", lot: "R5",
    effect: { kind: "other" }, short: "Metà velocità senza AdO",
    rule: "Un nemico finisce il turno entro 1,5 m: si muove fino a metà velocità senza provocare attacchi di opportunità." }),
]);

const BY_ID = new Map(REACTION_TRIGGER_CATALOG.map((value) => [value.id, value]));

export function reactionTriggerEntry(id) {
  return BY_ID.get(String(id || "").trim()) || null;
}

// The entries of one moment.
export function reactionTriggerEntriesFor(trigger) {
  const wanted = String(trigger || "").trim();
  return REACTION_TRIGGER_CATALOG.filter((value) => value.triggers.includes(wanted));
}

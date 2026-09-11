<!-- SPELL-COMPOSITION-AUDIT:BEGIN -->
# Audit indipendente: completamento compositivo del catalogo

Verifica: **2026-09-09**, working tree Take Initiative **1.3.0**, non soltanto HEAD.
Questo blocco è la valutazione semantica mantenuta dall'audit; lo snapshot generato
in fondo conserva gli assi storici, senza determinare COMPLETE o GREEN.

## A. Executive conclusion

**50 GREEN oggi → 80 dopo 3 capability condivise → 89 dopo 5 → 12 RED residui.**
Il backlog implementabile è di **152 spell**: **32,9% GREEN**, **59,2% YELLOW**,
**7,9% RED**. Dopo cinque capability si arriva al **58,6%**; rimangono **51 YELLOW**.
Le due spell da verificare e le 144 senza automazione aggiuntiva utile non sono
nel denominatore. I numeri sono spell distinte, non righe-regola né somma di unlock sovrapposti.

Siamo pronti a batch compositivi per alcune famiglie, **non** a completare quasi
tutto il catalogo con 3–5 piccole primitive. Sono ancora necessari **23 gap
condivisi distinti**, di dimensioni diverse. La priorità è riusare il framework
attuale: non serve una riscrittura architetturale. Il punto debole è spesso il
collegamento tra cast, azione successiva e lifecycle, non il calcolo degli HP.

Questa è una stima ingegneristica condizionata al contratto sotto descritto.
Gli unlock futuri sono proiezioni di dipendenze, non implementazioni già provate.

## B. Catalog status e baseline

| Stato | Spell |
| --- | --- |
| COMPLETE / CURRENT | 166 |
| COMPLETE / LEGACY | 13 |
| PARTIAL | 100 |
| MISSING | 52 |
| NO AUTOMATION REQUIRED | 144 |
| REQUIRES RULE VERIFICATION | 2 |
| Totale | 477 |
| Backlog PARTIAL + MISSING | 152 |

Inventario autorevole interrogabile: [spell-implementation-status.json](../data/spell-implementation-status.json).
Ogni riga contiene tutti i campi richiesti: owner, mechanic/gap, capability,
History/Undo, recovery, targeting, concentrazione, durata, trigger, area, scaling,
VFX, family, effort, batch, fonte delle regole e prove. `annotation` è umana;
`observed` conserva i fatti estratti. Non si deduce lo stato dalla sola presenza di un registro.

### Perimetro e unità di conteggio

- 319 record SRD + 41 extra PHB + 116 supplementi = 476 ID sorgente; il runtime
  sostituisce `tasha-scudiscio-mentale-di-tasha` con `legacy-tashas-mind-whip` e
  aggiunge `legacy-crusaders-mantle`: **477 spell canoniche**, nessun doppio conteggio dell'alias.
- 476 testi locali disponibili; Mantello del Crociato legacy non ha testo.
  Imprigionare ha testo ma necessita verifica del perimetro delle cinque modalità
  e dei rilasci arbitrari. Non sono state inventate regole mancanti.
- COMPLETE significa completo per il **tracker assistito**: dadi fisici,
  immunità/resistenze finali, LOS, statblock, decisioni ambientali e movimento
  dichiaratamente manuale restano al tavolo. Non certifica un motore D&D completo.
- Una micropill può completare un bonus informativo; non dimostra che vengano
  applicati PF temporanei, soppressione, risorse o trigger contestuali. Questi
  sono PARTIAL se l'operazione utile manca. Esempio: Agathys/Tenser conservano
  bonus e descrittori, ma non un pool HP temporaneo canonico consumabile.
- Le evocazioni generiche restano token/creature gestiti al tavolo con tracking
  della spell: generazione di bestiario, decisioni dei mostri e AI non entrano nel
  backlog. Questo confine esplicito evita 27 falsi RED; automatizzare in futuro
  gli attori evocati sarebbe un nuovo requisito e invaliderebbe questa parte del conteggio.
- Lama Infuocata, Lama d'Ombra e Gabbia dell'Anima mantengono il tracking manuale
  intenzionale verificato nei test. Il prefisso `legacy-` non è uno stato:
  Scudiscio Mentale di Tasha usa il percorso corrente.
- Evidenza: confronto tra dati/regole locali, planner, executor/controller e
  test comportamentali. Test di famiglia provano la primitive; riferimenti
  letterali/source tests sono solo navigazione, non prova semantica. Non è stato
  eseguito uno smoke live Owlbear per tutte le 477 spell.

| Baseline rilevata | Risultato |
| --- | --- |
| HEAD | `356ef2a68da050fb788988395c0b1bac4bb03ac2`, working tree già dirty |
| Modifiche preesistenti | Conservate, incluse History, Effects, recovery, UI e test; nessun revert |
| Node / suite completa | v24.15.0; `npm test`: **2889/2889**, 0 fail, 0 skip, circa 23,9 s |
| Performance harness | `npm run perf:harness -- --runs 1`: correctness **ok** |
| Scenario harness | 40 token, 10 zone, 100 effetti, 100 movimenti, 100 cambi HP, 30 avanzamenti turno e cambio scena |
| Tempo harness | 329,444 ms del driver simulato; non latenza reale browser/rete |
| Versione / dist iniziale | `verify:version` e `verify:dist` passati, 1.3.0 |
| Provenienza dist iniziale | HEAD uguale, `dirty: true`, builtAt `2026-09-07T17:09:41.000Z`; la sola versione non prova parità dei byte col runtime |
| Catalogo / aree rilevati | 477 spell, 139 regole geometriche per 134 spell; 81 saveAutomation, 32 definizioni con activeActions |
| Controllo diagnostico aggiuntivo | 9 probe read-only passati; risultati nel capability JSON |
| Audit generator test finale | 36/36 passati; blocco semantico preservato dopo rigenerazione |
| Integrità produzione | SHA-256 dei file src identico prima/dopo; fingerprint strutturale 807a0a5583d7742f invariato |
| Build finale | PASS: Vite in 5,13 s; warning chunk >500 kB. verify:version / verify:dist PASS |

Il vecchio audit ricostruito conserva 382 `UNREVIEWED`: i suoi 285 `coperto` e
66 `FULL` non sono numeri di completezza. Il suo fingerprint resta utile come
controllo strutturale, non come certificazione del catalogo.

## C. Capability map

La mappa di **39 capability** con owner, API, esempi, test e limiti è nella
[sezione C del master](SPELL_ARCHITECTURE_MASTER.md#c-primitive-catalog)
e in [spell-capability-map.json](../data/spell-capability-map.json).

I confini decisivi verificati:

1. `area-transaction` accetta anche **discrete / placement unavailable**:
   `spellAreaResolutionCommandCore` e `spellUnifiedAreaAdapter`. Cure e save
   discreti non richiedono geometrie inventate. Il lifecycle puro rifiuta HP
   ordinari: scegliere il percorso già presente, non bypassarne l'eligibility.
2. Initial save single-target save-or-suck: esito scelto al tavolo. Concentrazione,
   condizioni, repeat saves e cleanup appartengono agli owner condivisi.
3. `saveReminder`, `deferredEffects`, `endsOnDamage`, parent references,
   `onSpellEnd` e terminal continuation esistono; **non sono intercambiabili**.
4. `maxAttacks` + `attacks[]` già risolvono più colpi, anche sullo stesso target,
   nel percorso attivo di Lama del Disastro. Il collegamento al cast non è già
   una primitive generica: questo riduce CAP-ATTACK, non lo elimina.
5. `replaceSpellTargets` emette già upsert/register/break-targets nel planner
   attivo. Eligibility, morte/retarget e mantenimento per evento rimangono da
   verificare/generalizzare; non creare un altro controller per Marchio/Sortilegio.
6. `casterHealingFromAppliedDamage` è presente sia nel cast sia nelle azioni
   attive. Trasferimento di Vita richiede la relazione inversa, non un secondo
   helper HP copiato da Debilitazione.
7. Damage components tipizzati esistono nei percorsi prismatici; l'input area
   ordinario è un totale finale deciso dal GM. Danni misti manuali non richiedono
   un nuovo motore di resistenze; allocazioni e soglie HP sì.
8. History e Undo sono condivisi nella working tree attuale. **Recovery non è
   universale**: l'envelope durevole ammette teleport, consumo activation e
   validazione active-resolution; `static-zone:move` non vi rientra. Distinguere
   Undo del movimento, ricostruzione delle geometrie e crash recovery durevole.

### BLOCKER verificato, senza bugfix

`getSpellAttackResolution(id, 'hit', {slotLevel: 0, characterLevel: 17})`
restituisce `acid-arrow-delayed-acid` anche per **Tocco Gelido** e **Raggio di
Gelo**; lo fa anche per **Dardo Tracciante**. Il campo `effect` specifico
all'acido viene costruito per ogni hit; `buildSpellApplicationPlan` lo include
tra gli effetti applicabili. Il resolver usa inoltre incremento di slot per
questi cantrip, non il livello personaggio. È un problema produttivo riprodotto,
non soltanto un testo UI errato. La suite verde controlla che esista un on-hit
effect, senza escludere il rider acido sbagliato.

**Blocca l'estensione massiva degli attacchi** e spiega il loro YELLOW. Nessuna
correzione effettuata qui, nessun nuovo finding ARCH-*.

Altri data gap verificati: Trama Ipnotica non dichiara `endsOnDamage` nelle
condizioni; Allucinazione Mortale ha `4d10` nel repeat-save senza i campi di
upcast. Spruzzo Colorato presenta dichiarazioni start/end-turn discordanti:
serve riconciliare l'expiry con il testo locale durante il suo batch GREEN.

## D. GREEN / YELLOW / RED matrix

Tutte le **152** spell incomplete sono elencate qui; la matrice JSON contiene
anche le 325 restanti. `—` significa nessuna nuova capability runtime:
restano dati/registrazione/test, non assenza di lavoro. Le scelte GM descritte
nelle annotazioni sono parte del contratto di questa classificazione.

| Spell / ID | Livello | Stato | Readiness | Famiglia | Gap |
| --- | --- | --- | --- | --- | --- |
| Fiotto acido (`acid-splash`) | 0 | MISSING | GREEN | DISCRETE-SAVE | Nessuna nuova semantic/runtime capability |
| Aiuto (`aid`) | 2 | PARTIAL | YELLOW | MAX-HP | CAP-MAXHP |
| Alterare sé stesso (`alter-self`) | 2 | PARTIAL | YELLOW | ACTIVE-EFFECT-DATA | CAP-MODE |
| Forme animali (`animal-shapes`) | 8 | PARTIAL | RED | TRANSFORMATION | FORM-STATE |
| Campo anti-magia (`antimagic-field`) | 8 | PARTIAL | RED | MAGIC-SUPPRESSION | MAGIC-SUPPRESSION |
| Antipatia/simpatia (`antipathy-sympathy`) | 8 | PARTIAL | GREEN | ZONE-DATA | Nessuna nuova semantic/runtime capability |
| Risveglio (`awaken`) | 5 | MISSING | GREEN | SAVE-EFFECT-DATA | Nessuna nuova semantic/runtime capability |
| Pelle coriacea (`barkskin`) | 2 | PARTIAL | GREEN | PASSIVE-DATA | Nessuna nuova semantic/runtime capability |
| Faro di speranza (`beacon-of-hope`) | 3 | PARTIAL | GREEN | PASSIVE-DATA | Nessuna nuova semantic/runtime capability |
| Scagliare maledizione (`bestow-curse`) | 3 | PARTIAL | YELLOW | REPEAT-SAVE-DATA | CAP-DURATION |
| Inaridire (`blight`) | 4 | MISSING | GREEN | DISCRETE-SAVE | Nessuna nuova semantic/runtime capability |
| Calmare emozioni (`calm-emotions`) | 2 | PARTIAL | YELLOW | SUPPRESSION | CAP-SUPPRESSION |
| Tocco gelido (`chill-touch`) | 0 | PARTIAL | YELLOW | ATTACK | CAP-ATTACK |
| Spruzzo colorato (`color-spray`) | 1 | PARTIAL | GREEN | SAVE-EFFECT-DATA | Nessuna nuova semantic/runtime capability |
| Contingenza (`contingency`) | 6 | PARTIAL | RED | NESTED-SPELL | NESTED-SPELL |
| Cura ferite (`cure-wounds`) | 1 | MISSING | GREEN | HEAL | Nessuna nuova semantic/runtime capability |
| Interdizione alla morte (`death-ward`) | 4 | PARTIAL | YELLOW | DAMAGE-REACTION | CAP-REACTION |
| Disintegrazione (`disintegrate`) | 6 | MISSING | YELLOW | HP-BRANCH | CAP-HP-BRANCH |
| Dissolvi il bene e il male (`dispel-evil-and-good`) | 5 | PARTIAL | YELLOW | END-EFFECT-PICKER | CAP-CLEANSE + CAP-ATTACK |
| Dissolvi magie (`dispel-magic`) | 3 | MISSING | YELLOW | END-EFFECT-PICKER | CAP-CLEANSE |
| Parola divina (`divine-word`) | 7 | PARTIAL | YELLOW | HP-BRANCH | CAP-HP-BRANCH |
| Deflagrazione occulta (`eldritch-blast`) | 0 | MISSING | YELLOW | MULTI-HIT | CAP-ATTACK |
| Estasiare (`enthrall`) | 2 | PARTIAL | GREEN | PASSIVE-DATA | Nessuna nuova semantic/runtime capability |
| Ritirata rapida (`expeditious-retreat`) | 1 | PARTIAL | GREEN | PASSIVE-DATA | Nessuna nuova semantic/runtime capability |
| Segugio fedele (`faithful-hound`) | 4 | PARTIAL | YELLOW | ACTIVE-ORIGIN | CAP-ORIGIN + CAP-LINK |
| Vita falsata (`false-life`) | 1 | PARTIAL | YELLOW | TEMP-HP | CAP-TEMP |
| Regressione mentale (`feeblemind`) | 8 | MISSING | YELLOW | HP-BRANCH | CAP-HP-BRANCH |
| Dito della morte (`finger-of-death`) | 7 | MISSING | YELLOW | HP-BRANCH | CAP-HP-BRANCH |
| Dardo di fuoco (`fire-bolt`) | 0 | MISSING | YELLOW | ATTACK | CAP-ATTACK |
| Scudo di fuoco (`fire-shield`) | 4 | PARTIAL | YELLOW | DAMAGE-REACTION | CAP-REACTION |
| Tempesta di fuoco (`fire-storm`) | 7 | PARTIAL | YELLOW | MULTI-GEOMETRY | CAP-MULTIAREA |
| Proibizione (`forbiddance`) | 6 | PARTIAL | GREEN | ZONE-DATA | Nessuna nuova semantic/runtime capability |
| Previsione (`foresight`) | 9 | PARTIAL | GREEN | PASSIVE-DATA | Nessuna nuova semantic/runtime capability |
| Sfera congelante (`freezing-sphere`) | 6 | PARTIAL | YELLOW | DEFERRED-ZONE | CAP-ORIGIN |
| Costrizione (`geas`) | 5 | PARTIAL | YELLOW | CALENDAR | CAP-CALENDAR |
| Globo di invulnerabilità (`globe-of-invulnerability`) | 6 | PARTIAL | GREEN | ZONE-DATA | Nessuna nuova semantic/runtime capability |
| Glifo di interdizione (`glyph-of-warding`) | 3 | PARTIAL | RED | NESTED-SPELL | NESTED-SPELL |
| Bacche benefiche (`goodberry`) | 1 | MISSING | YELLOW | RESOURCE-HEAL | CAP-RESOURCE |
| Ristorare superiore (`greater-restoration`) | 5 | MISSING | YELLOW | MAX-HP | CAP-MAXHP |
| Guardiano della fede (`guardian-of-faith`) | 4 | PARTIAL | YELLOW | RESOURCE-TRIGGER | CAP-RESOURCE |
| Dardo tracciante (`guiding-bolt`) | 1 | PARTIAL | YELLOW | ATTACK | CAP-ATTACK |
| Santificare (`hallow`) | 5 | PARTIAL | GREEN | ZONE-DATA | Nessuna nuova semantic/runtime capability |
| Ferire (`harm`) | 6 | MISSING | YELLOW | MAX-HP | CAP-MAXHP |
| Guarigione (`heal`) | 6 | MISSING | YELLOW | HEAL-CLEANSE | CAP-CLEANSE |
| Parola guaritrice (`healing-word`) | 1 | MISSING | GREEN | HEAL | Nessuna nuova semantic/runtime capability |
| Intimorire infernale (`hellish-rebuke`) | 1 | MISSING | GREEN | DISCRETE-SAVE | Nessuna nuova semantic/runtime capability |
| Banchetto degli eroi (`heroes-feast`) | 6 | MISSING | YELLOW | MAX-HP | CAP-MAXHP |
| Eroismo (`heroism`) | 1 | PARTIAL | YELLOW | TEMP-HP | CAP-TEMP |
| Marchio del cacciatore (`hunters-mark`) | 1 | PARTIAL | YELLOW | RETARGET | CAP-LINK |
| Trama ipnotica (`hypnotic-pattern`) | 3 | PARTIAL | GREEN | SAVE-EFFECT-DATA | Nessuna nuova semantic/runtime capability |
| Tempesta di ghiaccio (`ice-storm`) | 4 | PARTIAL | GREEN | ZONE-DATA | Nessuna nuova semantic/runtime capability |
| Infliggi ferite (`inflict-wounds`) | 1 | MISSING | YELLOW | ATTACK | CAP-ATTACK |
| Invisibilità (`invisibility`) | 2 | PARTIAL | YELLOW | EVENT-END | CAP-LINK |
| Saltare (`jump`) | 1 | PARTIAL | GREEN | PASSIVE-DATA | Nessuna nuova semantic/runtime capability |
| Ristorare inferiore (`lesser-restoration`) | 2 | MISSING | YELLOW | END-EFFECT-PICKER | CAP-CLEANSE |
| Levitazione (`levitate`) | 2 | PARTIAL | GREEN | PASSIVE-DATA | Nessuna nuova semantic/runtime capability |
| Armatura magica (`mage-armor`) | 1 | PARTIAL | GREEN | PASSIVE-DATA | Nessuna nuova semantic/runtime capability |
| Cerchio magico (`magic-circle`) | 3 | PARTIAL | GREEN | ZONE-DATA | Nessuna nuova semantic/runtime capability |
| Giara magica (`magic-jar`) | 6 | PARTIAL | RED | ENTITY-TRANSFER | ENTITY-STATE |
| Dardo incantato (`magic-missile`) | 1 | MISSING | YELLOW | MULTI-HIT | CAP-ATTACK |
| Guarigione di massa (`mass-heal`) | 9 | MISSING | YELLOW | HEAL-ALLOCATION | CAP-ALLOCATION + CAP-CLEANSE |
| Parola guaritrice di massa (`mass-healing-word`) | 3 | MISSING | GREEN | HEAL | Nessuna nuova semantic/runtime capability |
| Suggestione di massa (`mass-suggestion`) | 6 | PARTIAL | GREEN | PASSIVE-DATA | Nessuna nuova semantic/runtime capability |
| Labirinto (`maze`) | 8 | PARTIAL | GREEN | REPEAT-SAVE-DATA | Nessuna nuova semantic/runtime capability |
| Sciame di meteore (`meteor-swarm`) | 9 | PARTIAL | YELLOW | MULTI-GEOMETRY | CAP-MULTIAREA |
| Immagine speculare (`mirror-image`) | 2 | PARTIAL | YELLOW | RESOURCE-TRIGGER | CAP-RESOURCE |
| Fuorviare (`mislead`) | 5 | PARTIAL | RED | ENTITY-TRANSFER | ENTITY-STATE |
| Passare senza tracce (`pass-without-trace`) | 2 | PARTIAL | GREEN | AURA-DATA | Nessuna nuova semantic/runtime capability |
| Allucinazione mortale (`phantasmal-killer`) | 4 | PARTIAL | GREEN | REPEAT-SAVE-DATA | Nessuna nuova semantic/runtime capability |
| Crescita vegetale (`plant-growth`) | 3 | MISSING | YELLOW | ENVIRONMENT-MODES | CAP-TERRAIN |
| Spruzzo velenoso (`poison-spray`) | 0 | MISSING | GREEN | DISCRETE-SAVE | Nessuna nuova semantic/runtime capability |
| Metamorfosi (`polymorph`) | 4 | PARTIAL | RED | TRANSFORMATION | FORM-STATE |
| Parola del potere uccidere (`power-word-kill`) | 9 | MISSING | YELLOW | HP-BRANCH | CAP-HP-BRANCH |
| Preghiera di guarigione (`prayer-of-healing`) | 2 | MISSING | GREEN | HEAL | Nessuna nuova semantic/runtime capability |
| Produrre fiamma (`produce-flame`) | 0 | PARTIAL | YELLOW | ATTACK | CAP-ATTACK |
| Protezione dall'energia (`protection-from-energy`) | 3 | PARTIAL | GREEN | PASSIVE-DATA | Nessuna nuova semantic/runtime capability |
| Protezione dal bene e dal male (`protection-from-evil-and-good`) | 1 | PARTIAL | GREEN | PASSIVE-DATA | Nessuna nuova semantic/runtime capability |
| Protezione dai veleni (`protection-from-poison`) | 2 | PARTIAL | GREEN | PASSIVE-DATA | Nessuna nuova semantic/runtime capability |
| Rianimare morti (`raise-dead`) | 5 | MISSING | YELLOW | RESURRECTION | CAP-STABILIZE + CAP-CALENDAR |
| Raggio di gelo (`ray-of-frost`) | 0 | PARTIAL | YELLOW | ATTACK | CAP-ATTACK |
| Rigenerazione (`regenerate`) | 7 | PARTIAL | YELLOW | REPEAT-HEAL | CAP-REPEAT-HEAL |
| Reincarnazione (`reincarnate`) | 5 | MISSING | YELLOW | RESURRECTION | CAP-STABILIZE + CAP-CALENDAR |
| Sfera elastica (`resilient-sphere`) | 4 | PARTIAL | GREEN | PASSIVE-DATA | Nessuna nuova semantic/runtime capability |
| Resurrezione (`resurrection`) | 7 | MISSING | YELLOW | RESURRECTION | CAP-STABILIZE + CAP-CALENDAR |
| Inversione della gravità (`reverse-gravity`) | 7 | PARTIAL | RED | VERTICAL-SPACE | VERTICAL-STATE |
| Rinascita (`revivify`) | 3 | MISSING | YELLOW | STABILIZE | CAP-STABILIZE |
| Fiamma sacra (`sacred-flame`) | 0 | MISSING | GREEN | DISCRETE-SAVE | Nessuna nuova semantic/runtime capability |
| Santuario (`sanctuary`) | 1 | PARTIAL | YELLOW | DAMAGE-REACTION | CAP-REACTION |
| Raggio rovente (`scorching-ray`) | 2 | MISSING | YELLOW | MULTI-HIT | CAP-ATTACK |
| Trasformazione (`shapechange`) | 9 | PARTIAL | RED | TRANSFORMATION | FORM-STATE |
| Stretta folgorante (`shocking-grasp`) | 0 | MISSING | YELLOW | ATTACK-RIDER | CAP-ATTACK |
| Sonno (`sleep`) | 1 | PARTIAL | GREEN | SAVE-EFFECT-DATA | Nessuna nuova semantic/runtime capability |
| Salvare i morenti (`spare-the-dying`) | 0 | MISSING | YELLOW | STABILIZE | CAP-STABILIZE |
| Parlare con i vegetali (`speak-with-plants`) | 3 | PARTIAL | YELLOW | ENVIRONMENT-MODES | CAP-TERRAIN |
| Pelle di pietra (`stoneskin`) | 4 | PARTIAL | GREEN | PASSIVE-DATA | Nessuna nuova semantic/runtime capability |
| Tempesta di vendetta (`storm-of-vengeance`) | 9 | PARTIAL | YELLOW | ROUND-SEQUENCE | CAP-SEQUENCE |
| Suggestione (`suggestion`) | 2 | PARTIAL | GREEN | PASSIVE-DATA | Nessuna nuova semantic/runtime capability |
| Bagliore solare (`sunbeam`) | 6 | PARTIAL | GREEN | ACTIVE-AREA-DATA | Nessuna nuova semantic/runtime capability |
| Simbolo (`symbol`) | 7 | PARTIAL | YELLOW | ENVIRONMENT-MODES | CAP-TERRAIN |
| Fermare il tempo (`time-stop`) | 9 | MISSING | RED | EXTRA-TURNS | EXTRA-TURNS |
| Metamorfosi pura (`true-polymorph`) | 9 | PARTIAL | RED | TRANSFORMATION | FORM-STATE |
| Resurrezione pura (`true-resurrection`) | 9 | MISSING | YELLOW | RESURRECTION | CAP-STABILIZE + CAP-CALENDAR |
| Tocco del vampiro (`vampiric-touch`) | 3 | PARTIAL | YELLOW | ACTIVE-DRAIN | CAP-ATTACK |
| Beffa crudele (`vicious-mockery`) | 0 | MISSING | GREEN | DISCRETE-SAVE | Nessuna nuova semantic/runtime capability |
| Muro di forza (`wall-of-force`) | 5 | PARTIAL | GREEN | ZONE-DATA | Nessuna nuova semantic/runtime capability |
| Muro di ghiaccio (`wall-of-ice`) | 6 | PARTIAL | YELLOW | STRUCTURAL-ZONE | CAP-STRUCTURE |
| Muro di pietra (`wall-of-stone`) | 5 | PARTIAL | YELLOW | STRUCTURAL-ZONE | CAP-STRUCTURE |
| Vincolo di interdizione (`warding-bond`) | 2 | PARTIAL | YELLOW | DAMAGE-REACTION | CAP-REACTION |
| Boschetto Druidico (`xanathar-boschetto-druidico`) | 6 | PARTIAL | YELLOW | ENVIRONMENT-MODES | CAP-TERRAIN |
| Catapulta (`xanathar-catapulta`) | 1 | MISSING | GREEN | DISCRETE-SAVE | Nessuna nuova semantic/runtime capability |
| Colpo del Vento d'Acciaio (`xanathar-colpo-del-vento-dacciaio`) | 5 | MISSING | YELLOW | TELEPORT-ATTACK | CAP-ATTACK + CAP-TELEPORT |
| Dardo di Caos (`xanathar-dardo-di-caos`) | 1 | MISSING | RED | RANDOM-CHAIN | RANDOM-CHAIN |
| Debilitazione (`xanathar-debilitazione`) | 5 | PARTIAL | YELLOW | MAINTAIN-LINK | CAP-LINK |
| Drago Illusorio (`xanathar-drago-illusorio`) | 8 | PARTIAL | GREEN | ACTIVE-AREA-DATA | Nessuna nuova semantic/runtime capability |
| Ferocia Primordiale (`xanathar-ferocia-primordiale`) | 0 | MISSING | YELLOW | ATTACK | CAP-ATTACK |
| Flusso di Energia Negativa (`xanathar-flusso-di-energia-negativa`) | 5 | MISSING | YELLOW | TEMP-HP | CAP-TEMP |
| Infestazione (`xanathar-infestazione`) | 0 | MISSING | GREEN | DISCRETE-SAVE | Nessuna nuova semantic/runtime capability |
| Interdizione Primordiale (`xanathar-interdizione-primordiale`) | 6 | PARTIAL | YELLOW | DAMAGE-REACTION | CAP-REACTION |
| Invulnerabilità (`xanathar-invulnerabilita`) | 9 | PARTIAL | GREEN | PASSIVE-DATA | Nessuna nuova semantic/runtime capability |
| Minuscole Meteore di Melf (`xanathar-minuscole-meteore-di-melf`) | 3 | PARTIAL | YELLOW | RESOURCE-AREA | CAP-MULTIAREA + CAP-RESOURCE |
| Morsa del Gelo (`xanathar-morsa-del-gelo`) | 0 | PARTIAL | GREEN | DISCRETE-SAVE | Nessuna nuova semantic/runtime capability |
| Muro d'Acqua (`xanathar-muro-dacqua`) | 3 | PARTIAL | YELLOW | ENVIRONMENT-MODES | CAP-TERRAIN |
| Muro di Sabbia (`xanathar-muro-di-sabbia`) | 3 | PARTIAL | GREEN | ZONE-DATA | Nessuna nuova semantic/runtime capability |
| Ombra di Moil (`xanathar-ombra-di-moil`) | 4 | PARTIAL | YELLOW | DAMAGE-REACTION | CAP-REACTION |
| Ossa della Terra (`xanathar-ossa-della-terra`) | 6 | MISSING | YELLOW | STRUCTURAL-ZONE | CAP-STRUCTURE |
| Passo del Tuono (`xanathar-passo-del-tuono`) | 3 | PARTIAL | YELLOW | TELEPORT-BURST | CAP-TELEPORT |
| Passo Remoto (`xanathar-passo-remoto`) | 5 | PARTIAL | YELLOW | ACTIVE-TELEPORT | CAP-TELEPORT |
| Pirotecnica (`xanathar-pirotecnica`) | 2 | PARTIAL | GREEN | ZONE-DATA | Nessuna nuova semantic/runtime capability |
| Prigione Mentale (`xanathar-prigione-mentale`) | 6 | PARTIAL | YELLOW | CONDITIONAL-DAMAGE | CAP-LINK |
| Rintocco dei Morti (`xanathar-rintocco-dei-morti`) | 0 | MISSING | GREEN | DISCRETE-SAVE | Nessuna nuova semantic/runtime capability |
| Scossa Tellurica (`xanathar-scossa-tellurica`) | 1 | PARTIAL | GREEN | ZONE-DATA | Nessuna nuova semantic/runtime capability |
| Sfera Acquea (`xanathar-sfera-acquea`) | 4 | PARTIAL | YELLOW | CARRIED-ZONE | CAP-CARRIAGE |
| Soffio del Drago (`xanathar-soffio-del-drago`) | 2 | PARTIAL | YELLOW | ACTIVE-ORIGIN | CAP-ORIGIN |
| Trasferimento di Vita (`xanathar-trasferimento-di-vita`) | 3 | MISSING | YELLOW | HP-RELATION | CAP-RELATION |
| Trasformazione di Tenser (`xanathar-trasformazione-di-tenser`) | 6 | PARTIAL | YELLOW | TEMP-HP | CAP-TEMP |
| Trasmutare Roccia (`xanathar-trasmutare-roccia`) | 5 | PARTIAL | YELLOW | ENVIRONMENT-MODES | CAP-TERRAIN |
| Lama Roboante (`tasha-lama-roboante`) | 0 | PARTIAL | YELLOW | ATTACK-MOVEMENT | CAP-ATTACK + CAP-LINK |
| Lama Verdefiamma (`tasha-lama-verdefiamma`) | 0 | MISSING | YELLOW | ATTACK-RIDER | CAP-ATTACK |
| Lenza Elettrizzante (`tasha-lenza-elettrizzante`) | 0 | MISSING | YELLOW | ATTACK-RIDER | CAP-ATTACK |
| Frusta di Spine (`phb2014-frusta-di-spine`) | 0 | MISSING | YELLOW | ATTACK-RIDER | CAP-ATTACK |
| Armatura di Agathys (`phb2014-armatura-di-agathys`) | 1 | PARTIAL | YELLOW | TEMP-HP | CAP-TEMP |
| Dardo Stregato (`phb2014-dardo-stregato`) | 1 | PARTIAL | YELLOW | MAINTAIN-LINK | CAP-LINK |
| Duello Obbligato (`phb2014-duello-obbligato`) | 1 | PARTIAL | YELLOW | MAINTAIN-LINK | CAP-LINK |
| Globo Cromatico (`phb2014-globo-cromatico`) | 1 | MISSING | YELLOW | ATTACK | CAP-ATTACK |
| Sortilegio (`phb2014-sortilegio`) | 1 | PARTIAL | YELLOW | RETARGET | CAP-LINK |
| Sussurri Dissonanti (`phb2014-sussurri-dissonanti`) | 1 | MISSING | GREEN | DISCRETE-SAVE | Nessuna nuova semantic/runtime capability |
| Cordone di Frecce (`phb2014-cordone-di-frecce`) | 2 | PARTIAL | YELLOW | RESOURCE-TRIGGER | CAP-RESOURCE |
| Corona di Follia (`phb2014-corona-di-follia`) | 2 | PARTIAL | YELLOW | MAINTAIN-LINK | CAP-LINK |
| Rampicante Afferrante (`phb2014-rampicante-afferrante`) | 4 | PARTIAL | YELLOW | ACTIVE-ORIGIN | CAP-ORIGIN |
| Portale Arcano (`phb2014-portale-arcano`) | 6 | PARTIAL | YELLOW | PORTAL-PAIR | CAP-TELEPORT |
| Tsunami (`phb2014-tsunami`) | 8 | PARTIAL | YELLOW | ROUND-SEQUENCE | CAP-SEQUENCE |
| Parola del Potere Guarire (`phb2014-parola-del-potere-guarire`) | 9 | MISSING | YELLOW | HEAL-CLEANSE | CAP-CLEANSE |

## E. Shared blockers ranked by leverage

Ordine per **unlock completi / complessità relativa**, con parità risolta a
favore del costo minore. `Bloccate` conta le dipendenze; `sbloccate da sola`
esclude spell che richiedono anche altre capability. Non sommare la prima
colonna per stimare il backlog. Effort 1=LOW, 2–3=MEDIUM, 4=MEDIUM-HIGH;
non sono giornate. LOW circa 1–2 giorni, MEDIUM circa 3–6, MEDIUM-HIGH 1–2
settimane incluse prove; intervalli di pianificazione, da rivalidare al design.

| Gap / capability | Effort / rischio | Bloccate / unlock da sola | Unlock / complessità | Owner coinvolti |
| --- | --- | --- | --- | --- |
| CAP-ATTACK — Cast attack bridge, no mandatory acid deferred rider; variable hit count / auto-hit / cantrip damage scaling | MEDIUM / MEDIUM | 19 / 16 | 5.33 | `src/spellAttackResolutionCore.js`, `src/spellActiveResolutionCore.js`, `src/spellApplicationExecutor.js`, `src/spellUnifiedPanelCore.js` |
| CAP-LINK — Shared GM-assisted maintain/end event and linked-target eligibility | MEDIUM / MEDIUM | 10 / 8 | 2.67 | `src/spellActiveActionCore.js`, `src/spellApplicationExecutor.js`, `src/spellLifecycleOperationsCore.js` |
| CAP-HP-BRANCH — Declarative HP threshold / pre-post damage branch | MEDIUM / HIGH | 5 / 5 | 2.5 | `src/spellAreaResolutionCommandCore.js`, `src/spellAreaResolutionExecutor.js`, `src/effectsMutationCore.js` |
| CAP-CLEANSE — Select/terminate eligible effects and compose with healing cast | MEDIUM / MEDIUM | 6 / 4 | 2 | `src/spellApplicationPlanCore.js`, `src/spellAreaResolutionExecutor.js`, `src/spellUnifiedPanelCore.js` |
| CAP-RESOURCE — General variable/budget resource consume from zone resolution | MEDIUM / MEDIUM | 5 / 4 | 2 | `src/spellActiveResolutionCore.js`, `src/reminderResolutionCore.js`, `src/spellApplicationPlanCore.js` |
| CAP-REACTION — GM-assisted damage/attack response with consume/expiry | MEDIUM-HIGH / HIGH | 6 / 6 | 1.5 | `src/hpConditionRulesCore.js`, `src/reminderResolutionCore.js`, `src/effectsMutationCore.js` |
| CAP-TERRAIN — Mode-specific terrain/membership profiles and selectable subareas | MEDIUM-HIGH / MEDIUM | 6 / 6 | 1.5 | `src/spellAreaRules.js`, `src/spellAreaCatalog.js`, `src/spellStaticZoneCore.js` |
| CAP-TEMP — Temporary-HP pool and damage consumption policy | MEDIUM-HIGH / HIGH | 5 / 5 | 1.25 | `src/effectsMutationCore.js`, `src/effectsMutations.js`, `src/quickHpCore.js` |
| CAP-DURATION — Slot-dependent concentration flag paired with duration | LOW / MEDIUM | 1 / 1 | 1 | `src/spellCastContextCore.js`, `src/spells-srd.js`, `src/spellUnifiedPanelCore.js` |
| CAP-MODE — Exclusive active mode replacement with parent retained | LOW / LOW | 1 / 1 | 1 | `src/spellActiveActionCore.js`, `src/spellApplicationPlanCore.js` |
| CAP-REPEAT-HEAL — Non-spatial repeated target healing reminder | LOW / MEDIUM | 1 / 1 | 1 | `src/reminderResolutionCore.js`, `src/spellLifecycleOperationsCore.js` |
| CAP-ORIGIN — Active actor/root distinct from concentration caster | MEDIUM / MEDIUM | 4 / 3 | 1 | `src/spellActiveResolutionValidation.js`, `src/spellApplicationExecutor.js`, `src/spellUnifiedPanelCore.js` |
| CAP-MAXHP — Owned reversible max-HP modifier and clamp policy | MEDIUM-HIGH / HIGH | 4 / 4 | 1 | `src/effectsMutationCore.js`, `src/effectsMutations.js`, `src/hpMemory.js` |
| CAP-STRUCTURE — Owned destructible segments and residual child zones | MEDIUM-HIGH / HIGH | 3 / 3 | 0.75 | `src/prismaticWallRules.js`, `src/spellChildZoneCore.js`, `src/spellStaticZoneCore.js` |
| CAP-TELEPORT — General active/terminal teleport and composite burst/portal linkage | MEDIUM-HIGH / HIGH | 4 / 3 | 0.75 | `src/spellTeleportCore.js`, `src/spellApplicationExecutor.js`, `src/spellTerminationGatewayCore.js` |
| CAP-MULTIAREA — Multiple instant placements → union/dedup target resolution | MEDIUM / MEDIUM | 3 / 2 | 0.67 | `src/spellAreaPlacementCore.js`, `src/spellAreaResolutionCommandCore.js`, `src/spellAreaResolutionExecutor.js` |
| CAP-SEQUENCE — Round-indexed trigger/damage/geometry schedule | MEDIUM / MEDIUM | 2 / 2 | 0.67 | `src/spellZoneTriggerCore.js`, `src/spellAreaRules.js`, `src/spellStaticZoneCore.js` |
| CAP-STABILIZE — GM-authorized stabilization/revival eligible state to HP/conditions | MEDIUM / HIGH | 6 / 2 | 0.67 | `src/hpConditionRulesCore.js`, `src/effectsMutationCore.js`, `src/spellApplicationPlanCore.js` |
| CAP-CARRIAGE — Carried-zone weighted capacity and selective expulsion | MEDIUM / MEDIUM | 1 / 1 | 0.5 | `src/spellZoneMovementCore.js`, `src/spellApplicationExecutor.js` |
| CAP-RELATION — Parametric HP relationship source→destination, ratio and mitigation order | MEDIUM / HIGH | 1 / 1 | 0.5 | `src/spellDamageHealingCore.js`, `src/spellAreaResolutionExecutor.js` |
| CAP-CALENDAR — Per-day/rest lifecycle counters distinct from combat turns | MEDIUM / MEDIUM | 5 / 1 | 0.33 | `src/spellExpiryCore.js`, `src/spellLifecycleOperationsCore.js` |
| CAP-SUPPRESSION — Reversible suppression of named conditions preserving expiry | MEDIUM / HIGH | 1 / 1 | 0.33 | `src/conditionRulesCore.js`, `src/effectsMutationCore.js` |
| CAP-ALLOCATION — Finite healing budget distributed among target IDs | MEDIUM / MEDIUM | 1 / 0 | 0 | `src/spellAreaResolutionCommandCore.js`, `src/spellUnifiedPanelCore.js` |

Il JSON contiene l'elenco completo delle spell bloccate, owner coinvolti e donor
per ogni riga. CAP-ATTACK e CAP-LINK prima di HP-BRANCH è una scelta di dipendenze
e rischio, pur avendo HP-BRANCH un rapporto numerico migliore di LINK.

| Capability completate | Dipendenze cumulative | GREEN | % backlog | YELLOW restanti |
| --- | --- | --- | --- | --- |
| 0 | Nessuna | 50 | 32.9 | 90 |
| 1 | CAP-ATTACK | 66 | 43.4 | 74 |
| 2 | CAP-ATTACK + CAP-LINK | 75 | 49.3 | 65 |
| 3 | CAP-ATTACK + CAP-LINK + CAP-HP-BRANCH | 80 | 52.6 | 60 |
| 4 | CAP-ATTACK + CAP-LINK + CAP-HP-BRANCH + CAP-CLEANSE | 85 | 55.9 | 55 |
| 5 | CAP-ATTACK + CAP-LINK + CAP-HP-BRANCH + CAP-CLEANSE + CAP-RESOURCE | 89 | 58.6 | 51 |

Dopo le prime cinque capability, **89 GREEN potenziali**, 51 YELLOW e 12 RED.
Una capability conta come completata solo dopo prove comportamentali del suo
intero contratto. Non è lecito chiamare CAP-TEMP, CAP-MAXHP, soglie HP e
stabilizzazione un unico “piccolo blocco vitals” per gonfiare l'unlock.

### Duplicazioni e capability nascoste

| Donor attuale | Riutilizzo / estrazione candidata | Spell che ne beneficiano | Limite residuo |
| --- | --- | --- | --- |
| Lama del Disastro: `maxAttacks`, `attacks[]`, HP cumulativi | Bridge multi-attack al cast | Eldritch Blast, Scorching Ray, Magic Missile, Steel Wind Strike | Slot/livello e auto-hit al cast; niente nuovo controller |
| Telecinesi + `replaceSpellTargets` nel planner comune | Link/retarget assistito | Marchio, Sortilegio, Dardo Stregato, Debilitazione | Eligibility, parent e fine per evento |
| Debilitazione: ratio danno→cura | Relazione parametrica tra attori | Tocco del Vampiro, Trasferimento di Vita | Cast iniziale nel primo; direzione inversa nel secondo |
| Corona di Stelle / Frecce Infuocate | Inizializzazione e consumo contatore | Cordone di Frecce, Guardiano della Fede, Immagine Speculare, Bacche | Trigger e costo variabile/budget, non solo decremento 1 |
| Turbine: carried targets | Capacità ed espulsione di zona | Sfera Acquea | Taglia/capienza e atomicità del trasporto |
| Muro Prismatico / Terremoto / board token | Segmenti, HP e residui | Muro di Ghiaccio, Muro di Pietra, Ossa della Terra | Policy strutturale da estrarre, rischio alto |
| Blink / Misty Step / Dimension Door | Teleport attivo e composito | Passo Remoto, Passo del Tuono, Portale Arcano | Origine/destinazioni/parent; no engine planare |

Nessuna estrazione eseguita in questa tranche.

## F. Legacy map

**13 COMPLETE / LEGACY**: 12 HARMLESS, 1 DUPLICATED, **0 LEGACY RISKY
dimostrati**. Non si deduce RISKY dal numero di righe o dall'esistenza di un
planner bespoke. I limiti comuni di recovery sono documentati separatamente.

| Spell | Classe | Owner bespoke | Equivalente moderno / valore migrazione | Rischio migrazione |
| --- | --- | --- | --- | --- |
| Freccia acida (`acid-arrow`) | LEGACY DUPLICATED | src/spellAttackResolutionCore.js | Deferred effects + expiry; eliminare duplicazione solo dopo CAP-ATTACK | MEDIUM: hit/miss e danno differito |
| Animare oggetti (`animate-objects`) | LEGACY HARMLESS | src/spellBoardTokenCore.js | Riutilizzabili Effects/History/targeting; semantica specifica resta. Valore basso senza nuova necessità | MEDIUM: preservare stato e comportamento specifico |
| Mano arcana (`arcane-hand`) | LEGACY HARMLESS | src/spellBoardTokenCore.js | Riutilizzabili Effects/History/targeting; semantica specifica resta. Valore basso senza nuova necessità | MEDIUM: preservare stato e comportamento specifico |
| Intermittenza (`blink`) | LEGACY HARMLESS | src/blinkRules.js | Riutilizzabili Effects/History/targeting; semantica specifica resta. Valore basso senza nuova necessità | MEDIUM: preservare stato e comportamento specifico |
| Catena di fulmini (`chain-lightning`) | LEGACY HARMLESS | src/spellApplicationPlanCore.js | Riutilizzabili Effects/History/targeting; semantica specifica resta. Valore basso senza nuova necessità | MEDIUM: preservare stato e comportamento specifico |
| Contagio (`contagion`) | LEGACY HARMLESS | src/contagionRules.js | Riutilizzabili Effects/History/targeting; semantica specifica resta. Valore basso senza nuova necessità | MEDIUM: preservare stato e comportamento specifico |
| Controllare acqua (`control-water`) | LEGACY HARMLESS | src/spellChildZoneCore.js | Riutilizzabili Effects/History/targeting; semantica specifica resta. Valore basso senza nuova necessità | MEDIUM: preservare stato e comportamento specifico |
| Palla di fuoco ritardata (`delayed-blast-fireball`) | LEGACY HARMLESS | src/delayedBlastFireballRules.js | Riutilizzabili Effects/History/targeting; semantica specifica resta. Valore basso senza nuova necessità | MEDIUM: preservare stato e comportamento specifico |
| Terremoto (`earthquake`) | LEGACY HARMLESS | src/spellChildZoneCore.js | Riutilizzabili Effects/History/targeting; semantica specifica resta. Valore basso senza nuova necessità | MEDIUM: preservare stato e comportamento specifico |
| Carne in pietra (`flesh-to-stone`) | LEGACY HARMLESS | src/fleshToStoneRules.js | Riutilizzabili Effects/History/targeting; semantica specifica resta. Valore basso senza nuova necessità | MEDIUM: preservare stato e comportamento specifico |
| Spruzzo prismatico (`prismatic-spray`) | LEGACY HARMLESS | src/prismaticSprayRules.js | Riutilizzabili Effects/History/targeting; semantica specifica resta. Valore basso senza nuova necessità | MEDIUM: preservare stato e comportamento specifico |
| Muro prismatico (`prismatic-wall`) | LEGACY HARMLESS | src/prismaticWallRules.js | Riutilizzabili Effects/History/targeting; semantica specifica resta. Valore basso senza nuova necessità | MEDIUM: preservare stato e comportamento specifico |
| Telecinesi (`telekinesis`) | LEGACY HARMLESS | src/telekinesisRules.js | Riutilizzabili Effects/History/targeting; semantica specifica resta. Valore basso senza nuova necessità | MEDIUM: preservare stato e comportamento specifico |

La presenza di una primitive moderna per un sotto-passaggio non sostituisce
necessariamente la macchina di stato di tutta la spell. Nessuna migrazione
legacy deve precedere i GREEN sulla sola base di questa classificazione.

## G. Implementation dry-run

Questi dry-run non aggiungono spell al codice. Per ognuno si segue il percorso
cast → stato → azione/trigger → cleanup → test; validare soltanto un descriptor
non basta. I probe runtime dell'audit verificano owner, eligibility, operations,
scaling target, rounding e recovery envelope.

| Campione incompleto | Composizione concreta | Targeting / lifecycle / test da aggiungere | Esito |
| --- | --- | --- | --- |
| **Inaridire / Blight** — damage/save | `MULTI_TARGET_SAVE_SPELL_IDS` (anche max 1) + `SPELL_SAVE_WORKFLOW_RULES` con CON, `SPELL_CAST_RESOLUTION_RULES.initialHP`, successful save half; `buildSpellAreaResolutionCommand` discreto | max 1/bypass, slot hint 8d8 +1d8, immune/plant choice verificata dal GM, nessun parent persistente; test danno 7→3 su successo, immune→0 e mapping locale | GREEN; niente nuova branch runtime |
| **Pelle di Pietra** — concentration | `SPELL_EFFECTS` per resistenze informative + `catalogSpellApplicationOperations`, `concentration:register` e replace/break già presenti | un target, 1 ora, parent e dipendenti; test cast, sostituzione, fine manuale, expiry/Undo; mitigation manuale come contratto corrente | GREEN |
| **Allucinazione Mortale** — repeat-save | `automation.conditionOptions.Spaventato.saveReminder.damage`: aggiungere `baseSlot:4`, `additionalPerSlotAbove:1`; `buildEffectSaveReminderResolution` e `scaleReminderResolutionData` esistono | TS WIS a fine target, 4d10/5d10/… su fallimento; successo rimuove parent corretto; test due slot, save-success, repeat-failure e Undo del consume | GREEN; manca configurazione di scaling |
| **Passare Senza Tracce** — aura | effect +10 esistente → `SPELL_AREA_RULES` kind aura, caster anchor 9 m, targetScope spell-targets → `mobileAuraMembershipPlan` | include caster, subset scelto, enter/leave, non dare bonus a tutti; parent concentrazione; test uscita/rientro/fine e mancato respawn su Undo | GREEN; riuso membership e VFX facoltativo |
| **Parola Guaritrice di Massa** — multi-target/scaling | registro healing come Mass Cure Wounds + workflow discreto senza TS imposto, maxTargets 6, input cura finale; slot/dadi nel mapping | zero/sei/sette target e bypass, HP cap canonico; test tutti i target nello stesso commit e un Undo. Il dado + modificatore lo fornisce il GM | GREEN; non richiede allocazione libera del pool |
| **Raggio di Sole** — persistent active spell | cast area esistente + istanza sul caster + `SPELL_ACTIVE_RESOLUTION_ACTIONS` save-area, `placementRuleId:sunbeam:cast`, CON, `6d8`, half; `failureEffects` Accecato indipendente | parent preservato tra raggi, expiry all'inizio source successivo, luce solo informativa; test primo raggio e azione successiva, stale parent, fine concentrazione | GREEN; fase persistente da dichiarare, nessun controller nuovo |
| **Tocco del Vampiro** — persistent active drain | clone dichiarativo single-attack di Corona di Stelle senza resource, range 1,5 m, 3d6 +slot, `casterHealingFromAppliedDamage:0.5` | il descriptor valida nel probe; cast iniziale/miss/concentrazione non è risolto dal solo active descriptor. Test first-cast miss, repeated hit, ratio e stale parent dopo CAP-ATTACK | GREEN ipotizzato → **YELLOW** |
| **Scagliare Maledizione** — repeat-save varianti | effectChoices e saveReminder inizio target già componibili | durata per slot esiste, ma `resolveSpellConcentration` legge un boolean fisso: sopra slot 4 cambia il contratto. Test slot4/5 e rimozione al successo dopo CAP-DURATION | GREEN ipotizzato → **YELLOW** |
| **Ristorare Inferiore** — cleanup | `condition:remove-instances` esiste | manca il cast configurabile che seleziona una condizione eleggibile esistente e ne preserva l'identità. Non chiamare GREEN una nuova branch del controller | GREEN ipotizzato → **YELLOW**, CAP-CLEANSE |

Per i cantrip GREEN di danno/save, “scaling” significa testo/dadi suggeriti e
valore finale inserito dal GM. Se il prodotto richiedesse calcolo automatico
universale dei dadi dal livello personaggio, serve estendere il relativo
contratto: non è incluso implicitamente negli unlock qui conteggiati.

## H. Recommended implementation plan

### PHASE 0 — shared blockers

1. **CAP-ATTACK**, includendo il blocker acido, collegando il multi-hit esistente
   al cast. Sblocca 16 spell da sola; non costruire 16 controller.
2. **CAP-LINK**: mantiene l'evento esplicito GM e parent identity, riusa retarget
   e termination. Con ATTACK sblocca altre 9 spell.
3. **CAP-HP-BRANCH**: soglie e conseguenze in un plan atomico; altre 5.
4. **CAP-CLEANSE**: selezione di effetti attivi e cast cura/cleanup; altre 5,
   incluso Dispel Evil and Good che dipende anche da ATTACK.
5. **CAP-RESOURCE**: consume e budget da zone/azioni; altre 4.

Le cinque capability sono tranche separate con test shared, non un unico grande
intervento. Si possono completare i GREEN indipendenti prima/durante questa fase.

### Batch GREEN immediati

| Batch | Spell / dimensione | Motivo / rischio |
| --- | --- | --- |
| G1 — DISCRETE-SAVE | 11: Fiotto acido (`acid-splash`); Inaridire (`blight`); Intimorire infernale (`hellish-rebuke`); Spruzzo velenoso (`poison-spray`); Fiamma sacra (`sacred-flame`); Beffa crudele (`vicious-mockery`); Catapulta (`xanathar-catapulta`); Infestazione (`xanathar-infestazione`); Morsa del Gelo (`xanathar-morsa-del-gelo`); Rintocco dei Morti (`xanathar-rintocco-dei-morti`); Sussurri Dissonanti (`phb2014-sussurri-dissonanti`) | Stessa lane save/HP discreta; LOW-MEDIUM, 11 insieme dopo primo contract test |
| G2 — ZONE-DATA | 10: Antipatia/simpatia (`antipathy-sympathy`); Proibizione (`forbiddance`); Globo di invulnerabilità (`globe-of-invulnerability`); Santificare (`hallow`); Tempesta di ghiaccio (`ice-storm`); Cerchio magico (`magic-circle`); Muro di forza (`wall-of-force`); Muro di Sabbia (`xanathar-muro-di-sabbia`); Pirotecnica (`xanathar-pirotecnica`); Scossa Tellurica (`xanathar-scossa-tellurica`) | Geometrie/trigger condivisi; MEDIUM, 5+5 con pilot rappresentativo |
| G3 — SAVE-EFFECT-DATA | 4: Risveglio (`awaken`); Spruzzo colorato (`color-spray`); Trama ipnotica (`hypnotic-pattern`); Sonno (`sleep`) | Descriptor/parent/expiry condivisi; LOW-MEDIUM, 4 insieme |
| G4 — PASSIVE-DATA | 16: Pelle coriacea (`barkskin`); Faro di speranza (`beacon-of-hope`); Estasiare (`enthrall`); Ritirata rapida (`expeditious-retreat`); Previsione (`foresight`); Saltare (`jump`); Levitazione (`levitate`); Armatura magica (`mage-armor`); Suggestione di massa (`mass-suggestion`); Protezione dall'energia (`protection-from-energy`); Protezione dal bene e dal male (`protection-from-evil-and-good`); Protezione dai veleni (`protection-from-poison`); Sfera elastica (`resilient-sphere`); Pelle di pietra (`stoneskin`); Suggestione (`suggestion`); Invulnerabilità (`xanathar-invulnerabilita`) | Effetti/bonus/expiry informativi; LOW, 8+8 se review troppo ampia |
| G5 — HEAL | 4: Cura ferite (`cure-wounds`); Parola guaritrice (`healing-word`); Parola guaritrice di massa (`mass-healing-word`); Preghiera di guarigione (`prayer-of-healing`) | Input cura e clamp/cap condivisi; LOW, 4 insieme |
| G6 — REPEAT-SAVE-DATA | 2: Labirinto (`maze`); Allucinazione mortale (`phantasmal-killer`) | Descriptor/parent/expiry condivisi; LOW-MEDIUM, 2 insieme |
| G7 — AURA-DATA | 1: Passare senza tracce (`pass-without-trace`) | Descriptor/parent/expiry condivisi; LOW-MEDIUM, 1 insieme |
| G8 — ACTIVE-AREA-DATA | 2: Bagliore solare (`sunbeam`); Drago Illusorio (`xanathar-drago-illusorio`) | Descriptor/parent/expiry condivisi; LOW-MEDIUM, 2 insieme |

Per i due batch piccoli di aura/active iniziare con 1–2 representative E2E,
poi riusare la famiglia; non sommarli a un batch di 30 puramente statiche.

### Batch YELLOW dopo le dipendenze

| Dipendenze / batch | Spell distinte | Dimensione e rischio |
| --- | --- | --- |
| Y1 — dopo CAP-ATTACK | 16: Tocco gelido (`chill-touch`); Deflagrazione occulta (`eldritch-blast`); Dardo di fuoco (`fire-bolt`); Dardo tracciante (`guiding-bolt`); Infliggi ferite (`inflict-wounds`); Dardo incantato (`magic-missile`); Produrre fiamma (`produce-flame`); Raggio di gelo (`ray-of-frost`); Raggio rovente (`scorching-ray`); Stretta folgorante (`shocking-grasp`); Tocco del vampiro (`vampiric-touch`); Ferocia Primordiale (`xanathar-ferocia-primordiale`); Lama Verdefiamma (`tasha-lama-verdefiamma`); Lenza Elettrizzante (`tasha-lenza-elettrizzante`); Frusta di Spine (`phb2014-frusta-di-spine`); Globo Cromatico (`phb2014-globo-cromatico`) | MEDIUM; due sottobatch da 8 dopo test della capability |
| Y2 — dopo CAP-ATTACK + CAP-LINK | 9: Marchio del cacciatore (`hunters-mark`); Invisibilità (`invisibility`); Debilitazione (`xanathar-debilitazione`); Prigione Mentale (`xanathar-prigione-mentale`); Lama Roboante (`tasha-lama-roboante`); Dardo Stregato (`phb2014-dardo-stregato`); Duello Obbligato (`phb2014-duello-obbligato`); Sortilegio (`phb2014-sortilegio`); Corona di Follia (`phb2014-corona-di-follia`) | MEDIUM; batch da 9 dopo test della capability |
| Y3 — dopo CAP-ATTACK + CAP-LINK + CAP-HP-BRANCH | 5: Disintegrazione (`disintegrate`); Parola divina (`divine-word`); Regressione mentale (`feeblemind`); Dito della morte (`finger-of-death`); Parola del potere uccidere (`power-word-kill`) | MEDIUM; batch da 5 dopo test della capability |
| Y4 — dopo CAP-ATTACK + CAP-LINK + CAP-HP-BRANCH + CAP-CLEANSE | 5: Dissolvi il bene e il male (`dispel-evil-and-good`); Dissolvi magie (`dispel-magic`); Guarigione (`heal`); Ristorare inferiore (`lesser-restoration`); Parola del Potere Guarire (`phb2014-parola-del-potere-guarire`) | MEDIUM; batch da 5 dopo test della capability |
| Y5 — dopo CAP-ATTACK + CAP-LINK + CAP-HP-BRANCH + CAP-CLEANSE + CAP-RESOURCE | 4: Bacche benefiche (`goodberry`); Guardiano della fede (`guardian-of-faith`); Immagine speculare (`mirror-image`); Cordone di Frecce (`phb2014-cordone-di-frecce`) | MEDIUM; batch da 4 dopo test della capability |
| Dopo CAP-MAXHP | 4: Aiuto (`aid`); Ristorare superiore (`greater-restoration`); Ferire (`harm`); Banchetto degli eroi (`heroes-feast`) | Rischio dei gap in E; pilot 1–2, poi sottobatch massimo 6 |
| Dopo CAP-MODE | 1: Alterare sé stesso (`alter-self`) | Rischio dei gap in E; pilot 1–2, poi sottobatch massimo 6 |
| Dopo CAP-DURATION | 1: Scagliare maledizione (`bestow-curse`) | Rischio dei gap in E; pilot 1–2, poi sottobatch massimo 6 |
| Dopo CAP-SUPPRESSION | 1: Calmare emozioni (`calm-emotions`) | Rischio dei gap in E; pilot 1–2, poi sottobatch massimo 6 |
| Dopo CAP-REACTION | 6: Interdizione alla morte (`death-ward`); Scudo di fuoco (`fire-shield`); Santuario (`sanctuary`); Vincolo di interdizione (`warding-bond`); Interdizione Primordiale (`xanathar-interdizione-primordiale`); Ombra di Moil (`xanathar-ombra-di-moil`) | Rischio dei gap in E; pilot 1–2, poi sottobatch massimo 6 |
| Dopo CAP-LINK + CAP-ORIGIN | 1: Segugio fedele (`faithful-hound`) | Rischio dei gap in E; pilot 1–2, poi sottobatch massimo 6 |
| Dopo CAP-TEMP | 5: Vita falsata (`false-life`); Eroismo (`heroism`); Flusso di Energia Negativa (`xanathar-flusso-di-energia-negativa`); Trasformazione di Tenser (`xanathar-trasformazione-di-tenser`); Armatura di Agathys (`phb2014-armatura-di-agathys`) | Rischio dei gap in E; pilot 1–2, poi sottobatch massimo 6 |
| Dopo CAP-MULTIAREA | 2: Tempesta di fuoco (`fire-storm`); Sciame di meteore (`meteor-swarm`) | Rischio dei gap in E; pilot 1–2, poi sottobatch massimo 6 |
| Dopo CAP-ORIGIN | 3: Sfera congelante (`freezing-sphere`); Soffio del Drago (`xanathar-soffio-del-drago`); Rampicante Afferrante (`phb2014-rampicante-afferrante`) | Rischio dei gap in E; pilot 1–2, poi sottobatch massimo 6 |
| Dopo CAP-CALENDAR | 1: Costrizione (`geas`) | Rischio dei gap in E; pilot 1–2, poi sottobatch massimo 6 |
| Dopo CAP-ALLOCATION + CAP-CLEANSE | 1: Guarigione di massa (`mass-heal`) | Rischio dei gap in E; pilot 1–2, poi sottobatch massimo 6 |
| Dopo CAP-TERRAIN | 6: Crescita vegetale (`plant-growth`); Parlare con i vegetali (`speak-with-plants`); Simbolo (`symbol`); Boschetto Druidico (`xanathar-boschetto-druidico`); Muro d'Acqua (`xanathar-muro-dacqua`); Trasmutare Roccia (`xanathar-trasmutare-roccia`) | Rischio dei gap in E; pilot 1–2, poi sottobatch massimo 6 |
| Dopo CAP-CALENDAR + CAP-STABILIZE | 4: Rianimare morti (`raise-dead`); Reincarnazione (`reincarnate`); Resurrezione (`resurrection`); Resurrezione pura (`true-resurrection`) | Rischio dei gap in E; pilot 1–2, poi sottobatch massimo 6 |
| Dopo CAP-REPEAT-HEAL | 1: Rigenerazione (`regenerate`) | Rischio dei gap in E; pilot 1–2, poi sottobatch massimo 6 |
| Dopo CAP-STABILIZE | 2: Rinascita (`revivify`); Salvare i morenti (`spare-the-dying`) | Rischio dei gap in E; pilot 1–2, poi sottobatch massimo 6 |
| Dopo CAP-SEQUENCE | 2: Tempesta di vendetta (`storm-of-vengeance`); Tsunami (`phb2014-tsunami`) | Rischio dei gap in E; pilot 1–2, poi sottobatch massimo 6 |
| Dopo CAP-STRUCTURE | 3: Muro di ghiaccio (`wall-of-ice`); Muro di pietra (`wall-of-stone`); Ossa della Terra (`xanathar-ossa-della-terra`) | Rischio dei gap in E; pilot 1–2, poi sottobatch massimo 6 |
| Dopo CAP-ATTACK + CAP-TELEPORT | 1: Colpo del Vento d'Acciaio (`xanathar-colpo-del-vento-dacciaio`) | Rischio dei gap in E; pilot 1–2, poi sottobatch massimo 6 |
| Dopo CAP-MULTIAREA + CAP-RESOURCE | 1: Minuscole Meteore di Melf (`xanathar-minuscole-meteore-di-melf`) | Rischio dei gap in E; pilot 1–2, poi sottobatch massimo 6 |
| Dopo CAP-TELEPORT | 3: Passo del Tuono (`xanathar-passo-del-tuono`); Passo Remoto (`xanathar-passo-remoto`); Portale Arcano (`phb2014-portale-arcano`) | Rischio dei gap in E; pilot 1–2, poi sottobatch massimo 6 |
| Dopo CAP-CARRIAGE | 1: Sfera Acquea (`xanathar-sfera-acquea`) | Rischio dei gap in E; pilot 1–2, poi sottobatch massimo 6 |
| Dopo CAP-RELATION | 1: Trasferimento di Vita (`xanathar-trasferimento-di-vita`) | Rischio dei gap in E; pilot 1–2, poi sottobatch massimo 6 |

Gli altri YELLOW seguono il grafo `missingCapabilities` della matrice. Ogni
famiglia è un batch da 1–6 spell dopo la propria primitive; multi-area+risorse,
heal allocation+cleanse e resurrezione+calendar aspettano **tutte** le dipendenze.
Le stime di rischio alto su HP, origine, strutture o teleport richiedono una
tranche pilota di 1–2 spell prima di ampliare.

### BESPOKE / RED backlog

| Spell | Semantica specifica residua |
| --- | --- |
| Forme animali (`animal-shapes`) | Forma, statistiche, pool HP sostitutivo e ripristino richiedono un dominio esplicito; non è un semplice condition descriptor. |
| Campo anti-magia (`antimagic-field`) | Soppressione reversibile per tipo di magia e sovrapposizione parziale di aree richiede effective-state trasversale; il solo marker aura non basta. Distinto dal piccolo gap Calm Emotions. |
| Contingenza (`contingency`) | Tracking/area presenti; incantesimo figlio arbitrario e attivazione condizionale con durata/concentrazione proprie non rappresentabili da semplice descriptor. |
| Glifo di interdizione (`glyph-of-warding`) | Tracking/area presenti; incantesimo figlio arbitrario e attivazione condizionale con durata/concentrazione proprie non rappresentabili da semplice descriptor. |
| Giara magica (`magic-jar`) | Istanza presente; identità/controllo/sensi su entità secondaria e transizioni finali richiedono stato specifico. |
| Fuorviare (`mislead`) | Istanza presente; identità/controllo/sensi su entità secondaria e transizioni finali richiedono stato specifico. |
| Metamorfosi (`polymorph`) | Forma, statistiche, pool HP sostitutivo e ripristino richiedono un dominio esplicito; non è un semplice condition descriptor. |
| Inversione della gravità (`reverse-gravity`) | Zona/sospensione presenti; salita, collisione, rientro e caduta finale coordinati non sono un trigger di membership ordinario. |
| Trasformazione (`shapechange`) | Forma, statistiche, pool HP sostitutivo e ripristino richiedono un dominio esplicito; non è un semplice condition descriptor. |
| Fermare il tempo (`time-stop`) | Turni extra e terminazione contestuale richiedono semantica temporale ulteriore; non toccare navigazione in questa tranche. |
| Metamorfosi pura (`true-polymorph`) | Forma, statistiche, pool HP sostitutivo e ripristino richiedono un dominio esplicito; non è un semplice condition descriptor. |
| Dardo di Caos (`xanathar-dardo-di-caos`) | Scelta tipo dai dadi e rimbalzi dipendenti dai risultati: il cap non modella la catena di risoluzioni. |

Red non significa nuovo sistema di History o Effects. Anche queste spell devono
comporre le infrastrutture condivise; rimane specifica la semantica di stato.
Mantello del Crociato legacy e Imprigionare aspettano la verifica delle regole/perimetro.

## I. Estimated batchability e test strategy

| Dimensione | Valutazione concreta |
| --- | --- |
| **10** | Sì per stessa famiglia GREEN, o dopo primitive YELLOW stabilizzata; no a dieci meccaniche nuove insieme |
| **20** | Sì per effects/bonus/expiry omogenei: il batch passivo proposto è di 16; espandibile solo con altri dati verificati, non mescolando active/area/state machine |
| **30+** | Non raccomandato oggi come primo batch. Possibile in seguito per mapping statici con contract/data coverage già consolidata, 2–3 sottobatch reviewabili e smoke rappresentativi |

La dimensione si misura anche in nuove interazioni, non solo spell count.
Venti righe dichiarative devono introdurre zero nuovi controller e zero writer.

**Shared capability tests:** casi validi e invalidi, target stale/parent scaduto,
save success/failure/immune, HP clamp/rounding, duplicazione comando,
once-per-turn/consume parziale, fine concentrazione, Undo e recovery nel suo
envelope. Per nuove capability HP includere expected-before e ripristino dei
modificatori; per aree eliminazione/ripristino di soli item posseduti.

**Per-spell contract/data tests:** tabella eseguibile sui veri planner per
ability TS, formule/tipi e scaling, durata/anchor, cap/bypass, effect ID,
condizioni e descriptor lifecycle. Confrontare dati RAW curati, non la stessa
definizione contro se stessa. Nuovi effetti on-hit: verificare esplicitamente
assenza di `acid-arrow-delayed-acid` sulle altre spell. Niente promozione a
COMPLETE per regex o `assert.ok(effect)` soltanto.

**Representative E2E:** 1–3 per famiglia, usando mock OBR stateful/executor
reale: un cast, azione o trigger, termine e Undo; failure injection per ogni
nuovo side effect. Le varianti statiche usano test parametrizzati, non 20 E2E
giganti. Uno smoke live rappresentativo verifica l'integrazione Owlbear/VFX,
che la baseline Node non misura. Harness completo dopo cambi di runtime
condiviso; non usarne il tempo simulato per promettere latenza UI.

## J. Documentation changes e mantenimento

- Aggiornato **questo audit**: fonte autorevole di conclusioni, roadmap e
  backlog semantico; output strutturale separato sotto.
- Aggiornato **SPELL_ARCHITECTURE_MASTER.md**: capability → owner → API → test;
  rimossi i vecchi confini che escludevano History/Undo dalla verifica corrente.
- Aggiornato **INDICE.md**: link alle fonti e conteggi runtime verificati.
- Creato **data/spell-implementation-status.json**: 477 schede strutturate,
  status/readiness e annotazioni umane, con osservazioni runtime separate.
- Creato **data/spell-capability-map.json**: 39 capability, 23 gap, dipendenze,
  stime di unlock e risultati dei 9 probe read-only.
- Piccola modifica alla scrittura dell'**audit generator esistente**: conserva
  questo blocco tra i marker `SPELL-COMPOSITION-AUDIT` quando rigenera lo snapshot.
  Non è un nuovo generatore semantico e non cambia alcun file produttivo.

Generabili: ID canonico, alias, livello, concentrazione, regole, actions,
operation types, geometria e riferimenti ai test candidati. Da mantenere con
review umana: COMPLETE/LEGACY/PARTIAL, family, scope manuale, gap, dipendenze,
stima/rischio e regole canoniche. `npm run audit:spells` **non riclassifica** la
matrice semantica: dopo una modifica spell, aggiornare la sua riga e i conteggi,
verificare che il set di ID coincida con `getSpellCatalog`, e rieseguire i
planner/test di famiglia. Il fingerprint produttivo segnala che una fotografia
può essere diventata stale; non autorizza promozioni automatiche.

Esempi di query (Node, dalla root):

```js
const a = JSON.parse(require('node:fs').readFileSync('data/spell-implementation-status.json'));
a.rows.filter(s => s.readiness === 'GREEN').map(s => [s.id, s.implementationFamily]);
a.rows.filter(s => s.missingCapabilities.includes('CAP-ATTACK')).map(s => s.id);
```

### Verifica doc ↔ code/test

| Campione | Verdetto | Riscontro |
| --- | --- | --- |
| fireball; hold-person | COMPLETE / CURRENT | Area/save e lifecycle; spellAreaResolutionCommandCore, holdPersonSaveWorkflow |
| acid-arrow | COMPLETE / LEGACY | spellAttackResolutionCore + deferredSpellWorkflow; differito acido pertinente solo qui |
| guiding-bolt | PARTIAL / YELLOW | Probe hit produce acid-arrow-delayed-acid; CAP-ATTACK |
| cure-wounds | MISSING / GREEN | Catalogo senza cura significativa; lane mass-cure-wounds e HP clamp esistenti |
| hypnotic-pattern; phantasmal-killer | PARTIAL / GREEN | Flag endsOnDamage e scaling reminder mancanti; owner condivisi verificati |
| vampiric-touch | YELLOW | Active descriptor valida, cast bridge non basta; probe + executor |
| reverse-gravity | RED | Movimento verticale/gravity persistent state non rappresentato dalle sole aree |
| flame-blade; shadow-blade; soul-cage | NO AUTOMATION REQUIRED / BLUE | Contratto manuale accettato, verificato nei test di integrazione |
| legacy-crusaders-mantle; imprisonment | REQUIRES RULE VERIFICATION | Testo locale assente per la prima; scope modalità/terminazioni da definire per la seconda |

ID/enum/unicità/campi obbligatori, somme, dipendenze soddisfatte, esistenza dei
file citati e parità del blocco umano dopo rigenerazione controllati. Le
classificazioni sono falsificabili: se un dry-run richiede una nuova branch di
runtime, cambiare GREEN in YELLOW/RED prima di avviare il batch.

## K. Open architectural gaps: cosa impedisce un quasi one-shot?

| Ostacolo | Severità | Impatto sui GREEN oggi |
| --- | --- | --- |
| ARCHITECTURAL | LOW per GREEN; HIGH sul catalogo complessivo | Nessuna nuova semantica dichiarata nei 50 GREEN. Attacchi, HP speciali, attori/root, budget e stato RED limitano gli altri batch |
| RULE DATA | MEDIUM | Mapping in più registri, testi locali talvolta OCR; 2 voci sospese. Verificare per spell ability, target, durata e confini manuali prima di certificare COMPLETE |
| TESTING | HIGH per un one-shot di 30+ | Baseline ampia ma non completa per tutte le combinazioni; il bug acido dimostra la debolezza di test che controllano solo presenza/route |
| UI | LOW | Niente polishing; serve solo che i nuovi dati producano input/outcome e azioni raggiungibili nel contratto comune |
| VFX | LOW / non bloccante | Mapping opzionale, no nuovo runtime visuale per chiamare COMPLETE una mechanic |
| DOCUMENTATION | LOW dopo questo audit | Annotazioni umane e fatti runtime separati; aggiornare la riga nello stesso batch del codice |
| NONE | Famiglie statiche già verificate | Per un batch omogeneo da circa 10 spell non è stato identificato un blocker runtime oltre ai dati/test elencati |

Per completare **tutti i GREEN** servono quindi mapping e validazione disciplinati,
non un'altra fase di architecture generalista. Per completare **tutto il
catalogo** non basta una sola tranche: 51 YELLOW resterebbero anche dopo i cinque
interventi iniziali. Multi-GM è fuori contratto e non compare nelle dipendenze.

## L. Final recommendation

**Combinare 1 e 2: implementare subito GREEN omogenei e costruire prima i shared
blocker delle famiglie bloccate.** Primo batch: 10–13 damage/save discreti o
8–10 effetti passivi. In parallelo di roadmap, CAP-ATTACK come tranche separata,
poi LINK, HP-BRANCH, CLEANSE e RESOURCE. Non migrare legacy per ragioni estetiche.

Non approvare ora un one-shot di tutte le spell: il risultato verificato è
**50 → 80 → 89 GREEN potenziali e 12 RED**, non “quasi tutto dopo tre primitive”.
Nessuna nuova spell, controller, resolver, UI o capability è stata implementata
da questo audit.
<!-- SPELL-COMPOSITION-AUDIT:END -->

# Snapshot strutturale dell'automazione incantesimi

> **Output strutturale, non classificazione semantica di completezza.**
> Stato COMPLETE/PARTIAL/MISSING e readiness: [matrice autorevole](../data/spell-implementation-status.json).
> Capability e dipendenze: [capability map](../data/spell-capability-map.json). FULL/coperto non equivale a COMPLETE.
> Mappa i 477 record del catalogo distinguendo stato attuale, stato desiderato,
> esposizione UI, conformità regolamentare e requisiti di smoke test.

## Metodo e sintesi del catalogo

- Catalogo totale: **477** definizioni su 477 record.
- Testi disponibili: **476** / 477.
- Esposti nella console unificata: **392**; disconnessi: **0**; fragili: **0**.
- Opzioni trackable del runtime: **358**; definizioni con tracking persistente verificate dall'audit: **355**; definizioni con regole d'area: **134** (139 regole).
- Workflow che richiedono smoke test runtime: **389**.
- Lacune RAW confermate P1: **10**; discrepanze ad alta confidenza P2: **1**.
- Impronta deterministica: `807a0a5583d7742f`.

## Decisioni di prodotto chiuse

- Dominare Bestie / Persone / Mostri: `damage-triggered save reminder only; precise control remains manual`.
- Compulsione (`compulsion`): `PARTIAL/CLOSED`; tracking dei fallimenti, condizione, concentrazione e reminder del nuovo TS dopo il movimento. Direzione, movimento fisico, terreno e attacchi di opportunità restano manuali.
- Aura sacra (`holy-aura`): `PARTIAL/CLOSED`; placement al lancio con caster selezionabile, protetti fissi, condizione di vantaggio/svantaggio, concentrazione e cleanup. Modificatori ai tiri, luce e trigger immondo/non morto → TS Costituzione → Accecato restano manuali.

### Livello di automazione attuale (currentAutomationLevel)

| Stato | Totale |
| --- | ---: |
| FULL | 66 |
| MANUAL | 88 |
| PARTIAL | 180 |
| TRACK_ONLY | 143 |

### Stato di copertura (coverageStatus)

`CLOSED` indica una decisione di prodotto chiusa: la copertura è accettata e non sono richieste ulteriori azioni di automazione.

| Stato | Totale |
| --- | ---: |
| ACCEPTED | 71 |
| CLOSED | 13 |
| GAP | 11 |
| UNREVIEWED | 382 |

### Livello di automazione target (targetAutomationLevel)

| Stato | Totale |
| --- | ---: |
| FULL | 66 |
| MANUAL | 3 |
| PARTIAL | 12 |
| TRACK_ONLY | 3 |
| UNREVIEWED | 393 |

### Esposizione UI attuale (currentUiExposure)

| Stato | Totale |
| --- | ---: |
| REFERENCE_ONLY | 85 |
| UNIFIED | 392 |

### Esposizione UI target (targetUiExposure)

| Stato | Totale |
| --- | ---: |
| UNIFIED | 392 |
| UNREVIEWED | 85 |

### Categorie di Smoke Test richieste

| Stato | Totale |
| --- | ---: |
| ACTIVE_ACTION | 40 |
| AREA_GEOMETRY | 134 |
| CAST | 222 |
| CLEANUP | 107 |
| CONCENTRATION | 218 |
| PERSISTENCE | 355 |
| TURN_TRIGGER | 89 |

### Stato di integrazione console unificata

| Stato | Totale |
| --- | ---: |
| partial | 11 |
| reachable | 381 |
| unexposed | 85 |

### Problemi di integrazione

| Stato | Totale |
| --- | ---: |
| CAST_NO_MUTATIONS | 3 |
| UNIFIED_CATALOG_MISSING | 85 |

## Integrazione con la console unificata

Questa sezione segnala workflow con gap di integrazione, azioni non raggiungibili o cast anomali.

| Incantesimo | Console | Cast | Azioni successive | Stato | Problemi |
| --- | --- | --- | --- | --- | --- |
| Alleato planare | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Animare morti | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Artificio druidico | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Bacche benefiche | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Banchetto degli eroi | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Beffa crudele | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Catapulta | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Clone | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Colpo del Vento d'Acciaio | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Comunione con la natura | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Conoscenza delle leggende | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Controincantesimo | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Controllare Fiamme | esposto | spell-lifecycle | nessuna | reachable | il cast non produce alcuna mutazione significativa |
| Creare cibo e acqua | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Creare non morti | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Creare o distruggere acqua | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Creare Omuncolo | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Crescita vegetale | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Cura ferite | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Dardo di Caos | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Dardo di fuoco | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Dardo incantato | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Deflagrazione occulta | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Desiderio | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Disintegrazione | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Disperdere | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Dissolvi magie | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Dito della morte | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Divinazione | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Fabbricare | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Ferire | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Fermare il tempo | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Ferocia Primordiale | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Fiamma sacra | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Fiotto acido | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Flusso di Energia Negativa | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Folata | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Frusta di Spine | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Globo Cromatico | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Guarigione | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Guarigione di massa | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Identificare | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Inaridire | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Infestazione | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Infliggi ferite | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Intimorire infernale | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Lama Verdefiamma | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Lenza Elettrizzante | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Localizza animali o vegetali | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Modellare Acqua | esposto | spell-lifecycle | nessuna | reachable | il cast non produce alcuna mutazione significativa |
| Modellare Terra | esposto | spell-lifecycle | nessuna | reachable | il cast non produce alcuna mutazione significativa |
| Ossa della Terra | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Parola del Potere Guarire | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Parola del potere uccidere | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Parola del ritiro | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Parola guaritrice | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Parola guaritrice di massa | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Porta dimensionale | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Preghiera di guarigione | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Presagio | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Purificare cibo e bevande | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Raggio rovente | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Regressione mentale | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Reincarnazione | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Resurrezione | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Resurrezione pura | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Rianimare morti | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Rimuovi maledizione | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Rinascita | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Rintocco dei Morti | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Riparare | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Ristorare inferiore | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Ristorare superiore | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Risveglio | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Salvare i morenti | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Scassinare | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Scolpire pietra | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Scopri trappole | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Scrigno segreto | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Spostamento planare | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Spruzzo velenoso | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Stretta folgorante | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Sussurri Dissonanti | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Teletrasporto | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Trasferimento di Vita | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Trova cavalcatura | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Trova Cavalcatura Superiore | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |
| Trova famiglio | assente | spell-lifecycle | nessuna | unexposed | incantesimo non esposto nella console unificata |

## P1 — lacune confermate sul testo RAW

| Incantesimo | Fonte | Lacune | Evidenza/valutazione |
| --- | --- | --- | --- |
| Debilitazione | Xanathar | azione ripetibile della spell assente; trigger condizionale durante la durata assente | Dopo il fallimento iniziale, ogni azione del caster ripete automaticamente i danni e cura la metà; altre azioni, gittata o copertura terminano la spell. |
| Forme animali | SRD 5.1 | azione ripetibile della spell assente; varianti rilevanti non modellate | Manca l'azione dei turni successivi che cambia nuovamente, anche in modo diverso per ciascun bersaglio, le forme e i blocchi statistiche associati. |
| Fuorviare | SRD 5.1 | condizione o stato RAW non rappresentato; azione ripetibile della spell assente | Mancano Invisibile sul caster, l'entità illusoria mobile e le azioni successive per muoverla e alternare l'uso dei sensi. |
| Interdizione Primordiale | Xanathar | trigger condizionale durante la durata assente; conseguenza alla fine della spell assente | Una reazione al danno trasforma tutte le resistenze nell'immunità al tipo scelto fino alla fine del turno successivo. |
| Inversione della gravità | SRD 5.1 | ingresso, sospensione e caduta finale non risolti; trigger spaziali o di turno assenti | La geometria non basta: servono salita, collisione, sospensione e caduta coordinata quando termina la spell. |
| Muro d'Acqua | Xanathar | meccanica di movimento assente; trigger condizionale durante la durata assente | La parete non applica terreno difficile né le interazioni contestuali con attacchi a distanza, danni da fuoco e congelamento locale da freddo. |
| Parlare con i vegetali | SRD 5.1 | meccanica di movimento assente; varianti rilevanti non modellate | L'aura è presente, ma manca la scelta di rendere normale o difficile il terreno vegetale e il relativo collegamento allo Speed Tracker. |
| Tempesta di vendetta | SRD 5.1 | progressione degli effetti per round assente; condizione o stato RAW non rappresentato; meccanica di movimento assente | L'area esiste, ma i round 1-10 cambiano danni, TS, Assordato, terreno difficile e oscuramento. |
| Trasformazione | SRD 5.1 | azione ripetibile della spell assente; varianti rilevanti non modellate | Mancano la forma e i PF correnti come stato dell'istanza e l'azione che sostituisce la forma nei turni successivi rispettando i limiti RAW. |
| Trasmutare Roccia | Xanathar | varianti della zona e relativi trigger incomplete; meccanica di movimento assente; trigger spaziali o di turno assenti | Le due trasformazioni richiedono varianti distinte, costo 4x nel fango, TS al lancio/ingresso/fine turno e uscita o distruzione della roccia. |

## P2 — discrepanze ad alta confidenza

| Incantesimo | Fonte | Lacune | Evidenza/valutazione |
| --- | --- | --- | --- |
| Manto del Crociato | Legacy | testo regolamentare locale mancante | Segnalazione strutturale senza estratto testuale breve. |

## P3 — candidate da revisionare

Nessuna voce.

## Matrice completa (477 incantesimi)

| Incantesimo | ID | Fonte/Liv. | Livello Attuale | Copertura | Livello Target | Esposizione UI | Integrazione | Priorità | Lacune |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Abilità Potenziata | `xanathar-abilita-potenziata` | Xanathar / 5 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Abito Ultraterreno di Tasha | `tasha-abito-ultraterreno-di-tasha` | Tasha / 6 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Aculeo Mentale | `xanathar-aculeo-mentale` | Xanathar / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Aiuto | `aid` | SRD 5.1 / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Alba | `xanathar-alba` | Xanathar / 5 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Allarme | `alarm` | SRD 5.1 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Alleato planare | `planar-ally` | SRD 5.1 / 6 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Allucinazione di Forza | `phb2014-allucinazione-di-forza` | PHB 2014 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Allucinazione mortale | `phantasmal-killer` | SRD 5.1 / 4 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Alterare sé stesso | `alter-self` | SRD 5.1 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Amicizia | `phb2014-amicizia` | PHB 2014 / 0 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Amicizia con gli animali | `animal-friendship` | SRD 5.1 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Anatema | `bane` | SRD 5.1 / 1 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Anatema Elementale | `xanathar-anatema-elementale` | Xanathar / 4 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Animale messaggero | `animal-messenger` | SRD 5.1 / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Animare morti | `animate-dead` | SRD 5.1 / 3 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Animare oggetti | `animate-objects` | SRD 5.1 / 5 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Anti-individuazione | `nondetection` | SRD 5.1 / 3 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Antipatia/simpatia | `antipathy-sympathy` | SRD 5.1 / 8 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Arma Elementale | `phb2014-arma-elementale` | PHB 2014 / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Arma magica | `magic-weapon` | SRD 5.1 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Arma Sacra | `xanathar-arma-sacra` | Xanathar / 5 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Arma spirituale | `spiritual-weapon` | SRD 5.1 / 2 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Armatura di Agathys | `phb2014-armatura-di-agathys` | PHB 2014 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Armatura magica | `mage-armor` | SRD 5.1 / 1 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Artificio druidico | `druidcraft` | SRD 5.1 / 0 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Assorbire Elementi | `xanathar-assorbire-elementi` | Xanathar / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Aura di Purezza | `phb2014-aura-di-purezza` | PHB 2014 / 4 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Aura di Vita | `phb2014-aura-di-vita` | PHB 2014 / 4 | PARTIAL | CLOSED | PARTIAL | UNIFIED | reachable | — | — |
| Aura di Vitalità | `phb2014-aura-di-vitalita` | PHB 2014 / 3 | FULL | CLOSED | FULL | UNIFIED | reachable | — | — |
| Aura magica dell'arcanista | `arcanists-magic-aura` | SRD 5.1 / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Aura sacra | `holy-aura` | SRD 5.1 / 8 | PARTIAL | CLOSED | PARTIAL | UNIFIED | reachable | — | — |
| Bacche benefiche | `goodberry` | SRD 5.1 / 1 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Bagliore lunare | `moonbeam` | SRD 5.1 / 2 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Bagliore solare | `sunbeam` | SRD 5.1 / 6 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Banchetto degli eroi | `heroes-feast` | SRD 5.1 / 6 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Barriera di lame | `blade-barrier` | SRD 5.1 / 6 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Beffa crudele | `vicious-mockery` | SRD 5.1 / 0 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Benedizione | `bless` | SRD 5.1 / 1 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Blocca mostri | `hold-monster` | SRD 5.1 / 5 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Blocca persone | `hold-person` | SRD 5.1 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Bocca magica | `magic-mouth` | SRD 5.1 / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Boschetto Druidico | `xanathar-boschetto-druidico` | Xanathar / 6 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Braccia di Hadar | `phb2014-braccia-di-hadar` | PHB 2014 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Caduta morbida | `feather-fall` | SRD 5.1 / 1 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Calmare emozioni | `calm-emotions` | SRD 5.1 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Camminare nel vento | `wind-walk` | SRD 5.1 / 6 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Camminare sull'acqua | `water-walk` | SRD 5.1 / 3 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Campo anti-magia | `antimagic-field` | SRD 5.1 / 8 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Camuffare se stesso | `disguise-self` | SRD 5.1 / 1 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Capanna | `tiny-hut` | SRD 5.1 / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Caratteristica potenziata | `enhance-ability` | SRD 5.1 / 2 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Carne in pietra | `flesh-to-stone` | SRD 5.1 / 6 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Catapulta | `xanathar-catapulta` | Xanathar / 1 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Catena di fulmini | `chain-lightning` | SRD 5.1 / 6 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Cecità/sordità | `blindness-deafness` | SRD 5.1 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Celare | `sequester` | SRD 5.1 / 7 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Cerchio di morte | `circle-of-death` | SRD 5.1 / 6 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Cerchio di Potere | `phb2014-cerchio-di-potere` | PHB 2014 / 5 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Cerchio di teletrasporto | `teleportation-circle` | SRD 5.1 / 5 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Cerchio magico | `magic-circle` | SRD 5.1 / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Cerimonia | `xanathar-cerimonia` | Xanathar / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Charme su persone | `charm-person` | SRD 5.1 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Charme sui Mostri | `xanathar-charme-sui-mostri` | Xanathar / 4 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Chiaroveggenza | `clairvoyance` | SRD 5.1 / 3 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Clone | `clone` | SRD 5.1 / 8 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Collera della Natura | `xanathar-collera-della-natura` | Xanathar / 5 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Colpo accurato | `true-strike` | SRD 5.1 / 0 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Colpo del Vento d'Acciaio | `xanathar-colpo-del-vento-dacciaio` | Xanathar / 5 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Colpo dello Zefiro | `xanathar-colpo-dello-zefiro` | Xanathar / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Colpo infuocato | `flame-strike` | SRD 5.1 / 5 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Colpo Intrappolante | `phb2014-colpo-intrappolante` | PHB 2014 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Coltello di Ghiaccio | `xanathar-coltello-di-ghiaccio` | Xanathar / 1 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Comando | `command` | SRD 5.1 / 1 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Comprensione dei linguaggi | `comprehend-languages` | SRD 5.1 / 1 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Compulsione | `compulsion` | SRD 5.1 / 4 | PARTIAL | CLOSED | PARTIAL | UNIFIED | reachable | — | — |
| Comunione | `commune` | SRD 5.1 / 5 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Comunione con la natura | `commune-with-nature` | SRD 5.1 / 5 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Confusione | `confusion` | SRD 5.1 / 4 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Cono di freddo | `cone-of-cold` | SRD 5.1 / 5 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Conoscenza delle leggende | `legend-lore` | SRD 5.1 / 5 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Contagio | `contagion` | SRD 5.1 / 5 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Contattare altri piani | `contact-other-plane` | SRD 5.1 / 5 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Contingenza | `contingency` | SRD 5.1 / 6 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Controincantesimo | `counterspell` | SRD 5.1 / 3 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Controllare acqua | `control-water` | SRD 5.1 / 4 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Controllare Fiamme | `xanathar-controllare-fiamme` | Xanathar / 0 | MANUAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Controllare tempo atmosferico | `control-weather` | SRD 5.1 / 8 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Controllare Venti | `xanathar-controllare-venti` | Xanathar / 5 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Cordone di Frecce | `phb2014-cordone-di-frecce` | PHB 2014 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Corona di Follia | `phb2014-corona-di-follia` | PHB 2014 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Corona di Stelle | `xanathar-corona-di-stelle` | Xanathar / 7 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Costrizione | `geas` | SRD 5.1 / 5 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Creare cibo e acqua | `create-food-and-water` | SRD 5.1 / 3 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Creare Falò | `xanathar-creare-falo` | Xanathar / 0 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Creare non morti | `create-undead` | SRD 5.1 / 6 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Creare o distruggere acqua | `create-or-destroy-water` | SRD 5.1 / 1 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Creare Omuncolo | `xanathar-creare-omuncolo` | Xanathar / 6 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Creazione | `creation` | SRD 5.1 / 5 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Crescita di spine | `spike-growth` | SRD 5.1 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Crescita vegetale | `plant-growth` | SRD 5.1 / 3 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Cura ferite | `cure-wounds` | SRD 5.1 / 1 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Cura ferite di massa | `mass-cure-wounds` | SRD 5.1 / 5 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Danza irresistibile | `irresistible-dance` | SRD 5.1 / 6 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Danza Macabra | `xanathar-danza-macabra` | Xanathar / 5 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Dardo di Caos | `xanathar-dardo-di-caos` | Xanathar / 1 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Dardo di fuoco | `fire-bolt` | SRD 5.1 / 0 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Dardo incantato | `magic-missile` | SRD 5.1 / 1 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Dardo Stregato | `phb2014-dardo-stregato` | PHB 2014 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Dardo tracciante | `guiding-bolt` | SRD 5.1 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Debilitazione | `xanathar-debilitazione` | Xanathar / 5 | PARTIAL | GAP | UNREVIEWED | UNIFIED | partial | P1 | azione ripetibile della spell assente; trigger condizionale durante la durata assente |
| Deflagrazione occulta | `eldritch-blast` | SRD 5.1 / 0 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Desiderio | `wish` | SRD 5.1 / 9 | MANUAL | ACCEPTED | MANUAL | REFERENCE_ONLY | unexposed | — | — |
| Destriero fantomatico | `phantom-steed` | SRD 5.1 / 3 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Diavoletto di Polvere | `xanathar-diavoletto-di-polvere` | Xanathar / 2 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Disco fluttuante | `floating-disk` | SRD 5.1 / 1 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Disintegrazione | `disintegrate` | SRD 5.1 / 6 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Disperdere | `xanathar-disperdere` | Xanathar / 6 | MANUAL | ACCEPTED | MANUAL | REFERENCE_ONLY | unexposed | — | — |
| Dissolvi il bene e il male | `dispel-evil-and-good` | SRD 5.1 / 5 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Dissolvi magie | `dispel-magic` | SRD 5.1 / 3 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Dito della morte | `finger-of-death` | SRD 5.1 / 7 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Divinazione | `divination` | SRD 5.1 / 4 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Dominare bestie | `dominate-beast` | SRD 5.1 / 4 | PARTIAL | CLOSED | PARTIAL | UNIFIED | reachable | — | — |
| Dominare mostri | `dominate-monster` | SRD 5.1 / 8 | PARTIAL | CLOSED | PARTIAL | UNIFIED | reachable | — | — |
| Dominare persona | `dominate-person` | SRD 5.1 / 5 | PARTIAL | CLOSED | PARTIAL | UNIFIED | reachable | — | — |
| Drago Illusorio | `xanathar-drago-illusorio` | Xanathar / 8 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Duello Obbligato | `phb2014-duello-obbligato` | PHB 2014 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Eroismo | `heroism` | SRD 5.1 / 1 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Eruzione Terrestre | `xanathar-eruzione-terrestre` | Xanathar / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Esilio | `banishment` | SRD 5.1 / 4 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Esplosione solare | `sunburst` | SRD 5.1 / 8 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Estasiare | `enthrall` | SRD 5.1 / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Evoca Aberrazione | `tasha-evoca-aberrazione` | Tasha / 4 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Evoca animali | `conjure-animals` | SRD 5.1 / 3 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Evoca Bestia d'Ombra | `tasha-evoca-bestia-dombra` | Tasha / 3 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Evoca celestiale | `conjure-celestial` | SRD 5.1 / 7 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Evoca Celestiale | `tasha-evoca-celestiale` | Tasha / 5 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Evoca Costrutto | `tasha-evoca-costrutto` | Tasha / 4 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Evoca creature boschive | `conjure-woodland-beings` | SRD 5.1 / 4 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Evoca Demone Maggiore | `xanathar-evoca-demone-maggiore` | Xanathar / 4 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Evoca Demoni Minori | `xanathar-evoca-demoni-minori` | Xanathar / 3 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Evoca elementale | `conjure-elemental` | SRD 5.1 / 5 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Evoca Elementale | `tasha-evoca-elementale` | Tasha / 4 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Evoca elementali minori | `conjure-minor-elementals` | SRD 5.1 / 4 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Evoca folletto | `conjure-fey` | SRD 5.1 / 6 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Evoca Folletto | `tasha-evoca-folletto` | Tasha / 3 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Evoca Immondo | `tasha-evoca-immondo` | Tasha / 6 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Evoca Non Morto | `tasha-evoca-non-morto` | Tasha / 3 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Evoca Pioggia di Armi | `phb2014-evoca-pioggia-di-armi` | PHB 2014 / 5 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Evoca Raffica | `phb2014-evoca-raffica` | PHB 2014 / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Evocare Bestia | `tasha-evocare-bestia` | Tasha / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Evocazione istantanea | `instant-summons` | SRD 5.1 / 6 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Fabbricare | `fabricate` | SRD 5.1 / 4 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Fame di Hadar | `phb2014-fame-di-hadar` | PHB 2014 / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Faretra Rapida | `phb2014-faretra-rapida` | PHB 2014 / 5 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Faro di speranza | `beacon-of-hope` | SRD 5.1 / 3 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Fatale | `weird` | SRD 5.1 / 9 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Favore divino | `divine-favor` | SRD 5.1 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Ferire | `harm` | SRD 5.1 / 6 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Fermare il tempo | `time-stop` | SRD 5.1 / 9 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Ferocia Primordiale | `xanathar-ferocia-primordiale` | Xanathar / 0 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Fiamma perenne | `continual-flame` | SRD 5.1 / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Fiamma sacra | `sacred-flame` | SRD 5.1 / 0 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Fiotto acido | `acid-splash` | SRD 5.1 / 0 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Flusso di Energia Negativa | `xanathar-flusso-di-energia-negativa` | Xanathar / 5 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Folata | `xanathar-folata` | Xanathar / 0 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Folata di vento | `gust-of-wind` | SRD 5.1 / 2 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Fondersi nella pietra | `meld-into-stone` | SRD 5.1 / 3 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Forma eterea | `etherealness` | SRD 5.1 / 7 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Forma gassosa | `gaseous-form` | SRD 5.1 / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Forme animali | `animal-shapes` | SRD 5.1 / 8 | TRACK_ONLY | GAP | UNREVIEWED | UNIFIED | partial | P1 | azione ripetibile della spell assente; varianti rilevanti non modellate |
| Fortezza della Mente | `tasha-fortezza-della-mente` | Tasha / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Fortezza Possente | `xanathar-fortezza-possente` | Xanathar / 8 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Frantumare | `shatter` | SRD 5.1 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Frecce Infuocate | `xanathar-frecce-infuocate` | Xanathar / 3 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Freccia acida | `acid-arrow` | SRD 5.1 / 2 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Freccia Folgorante | `phb2014-freccia-folgorante` | PHB 2014 / 3 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Frusta di Spine | `phb2014-frusta-di-spine` | PHB 2014 / 0 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Fulgore Nauseante | `xanathar-fulgore-nauseante` | Xanathar / 4 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Fulmine | `lightning-bolt` | SRD 5.1 / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Fuorviare | `mislead` | SRD 5.1 / 5 | TRACK_ONLY | GAP | UNREVIEWED | UNIFIED | partial | P1 | condizione o stato RAW non rappresentato; azione ripetibile della spell assente |
| Gabbia dell'Anima | `xanathar-gabbia-dellanima` | Xanathar / 6 | TRACK_ONLY | ACCEPTED | TRACK_ONLY | UNIFIED | reachable | — | — |
| Gabbia di forza | `forcecage` | SRD 5.1 / 7 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Giara magica | `magic-jar` | SRD 5.1 / 6 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Glifo di interdizione | `glyph-of-warding` | SRD 5.1 / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Globo Cromatico | `phb2014-globo-cromatico` | PHB 2014 / 1 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Globo di invulnerabilità | `globe-of-invulnerability` | SRD 5.1 / 6 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Guardiani spirituali | `spirit-guardians` | SRD 5.1 / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Guardiano della fede | `guardian-of-faith` | SRD 5.1 / 4 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Guardiano della Natura | `xanathar-guardiano-della-natura` | Xanathar / 4 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Guarigione | `heal` | SRD 5.1 / 6 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Guarigione di massa | `mass-heal` | SRD 5.1 / 9 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Guida | `guidance` | SRD 5.1 / 0 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Guscio anti-vita | `antilife-shell` | SRD 5.1 / 5 | PARTIAL | CLOSED | PARTIAL | UNIFIED | reachable | — | — |
| Identificare | `identify` | SRD 5.1 / 1 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Illusione minore | `minor-illusion` | SRD 5.1 / 0 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Illusione programmata | `programmed-illusion` | SRD 5.1 / 6 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Immagine maggiore | `major-image` | SRD 5.1 / 3 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Immagine proiettata | `project-image` | SRD 5.1 / 7 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Immagine silenziosa | `silent-image` | SRD 5.1 / 1 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Immagine speculare | `mirror-image` | SRD 5.1 / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Immolazione | `xanathar-immolazione` | Xanathar / 5 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Imprigionare | `imprisonment` | SRD 5.1 / 9 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Inaridire | `blight` | SRD 5.1 / 4 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Incuti Paura | `xanathar-incuti-paura` | Xanathar / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Individuazione dei pensieri | `detect-thoughts` | SRD 5.1 / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Individuazione del bene e del male | `detect-evil-and-good` | SRD 5.1 / 1 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Individuazione del magico | `detect-magic` | SRD 5.1 / 1 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Individuazione delle malattie e dei veleni | `detect-poison-and-disease` | SRD 5.1 / 1 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Infestazione | `xanathar-infestazione` | Xanathar / 0 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Infliggi ferite | `inflict-wounds` | SRD 5.1 / 1 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Ingrandire/ridurre | `enlarge-reduce` | SRD 5.1 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Insetto gigante | `giant-insect` | SRD 5.1 / 4 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Interdizione alla morte | `death-ward` | SRD 5.1 / 4 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Interdizione alle Lame | `phb2014-interdizione-alle-lame` | PHB 2014 / 0 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Interdizione Primordiale | `xanathar-interdizione-primordiale` | Xanathar / 6 | PARTIAL | GAP | UNREVIEWED | UNIFIED | partial | P1 | trigger condizionale durante la durata assente; conseguenza alla fine della spell assente |
| Intermittenza | `blink` | SRD 5.1 / 3 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Intimorire infernale | `hellish-rebuke` | SRD 5.1 / 1 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Intralciare | `entangle` | SRD 5.1 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Inversione della gravità | `reverse-gravity` | SRD 5.1 / 7 | PARTIAL | GAP | UNREVIEWED | UNIFIED | partial | P1 | ingresso, sospensione e caduta finale non risolti; trigger spaziali o di turno assenti |
| Investitura del Ghiaccio | `xanathar-investitura-del-ghiaccio` | Xanathar / 6 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Investitura del Vento | `xanathar-investitura-del-vento` | Xanathar / 6 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Investitura della Fiamma | `xanathar-investitura-della-fiamma` | Xanathar / 6 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Investitura della Pietra | `xanathar-investitura-della-pietra` | Xanathar / 6 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Inviare | `sending` | SRD 5.1 / 3 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Invisibilità | `invisibility` | SRD 5.1 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Invisibilità superiore | `greater-invisibility` | SRD 5.1 / 4 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Invocare il fulmine | `call-lightning` | SRD 5.1 / 3 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Invulnerabilità | `xanathar-invulnerabilita` | Xanathar / 9 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Labirinto | `maze` | SRD 5.1 / 8 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Lama d'Ombra | `xanathar-lama-dombra` | Xanathar / 2 | TRACK_ONLY | CLOSED | TRACK_ONLY | UNIFIED | reachable | — | — |
| Lama del Disastro | `tasha-lama-del-disastro` | Tasha / 9 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Lama infuocata | `flame-blade` | SRD 5.1 / 2 | TRACK_ONLY | CLOSED | TRACK_ONLY | UNIFIED | reachable | — | — |
| Lama Roboante | `tasha-lama-roboante` | Tasha / 0 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Lama Verdefiamma | `tasha-lama-verdefiamma` | Tasha / 0 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Legame con le Bestie | `xanathar-legame-con-le-bestie` | Xanathar / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Legame planare | `planar-binding` | SRD 5.1 / 5 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Legame telepatico | `telepathic-bond` | SRD 5.1 / 5 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Lentezza | `slow` | SRD 5.1 / 3 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Lenza Elettrizzante | `tasha-lenza-elettrizzante` | Tasha / 0 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Levitazione | `levitate` | SRD 5.1 / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Libertà di movimento | `freedom-of-movement` | SRD 5.1 / 4 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Linguaggi | `tongues` | SRD 5.1 / 3 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Localizza animali o vegetali | `locate-animals-or-plants` | SRD 5.1 / 2 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Localizza creatura | `locate-creature` | SRD 5.1 / 4 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Localizza oggetto | `locate-object` | SRD 5.1 / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Loquacità | `glibness` | SRD 5.1 / 8 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Luce | `light` | SRD 5.1 / 0 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Luce diurna | `daylight` | SRD 5.1 / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Luci danzanti | `dancing-lights` | SRD 5.1 / 0 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Luminescenza | `faerie-fire` | SRD 5.1 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Maelstrom | `xanathar-maelstrom` | Xanathar / 5 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Mani brucianti | `burning-hands` | SRD 5.1 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Mano arcana | `arcane-hand` | SRD 5.1 / 5 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Mano magica | `mage-hand` | SRD 5.1 / 0 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Manto del Crociato | `legacy-crusaders-mantle` | Legacy / 3 | TRACK_ONLY | GAP | UNREVIEWED | UNIFIED | partial | P2 | testo regolamentare locale mancante |
| Marchio del cacciatore | `hunters-mark` | SRD 5.1 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Messaggio | `message` | SRD 5.1 / 0 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Metamorfosi | `polymorph` | SRD 5.1 / 4 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Metamorfosi di Massa | `xanathar-metamorfosi-di-massa` | Xanathar / 9 | TRACK_ONLY | ACCEPTED | MANUAL | UNIFIED | reachable | — | — |
| Metamorfosi pura | `true-polymorph` | SRD 5.1 / 9 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Minuscole Meteore di Melf | `xanathar-minuscole-meteore-di-melf` | Xanathar / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Miraggio arcano | `mirage-arcane` | SRD 5.1 / 7 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Miscela Caustica di Tasha | `tasha-miscela-caustica-di-tasha` | Tasha / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Modellare Acqua | `xanathar-modellare-acqua` | Xanathar / 0 | MANUAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Modellare Terra | `xanathar-modellare-terra` | Xanathar / 0 | MANUAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Modificare memoria | `modify-memory` | SRD 5.1 / 5 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Morsa del Gelo | `xanathar-morsa-del-gelo` | Xanathar / 0 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Morte Apparente | `phb2014-morte-apparente` | PHB 2014 / 3 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Movimenti del ragno | `spider-climb` | SRD 5.1 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Muovere il terreno | `move-earth` | SRD 5.1 / 6 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Muro d'Acqua | `xanathar-muro-dacqua` | Xanathar / 3 | TRACK_ONLY | GAP | UNREVIEWED | UNIFIED | partial | P1 | meccanica di movimento assente; trigger condizionale durante la durata assente |
| Muro di forza | `wall-of-force` | SRD 5.1 / 5 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Muro di fuoco | `wall-of-fire` | SRD 5.1 / 4 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Muro di ghiaccio | `wall-of-ice` | SRD 5.1 / 6 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Muro di Luce | `xanathar-muro-di-luce` | Xanathar / 5 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Muro di pietra | `wall-of-stone` | SRD 5.1 / 5 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Muro di Sabbia | `xanathar-muro-di-sabbia` | Xanathar / 3 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Muro di spine | `wall-of-thorns` | SRD 5.1 / 6 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Muro di vento | `wind-wall` | SRD 5.1 / 3 | PARTIAL | ACCEPTED | PARTIAL | UNIFIED | reachable | — | — |
| Muro prismatico | `prismatic-wall` | SRD 5.1 / 9 | PARTIAL | ACCEPTED | PARTIAL | UNIFIED | reachable | — | — |
| Nemici in Abbondanza | `xanathar-nemici-in-abbondanza` | Xanathar / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Nube di nebbia | `fog-cloud` | SRD 5.1 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Nube di Pugnali | `phb2014-nube-di-pugnali` | PHB 2014 / 2 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Nube incendiaria | `incendiary-cloud` | SRD 5.1 / 8 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Nube maleodorante | `stinking-cloud` | SRD 5.1 / 3 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Nube mortale | `cloudkill` | SRD 5.1 / 5 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Occhio arcano | `arcane-eye` | SRD 5.1 / 4 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Ombra di Moil | `xanathar-ombra-di-moil` | Xanathar / 4 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Onda di Marea | `xanathar-onda-di-marea` | Xanathar / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Onda Distruttiva | `phb2014-onda-distruttiva` | PHB 2014 / 5 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Onda tonante | `thunderwave` | SRD 5.1 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Orrido Avvizzimento di Abi-Dalzim | `xanathar-orrido-avvizzimento-di-abi-dalzim` | Xanathar / 8 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Oscurità | `darkness` | SRD 5.1 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Oscurità della Follia | `xanathar-oscurita-della-follia` | Xanathar / 8 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Ossa della Terra | `xanathar-ossa-della-terra` | Xanathar / 6 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Palla di fuoco | `fireball` | SRD 5.1 / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Palla di fuoco ritardata | `delayed-blast-fireball` | SRD 5.1 / 7 | PARTIAL | CLOSED | PARTIAL | UNIFIED | reachable | — | — |
| Parlare con gli animali | `speak-with-animals` | SRD 5.1 / 1 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Parlare con i morti | `speak-with-dead` | SRD 5.1 / 3 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Parlare con i vegetali | `speak-with-plants` | SRD 5.1 / 3 | PARTIAL | GAP | UNREVIEWED | UNIFIED | partial | P1 | meccanica di movimento assente; varianti rilevanti non modellate |
| Parola del Potere Dolore | `xanathar-parola-del-potere-dolore` | Xanathar / 7 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Parola del Potere Guarire | `phb2014-parola-del-potere-guarire` | PHB 2014 / 9 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Parola del potere stordire | `power-word-stun` | SRD 5.1 / 8 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Parola del potere uccidere | `power-word-kill` | SRD 5.1 / 9 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Parola del ritiro | `word-of-recall` | SRD 5.1 / 6 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Parola divina | `divine-word` | SRD 5.1 / 7 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Parola guaritrice | `healing-word` | SRD 5.1 / 1 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Parola guaritrice di massa | `mass-healing-word` | SRD 5.1 / 3 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Parola Radiosa | `xanathar-parola-radiosa` | Xanathar / 0 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Passapareti | `passwall` | SRD 5.1 / 5 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Passare senza tracce | `pass-without-trace` | SRD 5.1 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Passo del Tuono | `xanathar-passo-del-tuono` | Xanathar / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Passo Remoto | `xanathar-passo-remoto` | Xanathar / 5 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Passo velato | `misty-step` | SRD 5.1 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Passo veloce | `longstrider` | SRD 5.1 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Paura | `fear` | SRD 5.1 / 3 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Pelle coriacea | `barkskin` | SRD 5.1 / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Pelle di pietra | `stoneskin` | SRD 5.1 / 4 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Percezione delle Bestie | `phb2014-percezione-delle-bestie` | PHB 2014 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Piaga degli insetti | `insect-plague` | SRD 5.1 / 5 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Pietra Magica | `xanathar-pietra-magica` | Xanathar / 0 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Pirotecnica | `xanathar-pirotecnica` | Xanathar / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Porta dimensionale | `dimension-door` | SRD 5.1 / 4 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Portale | `gate` | SRD 5.1 / 9 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Portale Arcano | `phb2014-portale-arcano` | PHB 2014 / 6 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Preghiera di guarigione | `prayer-of-healing` | SRD 5.1 / 2 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Presagio | `augury` | SRD 5.1 / 2 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Prestidigitazione | `prestidigitation` | SRD 5.1 / 0 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Previsione | `foresight` | SRD 5.1 / 9 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Prigione Mentale | `xanathar-prigione-mentale` | Xanathar / 6 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Produrre fiamma | `produce-flame` | SRD 5.1 / 0 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Proibizione | `forbiddance` | SRD 5.1 / 6 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Proiezione astrale | `astral-projection` | SRD 5.1 / 9 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Protezione dai veleni | `protection-from-poison` | SRD 5.1 / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Protezione dal bene e dal male | `protection-from-evil-and-good` | SRD 5.1 / 1 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Protezione dall'energia | `protection-from-energy` | SRD 5.1 / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Punizione Accecante | `phb2014-punizione-accecante` | PHB 2014 / 3 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Punizione Collerica | `phb2014-punizione-collerica` | PHB 2014 / 1 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Punizione Demoralizzante | `phb2014-punizione-demoralizzante` | PHB 2014 / 4 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Punizione Esiliante | `phb2014-punizione-esiliante` | PHB 2014 / 5 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Punizione Incandescente | `phb2014-punizione-incandescente` | PHB 2014 / 1 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Punizione Marchiante | `branding-smite` | SRD 5.1 / 2 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Punizione Tonante | `phb2014-punizione-tonante` | PHB 2014 / 1 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Purificare cibo e bevande | `purify-food-and-drink` | SRD 5.1 / 1 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Raffica di Spine | `phb2014-raffica-di-spine` | PHB 2014 / 1 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Raggio di affaticamento | `ray-of-enfeeblement` | SRD 5.1 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Raggio di gelo | `ray-of-frost` | SRD 5.1 / 0 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Raggio di Infermità | `phb2014-raggio-di-infermita` | PHB 2014 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Raggio rovente | `scorching-ray` | SRD 5.1 / 2 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Ragnatela | `web` | SRD 5.1 / 2 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Rampicante Afferrante | `phb2014-rampicante-afferrante` | PHB 2014 / 4 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Randello incantato | `shillelagh` | SRD 5.1 / 0 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Reggia meravigliosa | `magnificent-mansion` | SRD 5.1 / 7 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Regressione mentale | `feeblemind` | SRD 5.1 / 8 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Reincarnazione | `reincarnate` | SRD 5.1 / 5 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Resistenza | `resistance` | SRD 5.1 / 0 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Respirare sott'acqua | `water-breathing` | SRD 5.1 / 3 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Resurrezione | `resurrection` | SRD 5.1 / 7 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Resurrezione pura | `true-resurrection` | SRD 5.1 / 9 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Rianimare morti | `raise-dead` | SRD 5.1 / 5 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Richiamo Infernale | `xanathar-richiamo-infernale` | Xanathar / 5 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Rigenerazione | `regenerate` | SRD 5.1 / 7 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Rimuovi maledizione | `remove-curse` | SRD 5.1 / 3 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Rinascita | `revivify` | SRD 5.1 / 3 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Rintocco dei Morti | `xanathar-rintocco-dei-morti` | Xanathar / 0 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Riparare | `mending` | SRD 5.1 / 0 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Riposo inviolato | `gentle-repose` | SRD 5.1 / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Risata incontenibile | `hideous-laughter` | SRD 5.1 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Riscaldare il metallo | `heat-metal` | SRD 5.1 / 2 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Ristorare inferiore | `lesser-restoration` | SRD 5.1 / 2 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Ristorare superiore | `greater-restoration` | SRD 5.1 / 5 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Risveglio | `awaken` | SRD 5.1 / 5 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Ritirata rapida | `expeditious-retreat` | SRD 5.1 / 1 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Rombo di Tuono | `xanathar-rombo-di-tuono` | Xanathar / 0 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Saltare | `jump` | SRD 5.1 / 1 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Salvare i morenti | `spare-the-dying` | SRD 5.1 / 0 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Santificare | `hallow` | SRD 5.1 / 5 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Santuario | `sanctuary` | SRD 5.1 / 1 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Santuario privato | `private-sanctum` | SRD 5.1 / 4 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Scagliare maledizione | `bestow-curse` | SRD 5.1 / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Scassinare | `knock` | SRD 5.1 / 2 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Scheggia della Mente | `tasha-scheggia-della-mente` | Tasha / 0 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Sciame di meteore | `meteor-swarm` | SRD 5.1 / 9 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Sciame di Palle di Neve di Snilloc | `xanathar-sciame-di-palle-di-neve-di-snilloc` | Xanathar / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Scolpire pietra | `stone-shape` | SRD 5.1 / 4 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Scopri il percorso | `find-the-path` | SRD 5.1 / 6 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Scopri trappole | `find-traps` | SRD 5.1 / 2 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Scossa Sinaptica | `xanathar-scossa-sinaptica` | Xanathar / 5 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Scossa Tellurica | `xanathar-scossa-tellurica` | Xanathar / 1 | PARTIAL | CLOSED | PARTIAL | UNIFIED | reachable | — | — |
| Scrigno segreto | `secret-chest` | SRD 5.1 / 4 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Scritta Celeste | `xanathar-scritta-celeste` | Xanathar / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Scritto illusorio | `illusory-script` | SRD 5.1 / 1 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Scrutare | `scrying` | SRD 5.1 / 5 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Scudiscio Mentale di Tasha | `legacy-tashas-mind-whip` | Legacy / 2 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Scudo | `shield` | SRD 5.1 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Scudo della fede | `shield-of-faith` | SRD 5.1 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Scudo di fuoco | `fire-shield` | SRD 5.1 / 4 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Scurovisione | `darkvision` | SRD 5.1 / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Segugio fedele | `faithful-hound` | SRD 5.1 / 4 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Sembrare | `seeming` | SRD 5.1 / 5 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Semipiano | `demiplane` | SRD 5.1 / 8 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Serratura arcana | `arcane-lock` | SRD 5.1 / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Servitore inosservato | `unseen-servant` | SRD 5.1 / 1 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Servitore Minuscolo | `xanathar-servitore-minuscolo` | Xanathar / 3 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Sfera Acquea | `xanathar-sfera-acquea` | Xanathar / 4 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Sfera al Vetriolo | `xanathar-sfera-al-vetriolo` | Xanathar / 4 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Sfera congelante | `freezing-sphere` | SRD 5.1 / 6 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Sfera della Tempesta | `xanathar-sfera-della-tempesta` | Xanathar / 4 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Sfera elastica | `resilient-sphere` | SRD 5.1 / 4 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Sfera infuocata | `flaming-sphere` | SRD 5.1 / 2 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Sfocatura | `blur` | SRD 5.1 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Sguardo penetrante | `eyebite` | SRD 5.1 / 6 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Silenzio | `silence` | SRD 5.1 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Simbolo | `symbol` | SRD 5.1 / 7 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Simulacro | `simulacrum` | SRD 5.1 / 7 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Soffio del Drago | `xanathar-soffio-del-drago` | Xanathar / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Sogno | `dream` | SRD 5.1 / 5 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Sogno del Velo Celeste | `tasha-sogno-del-velo-celeste` | Tasha / 7 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Sonnellino | `xanathar-sonnellino` | Xanathar / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Sonno | `sleep` | SRD 5.1 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Sortilegio | `phb2014-sortilegio` | PHB 2014 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Spada arcana | `arcane-sword` | SRD 5.1 / 7 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Spirito Guaritore | `xanathar-spirito-guaritore` | Xanathar / 2 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Spostamento planare | `plane-shift` | SRD 5.1 / 7 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Spruzzo colorato | `color-spray` | SRD 5.1 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Spruzzo prismatico | `prismatic-spray` | SRD 5.1 / 7 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Spruzzo velenoso | `poison-spray` | SRD 5.1 / 0 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Stretta della Terra di Maximilian | `xanathar-stretta-della-terra-di-maximilian` | Xanathar / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Stretta folgorante | `shocking-grasp` | SRD 5.1 / 0 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Sudario Spirituale | `tasha-sudario-spirituale` | Tasha / 3 | PARTIAL | CLOSED | PARTIAL | UNIFIED | reachable | — | — |
| Suggestione | `suggestion` | SRD 5.1 / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Suggestione di massa | `mass-suggestion` | SRD 5.1 / 6 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Sussurri Dissonanti | `phb2014-sussurri-dissonanti` | PHB 2014 / 1 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Taumaturgia | `thaumaturgy` | SRD 5.1 / 0 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Telecinesi | `telekinesis` | SRD 5.1 / 5 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Telepatia | `phb2014-telepatia` | PHB 2014 / 8 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Teletrasporto | `teleport` | SRD 5.1 / 7 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Tempesta di fuoco | `fire-storm` | SRD 5.1 / 7 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Tempesta di ghiaccio | `ice-storm` | SRD 5.1 / 4 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Tempesta di nevischio | `sleet-storm` | SRD 5.1 / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Tempesta di vendetta | `storm-of-vengeance` | SRD 5.1 / 9 | PARTIAL | GAP | UNREVIEWED | UNIFIED | partial | P1 | progressione degli effetti per round assente; condizione o stato RAW non rappresentato; meccanica di movimento assente |
| Tempio degli Dèi | `xanathar-tempio-degli-dei` | Xanathar / 7 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Tentacoli neri | `black-tentacles` | SRD 5.1 / 4 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Terremoto | `earthquake` | SRD 5.1 / 8 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Terreno illusorio | `hallucinatory-terrain` | SRD 5.1 / 4 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Tocco del vampiro | `vampiric-touch` | SRD 5.1 / 3 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Tocco gelido | `chill-touch` | SRD 5.1 / 0 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Trabocchetto | `xanathar-trabocchetto` | Xanathar / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Trama ipnotica | `hypnotic-pattern` | SRD 5.1 / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Trasferimento di Vita | `xanathar-trasferimento-di-vita` | Xanathar / 3 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Trasformazione | `shapechange` | SRD 5.1 / 9 | TRACK_ONLY | GAP | UNREVIEWED | UNIFIED | partial | P1 | azione ripetibile della spell assente; varianti rilevanti non modellate |
| Trasformazione di Tenser | `xanathar-trasformazione-di-tenser` | Xanathar / 6 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Traslazione arborea | `tree-stride` | SRD 5.1 / 5 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Trasmutare Roccia | `xanathar-trasmutare-roccia` | Xanathar / 5 | PARTIAL | GAP | UNREVIEWED | UNIFIED | partial | P1 | varianti della zona e relativi trigger incomplete; meccanica di movimento assente; trigger spaziali o di turno assenti |
| Trasporto vegetale | `transport-via-plants` | SRD 5.1 / 6 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Trova cavalcatura | `find-steed` | SRD 5.1 / 2 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Trova Cavalcatura Superiore | `xanathar-trova-cavalcatura-superiore` | Xanathar / 4 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Trova famiglio | `find-familiar` | SRD 5.1 / 1 | MANUAL | UNREVIEWED | UNREVIEWED | REFERENCE_ONLY | unexposed | — | — |
| Trucco della corda | `rope-trick` | SRD 5.1 / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Tsunami | `phb2014-tsunami` | PHB 2014 / 8 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Turbine | `xanathar-turbine` | Xanathar / 7 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Turbine di Spade | `tasha-turbine-di-spade` | Tasha / 0 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Unto | `grease` | SRD 5.1 / 1 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Urlo Psichico | `xanathar-urlo-psichico` | Xanathar / 9 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Vampa di Aganazzar | `xanathar-vampa-di-aganazzar` | Xanathar / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Vedere invisibilità | `see-invisibility` | SRD 5.1 / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Velocità | `haste` | SRD 5.1 / 3 | FULL | ACCEPTED | FULL | UNIFIED | reachable | — | — |
| Vento di Interdizione | `xanathar-vento-di-interdizione` | Xanathar / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Vigilanza e interdizione | `guards-and-wards` | SRD 5.1 / 6 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Vincolo della Terra | `xanathar-vincolo-della-terra` | Xanathar / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Vincolo di interdizione | `warding-bond` | SRD 5.1 / 2 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Visione del vero | `true-seeing` | SRD 5.1 / 6 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Vita falsata | `false-life` | SRD 5.1 / 1 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Volare | `fly` | SRD 5.1 / 3 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Vuoto mentale | `mind-blank` | SRD 5.1 / 8 | TRACK_ONLY | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |
| Zona di verità | `zone-of-truth` | SRD 5.1 / 2 | PARTIAL | UNREVIEWED | UNREVIEWED | UNIFIED | reachable | — | — |

## Dati macchina

La versione completa con condizioni rilevate, ID delle regole, trigger ed estratti di evidenza è in `data/spell-automation-audit.json`.


# Piano di automazione degli incantesimi

Verifica del **22 ottobre 2026**, sul codice dopo il libro degli incantesimi e
gli slot (commit `932c079`) e con la registrazione dei lanci descritta nella
sezione 2. Riparte dall'[audit del 14 settembre](AUDIT_AUTOMAZIONE_INCANTESIMI.md)
e dalla sua [matrice semantica](../data/spell-implementation-status.json),
li aggiorna con il lavoro di ottobre e risponde a due domande:

1. quali incantesimi del catalogo il plugin può ancora automatizzare, e come;
2. come registrare l'uso di **qualunque** incantesimo nel sistema a slot,
   anche di quelli che non si automatizzano.

La seconda è risolta (sezione 2). La prima è un piano a lotti: i lotti L1–L4
sono fatti (sezioni 5.1 e 5.2), L5+ procede una capacità per volta (sezione 5.3,
CAP-LINK fatta). Chi lavora a
un lotto parte dalle note pratiche della sezione 8.

Il perimetro è quello di sempre: un **tracker assistito**. Dadi, linea di
vista, immunità finali e decisioni narrative restano al tavolo; il plugin
registra, propone i dadi, applica danni, cure, condizioni e durate che il GM
conferma.

## 1. In breve

| Categoria | Incantesimi | Che cosa fa oggi il plugin |
| --- | ---: | --- |
| Automatizzati | 255 | Lancio e risoluzione assistiti: pannello, console ad area o console attacchi. |
| Tracciati, nessuna automazione utile | 112 | Pill con durata e concentrazione; informazioni, evocazioni e ambiente al tavolo. |
| Solo registrazione, nessuna automazione utile | 32 | Istantanei di utilità: lo slot e il registro di combattimento. |
| **Pronti: bastano i dati** | **0** | Si lanciano e registrano; l'automazione richiede soltanto dati e test. |
| **Dopo una capacità condivisa** | **65** | Si lanciano e registrano; serve prima una capacità del motore. |
| Su misura | 11 | Si lanciano e registrano; lo stato è troppo specifico per un'automazione generica. |
| Da verificare | 2 | Testo o perimetro delle regole mancanti. |
| **Totale** | **477** | **Tutti lanciabili dal libro, dalle azioni rapide e dal pannello, con il loro slot.** |

Il lavoro di automazione residuo è di **76 incantesimi** (65 + 11) più i 2 da
verificare, contro i 152 di settembre: nel frattempo la console attacchi ha
chiuso 17 trucchetti, Prigione Mentale è stata completata, i lotti L1–L4
hanno chiuso altri 50 incantesimi e CAP-LINK altri 8.

Ordine consigliato, dal più sicuro al più costoso:

| Lotto | Incantesimi | Contenuto | Tocca i PF |
| --- | ---: | --- | --- |
| L1 ✓ | 17 | Benefici passivi e un'aura (fatto il 22 ottobre) | Solo le difese di 3 incantesimi, nelle console attacchi e boss |
| L2 ✓ | 14 | Cure, TS con danno, condizioni che finiscono al danno, TS ripetuti (fatto il 22 ottobre) | Sì, dal comando ad area esistente |
| L3 ✓ | 12 | Zone e aree persistenti, due azioni ad area ripetibili (fatto il 22 ottobre) | Sì, dai percorsi di zona e azioni attive esistenti |
| L4 ✓ | 7 | Incantesimi d'attacco nella console attacchi, con il loro slot (fatto il 22 ottobre) | Sì, dalla console attacchi; Tocco del vampiro cura il caster |
| L5+ | 65 | Una capacità condivisa per volta (sezione 5.3); CAP-LINK fatta il 22 ottobre | Spesso |

## 2. Registrare il lancio di qualunque incantesimo (fatto)

Fino al 21 ottobre 84 incantesimi non si potevano lanciare: il libro li
mostrava come «Solo riferimento» e il pannello li escludeva. Erano gli
istantanei senza area né tracciamento: Controincantesimo, Cura ferite,
Desiderio, Dardo incantato, Rinascita, Identificare… Per loro lo slot si
scalava soltanto a mano dai pallini.

Ora **ogni incantesimo del catalogo si lancia** dalla scheda, dal menu 🪄
della card, dalle azioni rapide ⚡ e dal pannello incantesimi. Per quelli che
il plugin non automatizza (75 dopo il lotto L2) il lancio è una
**registrazione**:

- un solo comando spende ciò che il lancio costa (lo slot del livello
  scelto, la Magia del Patto al suo livello, un uso dell'azione rapida), con
  la sua voce in History e il suo Undo;
- il registro di combattimento mostra «Incantesimo: X», il livello dello
  slot, **Speso: slot di N° livello** ed **Effetti: risolti al tavolo**;
- nessuna pill fittizia sui bersagli; i bersagli sono facoltativi e, se il
  GM ne seleziona, finiscono nel registro con il loro nome;
- un lancio che non spende nulla (trucchetto, mostro senza classi,
  **Senza slot** per un rituale) non cambia nulla e non ha voce History:
  va soltanto nel registro di combattimento;
- se l'incantesimo ha un'animazione Embers, ne parte la parte istantanea.

Dalla scheda il pulsante registra subito (slot del livello base, bersagli
selezionati); ⚙ apre il pannello per scegliere lo slot superiore, il Patto o
**Senza slot** e i bersagli: il pulsante si chiama **Registra lancio**. Dal
menu 🪄 un lancio registrato mostra un avviso con lo slot speso, perché sulla
mappa non cambia nulla. Un trucchetto d'attacco (Dardo di fuoco…) apre la
console attacchi quando la card ha un'azione Trucchetto, come già faceva la
scheda; altrimenti se ne registra il lancio.

Anche i lanci automatizzati guadagnano qualcosa: la causalità di ogni lancio
(pannello, console ad area, azioni rapide) riporta ciò che ha speso, e i lanci
ad area riportano il livello dello slot, che prima mancava. Nel pannello,
«Spendi: Patto» lancia ora l'incantesimo al livello dello slot del Patto,
come già facevano le azioni rapide.

Dove sta nel codice:

- `isSpellCastRecordOnly` e `getRecordOnlySpellOptions` in
  `src/spells-srd.js`: sono gli incantesimi né tracciati né risolti dal
  comando ad area (popover o set delle cure); quando un lotto ne automatizza
  uno (per esempio Cura ferite nel set delle cure) esce da solo dalla
  registrazione;
- `src/spellCastRecordCore.js` (puro) e `src/spellCastRecord.js`: causalità,
  comando e scrittura nel registro; `executeSpellApplication` vi delega quando
  la richiesta è `recordOnly`, quindi il compositore di buff continua a
  creare le sue pill;
- il contratto del pannello (`execution.recordOnly`, bersagli facoltativi,
  «Registra lancio»), il piano delle azioni rapide e il catalogo del pannello
  (terza fonte `cast-record`);
- test: `test/spellCastRecord.test.js`, i casi reali con coordinatore,
  History, Undo e registro in `test/spellSlotSpendUndo.test.js`, il pannello
  in `test/spellUnifiedPanelController.test.js`.

## 3. Che cosa è cambiato dal 14 settembre

- **Il blocco sugli attacchi è risolto.** L'audit segnalava che
  `getSpellAttackResolution` aggiungeva il danno differito di Freccia acida a
  Tocco gelido, Raggio di gelo e Dardo tracciante: ora il rider appartiene
  soltanto a Freccia acida (`src/spellAttackResolutionCore.js`). Gli
  incantesimi d'attacco non sono più bloccati.
- **La console attacchi dei PG** registra 25 trucchetti con tiro per colpire,
  TS, arma o area, scalati sul livello del personaggio, con le pill dal
  catalogo incantesimi. Ne chiude 17 che l'audit dava incompleti: Fiotto
  acido, Tocco gelido, Deflagrazione occulta, Dardo di fuoco, Spruzzo
  velenoso, Produrre fiamma, Raggio di gelo, Fiamma sacra, Stretta folgorante,
  Beffa crudele, Ferocia Primordiale, Infestazione, Morsa del Gelo, Rintocco
  dei Morti, Lama Verdefiamma, Lenza Elettrizzante, Frusta di Spine. Lama
  Roboante resta parziale: manca l'avviso automatico quando il bersaglio si
  muove.
- **Prigione Mentale** è completa: TS, 5d10 psichici, pill dei sensi e
  risoluzione dell'attraversamento da 10d10.
- **Slot**: scheda, pallini, riposi, Fonte di Magia, Punizioni e costo delle
  azioni rapide (fasi 2a–2e). La registrazione della sezione 2 li estende a
  tutto il catalogo.

Le altre classificazioni dell'audit restano valide e sono riprese qui.

## 4. Come leggere le categorie

- **Pronti: bastano i dati.** La primitiva esiste e un incantesimo simile la
  usa già; servono dati nei registri del catalogo e test di famiglia.
  Esempio: Inaridire era un TS discreto con danno, come Scheggia della Mente,
  e il lotto L2 l'ha chiuso con i soli dati.
- **Dopo una capacità condivisa.** Manca un pezzo del motore usato da più
  incantesimi (sigla CAP-…). Si costruisce una volta, con i suoi test, e poi
  la famiglia si completa con i dati.
- **Su misura.** Metamorfosi, Campo anti-magia, Fermare il tempo…: lo stato
  della creatura o del mondo è troppo specifico. Restano lanciati, registrati e
  tracciati con la loro pill; il resto al tavolo.
- **Tracciati** e **Solo registrazione**: informazioni, evocazioni (le
  creature sono token ordinari), viaggi, ambiente. Automatizzarli non darebbe
  nulla di utile al tavolo.

## 5. Come automatizzarli

### 5.1 Lotti con soli dati (L1–L3)

Gli strumenti esistono tutti. Ogni lotto aggiunge dati ai registri del
catalogo, i test di famiglia sui veri pianificatori e un controllo nel
browser per incantesimo rappresentativo.

| Lotto | Famiglia | Registri da toccare | Modello già funzionante |
| --- | --- | --- | --- |
| L1 ✓ | Benefici passivi (16) | `SPELL_EFFECTS` e summaryParts in `src/spells-srd.js`, `supplementSpellRules.js` | Benedizione, Scudo della fede |
| L1 ✓ | Aura sui bersagli scelti (1) | aura mobile in `src/spellAreaCatalog.js` e `src/spellAreaRules.js` | Aura di vita |
| L2 ✓ | Cure discrete (4) | `AREA_HEALING_SPELL_ID_SET` in `src/areaSaveSpellRules.js`, limite bersagli | Cura ferite di massa |
| L2 ✓ | TS con danno (4) | `MULTI_TARGET_SAVE_SPELL_IDS`, `SPELL_SAVE_WORKFLOW_RULES`, `SPELL_CAST_RESOLUTION_RULES` | Scheggia della Mente, Prigione Mentale |
| L2 ✓ | Condizioni dal TS (4) | `AUTOMATION` e `SPELL_EXPIRY`, `mechanics.endsOnDamage` | Sguardo penetrante (Addormentato) |
| L2 ✓ | TS ripetuti (2) | `saveReminder.damage` con `baseSlot` e `additionalPerSlotAbove` | Colpo intrappolante |
| L3 ✓ | Zone (10) | `SPELL_AREA_RULES`, varianti, terreno e marker | Ragnatela, Crescita di spine |
| L3 ✓ | Aree ripetibili (2) | `SPELL_ACTIVE_RESOLUTION_ACTIONS` con save-area | Invocare il fulmine, Investitura della fiamma |

**L1, fatto il 22 ottobre.** I 15 benefici hanno la pill e le mini pill del
testo 2014; Protezione dall'energia le aveva già, per variante. CA, tiri e
vantaggi restano informativi. Le difese di Protezione dai veleni (veleno),
Protezione dall'energia (il tipo scelto) e Invulnerabilità (tutti i tipi) sono
**effettive**: la pill porta `mechanics.damageDefenses`, che la console attacchi
e la console boss applicano ai danni, con il chip che il GM può ignorare; la
difesa finisce con l'incantesimo. Pelle di pietra resta informativa, perché
vale solo per i danni non magici e il motore non li distingue; i danni scritti
nel pannello incantesimi e nella console HP restano il valore finale del GM.
Suggestione e Suggestione di massa finiscono quando il
caster o un alleato danneggia il bersaglio, non a qualunque danno: la pill si
rimuove a mano. Faro di speranza ed Estasiare accettano qualunque numero di
creature. Passare senza tracce è un'aura mobile di 9 m: +10 Furtività alle
creature dello schieramento del caster (PG e alleati per un PG), caster
compreso; la pill segue i movimenti. Test: `test/spellPassiveBenefits.test.js`.

**L2, fatto il 22 ottobre.** Nessun percorso HP nuovo: cure e danni passano
dal comando ad area che già usavano Cura ferite di massa e Scheggia della
Mente, con il calcolo della console HP, una voce History e l'Undo.

- Cura ferite, Parola guaritrice (1 creatura), Preghiera di guarigione e
  Parola guaritrice di massa (fino a 6) sono nel set delle cure senza
  sagoma: il GM sceglie le creature e scrive la cura, mai oltre i PF massimi.
  Non morti e costrutti restano al tavolo.
- Catapulta (nessun danno se il TS riesce), Intimorire infernale, Sussurri
  dissonanti e Inaridire (metà) sono TS su una creatura, con la gittata e i
  dadi dello slot; la reazione dei Sussurri e le piante di Inaridire restano
  al tavolo. Come per gli altri incantesimi del pannello, il danno scritto è
  il valore finale del GM: le difese non si applicano da sole.
- Sonno e Trama ipnotica finiscono quando la creatura subisce danno, da
  qualunque fonte, come dice il testo; la sveglia a mano rimuove la pill. La
  fine vale solo per quella creatura: gli altri restano addormentati o
  affascinati e la concentrazione di Trama ipnotica continua.
- Spruzzo colorato acceca fino alla fine del prossimo turno del caster: la
  scadenza dell'incantesimo ora coincide con quella della condizione.
- Risveglio è tracciato per 30 giorni con la pill «Affascinato dal caster»,
  da togliere se il caster o un compagno gli fa del male; Allucinazione
  mortale scala i 4d10 del promemoria con lo slot; Labirinto mette la pill
  «Nel labirinto» con «Azione: prova Int CD 20», che rimossa termina la
  spell.

Test: `test/spellHealingAndSaves.test.js`.

**L3, fatto il 22 ottobre.** Una sola modifica al motore: gli effetti per
variante delle zone del catalogo (`membershipEffectsByChoice`), prima scritti
a mano per Controllare venti, sono ora un elenco di dati
(`CATALOG_MEMBERSHIP_EFFECTS_BY_CHOICE` in `src/spellAreaRules.js`).

- Muro di sabbia (dentro Accecato, movimento ×3), Muro di forza (pannelli o
  cupola, «Nulla attraversa») e Globo di invulnerabilità (zona immobile sul
  caster, come dice il testo) sono zone sulla mappa.
- Cerchio magico (protezione o prigione, +1 ora per slot sopra il 3°) e
  Santificare (la protezione più l'effetto scelto, con il promemoria del TS
  Carisma) mettono la pill della variante a chi è dentro; i tipi di creatura
  restano al tavolo.
- Antipatia/simpatia chiede il TS Saggezza a chi si avvicina, secondo la
  variante, e non mostra più il campo HP. Proibizione infligge 5d10 radiosi o
  necrotici, scelti al lancio, all'ingresso e a inizio turno, senza TS: il GM
  salta le creature che non sono dei tipi scelti.
- Bagliore solare («Nuova linea»: TS Costituzione, 6d8 radiosi, Accecato) e
  Drago illusorio («Soffio» con l'azione bonus: TS Intelligenza, 7d6) hanno
  l'azione ripetibile e il promemoria di inizio turno. Il tipo del soffio è
  quello scelto al lancio, che l'azione non conosce: lo indica il GM.
- Tempesta di ghiaccio e Scossa tellurica sono zone: il TS e il danno del
  lancio, poi il terreno difficile fino alla fine del prossimo turno del
  caster (Tempesta) o finché non viene sgomberato (Scossa). Anche il boss
  Auril lascia la zona quando lancia la Tempesta.
- Pirotecnica è una zona con la sagoma della variante: Fuochi d'artificio
  entro 3 m dalla fiamma (TS Costituzione, Accecato), Fumo di 6 m oscurato per
  1 minuto. Con il Fumo il GM segna ogni esito come superato.

Test: `test/spellZonesAndRepeatedAreas.test.js`.

### 5.2 Incantesimi d'attacco nella console attacchi (L4)

L'audit proponeva di portare gli attacchi nel pannello incantesimi
(CAP-ATTACK). Oggi la strada più breve è un'altra: la **console attacchi** ha
già tiro per colpire, critico e mancato, danni tipizzati, rider (Sortilegio,
Marchio del cacciatore), un comando per raggio (Deflagrazione occulta) e lo
**slot speso nel comando dell'attacco** (Punizione divina). Mancano tre cose:

1. una «fonte incantesimo» di livello accanto ai trucchetti: dadi e
   incremento per slot dalla tabella curata, come `PC_ATTACK_CANTRIPS`;
2. lo slot speso **una volta per lancio**, alla prima registrazione, anche
   quando il lancio ha più raggi (Raggio rovente) o dardi (Dardo incantato);
3. i dardi senza tiro per colpire.

Così si chiudono Dardo tracciante, Infliggi ferite, Dardo incantato, Raggio
rovente, Globo cromatico, Tocco del vampiro (con la cura del caster) e Dardo
di caos, che l'audit dava RED: con la console il rimbalzo è soltanto una
nuova registrazione dello stesso lancio. Colpo del Vento d'Acciaio aggiunge
il teletrasporto (CAP-TELEPORT), Dissolvi il bene e il male il congedo
(CAP-CLEANSE).

**L4, fatto il 22 ottobre.** La console ha una nuova fonte, «Incantesimo
d'attacco», accanto a quella dei trucchetti: la tabella curata
`PC_ATTACK_SPELLS` (`src/pcAttackSpellCatalog.js`) con dadi, aumento per
slot, raggi o dardi, tipi a scelta. Sulla card si aggiunge un attacco con
questa fonte; il libro e il menu 🪄 aprono la console sull'incantesimo scelto,
e senza quell'attacco il libro continua a registrare il lancio.

- Lo slot (o il Patto) si sceglie nella console e si spende **nel comando
  della prima registrazione**, come la Punizione divina: un Undo restituisce
  danno e slot insieme. Il lancio aperto vive in `pcAttackState.spellCast` e i
  raggi o dardi successivi lo continuano senza slot; un altro attacco lo
  chiude. Senza slot la console chiede conferma, come per le Punizioni.
- Infliggi ferite e Dardo tracciante (con la pill del vantaggio al colpo):
  un attacco per lancio. Raggio rovente e Dardo incantato: un raggio o dardo
  per registrazione, anche sullo stesso bersaglio, così ogni colpo ha il suo
  avviso di concentrazione. Dardo incantato non ha tiro per colpire ed è
  bloccato da Scudo.
- Globo cromatico (nessun rimbalzo nel testo 2014) e Dardo di caos chiedono il
  tipo; con due d8 uguali il Dardo di caos balza su un'altra creatura senza
  nuovo slot, mai due volte sulla stessa.
- Tocco del vampiro si lancia dal pannello, che spende lo slot e tiene la
  concentrazione; la console registra i tocchi finché la concentrazione è
  attiva, e il caster recupera metà del danno necrotico (dopo le difese del
  bersaglio) nello stesso comando, con barra, testo e memoria HP.
- I rider dei trucchetti (Incantesimi potenti, Deflagrazione agonizzante) e
  quelli da arma non valgono sugli incantesimi di livello; i danni extra si
  aggiungono a mano.

Test: `test/pcAttackSpells.test.js` e i casi con il coordinatore vero in
`test/pcAttackExecutionIntegration.test.js`.

### 5.3 Capacità condivise (L5+)

Una capacità per volta, con i suoi test di contratto, poi la famiglia.
«Da sola» conta gli incantesimi che non aspettano altro.

| Capacità | Incantesimi (da sola) | Che cosa serve | Rischio |
| --- | --- | --- | --- |
| CAP-LINK ✓ | 9 (8) | Legame mantenuto o spostato e fine su evento: Marchio del cacciatore, Sortilegio, Dardo stregato, Duello obbligato, Corona di follia, Debilitazione, Invisibilità, Lama roboante, tutti fatti | Medio |
| CAP-HP-BRANCH | 5 (5) | Soglie di PF prima e dopo il danno: Disintegrazione, Dito della morte, Parola del potere uccidere, Regressione mentale, Parola divina | Alto: HP |
| CAP-CLEANSE | 6 (4) | Scegliere e terminare effetti attivi: Ristorare inferiore, Dissolvi magie, Guarigione, Parola del potere guarire | Medio |
| CAP-RESOURCE | 5 (4) | Contatore consumato: Bacche benefiche, Guardiano della fede, Immagine speculare, Cordone di frecce | Medio |
| CAP-REACTION | 6 (6) | Reazione assistita al danno o all'attacco: Interdizione alla morte, Scudo di fuoco, Santuario, Vincolo di interdizione, Interdizione primordiale, Ombra di Moil | Alto: HP |
| CAP-TEMP | 5 (5) | PF temporanei consumati dal danno: Vita falsata, Eroismo, Armatura di Agathys, Trasformazione di Tenser, Flusso di energia negativa | Alto: HP |
| CAP-MAXHP | 4 (4) | PF massimi reversibili: Aiuto, Banchetto degli eroi, Ferire, Ristorare superiore | Alto: HP e barre |
| CAP-TERRAIN | 6 (6) | Modalità e sottozone di terreno: Crescita vegetale, Parlare con i vegetali, Simbolo, Boschetto druidico, Muro d'acqua, Trasmutare roccia | Medio |
| CAP-STABILIZE (+ CAP-CALENDAR) | 6 (2) | Stabilizzare, riportare a 1 PF, penalità che scendono ai riposi: Salvare i morenti, Rinascita, Rianimare morti, Reincarnazione, Resurrezione, Resurrezione pura | Alto: HP |
| CAP-TELEPORT | 4 (3) | Teletrasporto attivo o composito: Passo del tuono, Passo remoto, Portale arcano | Alto |
| CAP-ORIGIN | 4 (3) | Azione da un'origine diversa dal caster: Sfera congelante, Soffio del drago, Rampicante afferrante, Segugio fedele | Medio |
| CAP-MULTIAREA | 3 (2) | Più aree in un lancio: Tempesta di fuoco, Sciame di meteore, Minuscole meteore | Medio |
| CAP-STRUCTURE | 3 (3) | Segmenti con PF e crollo: Muro di ghiaccio, Muro di pietra, Ossa della terra | Alto |
| CAP-SEQUENCE | 2 (2) | Effetto che cambia a ogni round: Tempesta di vendetta, Tsunami | Medio |
| Singole | 1 ciascuna | CAP-MODE (Alterare sé stesso), CAP-DURATION (Scagliare maledizione), CAP-SUPPRESSION (Calmare emozioni), CAP-CALENDAR (Costrizione), CAP-REPEAT-HEAL (Rigenerazione), CAP-CARRIAGE (Sfera acquea), CAP-RELATION (Trasferimento di vita), CAP-ALLOCATION (Guarigione di massa) | Vario |

**CAP-LINK, primo lotto, fatto il 22 ottobre.** Una sola parte di motore: lo
spostamento del bersaglio di un incantesimo (`replaceSpellTargets` in
`src/spellActiveActionCore.js`, finora mai usato) mette sulla nuova creatura
l'istanza e le pill del lancio, compresa la variante scelta
(`effectsFromCast`), e toglie la vecchia dalla concentrazione.

- Marchio del cacciatore e Sortilegio hanno l'azione bonus «Sposta»; il
  promemoria di inizio turno del caster la propone solo quando la creatura
  marchiata è a 0 PF o non è più sulla scena. Sortilegio conserva la
  caratteristica scelta. Il Marchio dura 8 ore dal 3° e 24 ore dal 5°.
- Dardo stregato ha l'azione ripetuta di Debilitazione: 1d12 fulmine
  automatici a inizio turno; gittata, copertura e azione usata per altro le
  decide il GM, che termina l'incantesimo.
- Corona di follia chiede al caster, a inizio turno, «Mantieni (azione)» o
  «Termina»; Duello obbligato, a fine turno, «Entro 9 m» o «Termina». Gli
  altri eventi di fine li gestisce il GM togliendo la pill.
- Invisibilità finisce per la creatura la cui pill viene tolta (quando attacca
  o lancia un incantesimo) e prende un bersaglio in più per ogni slot sopra
  il 2°. Debilitazione era già automatizzata: la fine per azione non usata è
  il «Termina» generico.

Test: `test/spellLinks.test.js` e lo spostamento di Sortilegio con il
coordinatore vero in `test/spellSlotSpendUndo.test.js`.

**CAP-LINK, secondo lotto, fatto il 22 ottobre.** Gli eventi di fine che il
plugin vede davvero: un attacco registrato nella console attacchi e il
movimento del token nel suo turno.

- Lama roboante: il colpo lascia sul bersaglio la pill con i danni di
  movimento al livello del caster (`mechanics.movementDamage`). Quando la
  creatura si muove durante il proprio turno compare l'avviso con i danni da
  tuono da confermare; la conferma li applica e toglie la pill. Il plugin non
  distingue lo spostamento forzato: in quel caso il GM chiude l'avviso.
- Invisibilità finisce da sola quando il suo portatore attacca o lancia dalla
  console attacchi, nello stesso comando dell'attacco (un Annulla la rende).
  Un incantesimo lanciato altrove resta la pill tolta a mano. Invisibilità
  superiore non finisce: si legge l'incantesimo dall'istanza, non il nome
  della condizione.
- Duello obbligato finisce quando il caster attacca un'altra creatura, o
  quando una creatura alleata del caster danneggia il bersaglio del duello.
  Gli incantesimi ostili su altre creature lanciati fuori dalla console
  restano al GM.

Test: `test/spellLinks.test.js` (avvisi di Lama roboante, le fini di
Invisibilità e del Duello) e l'attaccante invisibile con il coordinatore vero
e un Annulla in `test/pcAttackExecutionIntegration.test.js`.

L'ordine consigliato resta quello dell'audit (LINK, HP-BRANCH, CLEANSE,
RESOURCE), con CAP-ATTACK sostituita dalla console attacchi (L4). Le capacità
che toccano gli HP (HP-BRANCH, REACTION, TEMP, MAXHP, STABILIZE) vanno
progettate con `src/hpMemory.js`, le barre HP sulla mappa e i PF condivisi:
mai campi HP alternativi a `meta.hp` e `meta.hpMax`.

### 5.4 Su misura

Forme animali, Campo anti-magia, Contingenza, Glifo di interdizione, Giara
magica, Fuorviare, Metamorfosi, Metamorfosi pura, Trasformazione, Inversione
della gravità, Fermare il tempo. Restano lanciati, registrati e tracciati;
automatizzarli richiederebbe un dominio proprio (forme e statistiche
sostitutive, soppressione della magia, turni extra) che non conviene
costruire per un incantesimo ciascuno. Imprigionare e il Manto del Crociato
legacy aspettano testo e perimetro delle regole.

## 6. Proposte nate dal sistema a slot

Piccole, senza HP, utili subito al tavolo:

1. **Reazioni.** Controincantesimo, Intimorire infernale, Scudo, Caduta
   morbida, Assorbire elementi e Gabbia dell'anima si lanciano con una
   reazione: il loro lancio può segnare **Reazione usata** sul caster nello
   stesso comando (la condizione di `src/reactionTrackerCore.js`, che torna da
   sola all'inizio del suo turno).
2. **Rituali.** 33 incantesimi del catalogo sono rituali (Identificare,
   Individuazione del magico, Presagio…): nel libro un'opzione «Lancia come
   rituale» registrerebbe il lancio senza slot con un tocco, invece di passare
   da ⚙ e «Senza slot».
3. **Dadi nella registrazione.** Per gli incantesimi registrati che hanno
   dadi (Dardo incantato, Guarigione) il pannello può
   mostrare i dadi al livello dello slot scelto, come fa per gli altri.
4. **Dati di bersaglio.** Guarigione di massa usa ancora il limite di un
   bersaglio predefinito: va dichiarato «qualunque numero di creature»
   (`TARGETING_OVERRIDES`).

## 7. Manutenzione

- La matrice semantica di settembre resta la fonte delle annotazioni per
  incantesimo; questo documento ne aggiorna stato e ordine di lavoro. Quando
  un lotto si chiude, aggiornare le righe della matrice e i conteggi di questo
  documento.
- `npm run audit:spells` rigenera lo snapshot strutturale: dopo la
  registrazione tutti i 477 risultano esposti nel pannello (`UNIFIED`), ma il
  livello di automazione non cambia, perché registrare non è automatizzare.
- Un incantesimo che entra in un registro del pannello (aree, TS, cure)
  smette da solo di essere «solo registrazione»: i test di
  `test/spellCastRecord.test.js` fissano oggi il conteggio a 75 e vanno
  aggiornati con il lotto.

## 8. Note pratiche per lavorare a un lotto

Quello che il lotto L1 ha insegnato e che il codice non dice da solo. Valgono
per ogni lotto, insieme ad `AGENTS.md`.

### 8.1 Prima di cominciare

- **Regole del 2014**: i testi del PHB 2014 e dei supplementi del catalogo,
  mai le revisioni del 2024. Dadi, TS e bersagli di L2–L4 sono nell'elenco
  della sezione 9.
- **Un lotto per volta**, con il via dell'utente. Prima del codice si spiega
  la patch; L2, L3 e L4 toccano gli HP, come molte capacità di L5+, e prima
  di quei lotti ci si ferma a spiegarne il rischio, come chiede `AGENTS.md`.
- **Dati prima di codice nuovo**: in L1–L3 si copia la forma di un
  incantesimo che funziona già (colonna «Modello già funzionante» della
  sezione 5.1); L4 e L5+ aggiungono codice solo dove lo dice la sezione 5. In
  L2–L4 cure e danni passano dai percorsi esistenti, mai da uno nuovo.
- **Nella cartella principale del repository**, non in un worktree (sezione
  8.6).

### 8.2 Trappole del motore

- `mechanics.endsOnDamage` toglie la pill a **qualunque** danno, senza
  guardare chi lo infligge (`resolveDamageEndsConditionRemovals` in
  `src/hpConditionRulesCore.js`): va bene solo se il testo dice così. Quando
  la fine dipende da chi colpisce, come per Suggestione, la pill ha
  `manualRemoval` ed `endsParentOnRemoval` e la toglie il GM.
- Le difese ai danni (`mechanics.damageDefenses`) le applicano soltanto la
  console attacchi dei PG (`src/pc-attack.js`) e la console boss
  (`src/boss-actions.js`). Il pannello incantesimi, la console ad area e la
  console HP prendono il danno come valore finale del GM.
- Le mini pill delle difese si aggiungono da sole (`effectSummaryPartsFor` in
  `src/effectLabelCore.js`), con id `damage-defense-<difesa>-<tipo>`: per
  esempio `damage-defense-resistance-poison`, oppure
  `damage-defense-immunity-all` per tutti i tipi. Se le summaryParts
  configurate ripetono una difesa, usano lo stesso id, altrimenti la mini pill
  compare due volte.
- «Qualunque numero di creature» si dichiara in `TARGETING_OVERRIDES`
  (`src/spells-srd.js`) con `{ unbounded: true }`; senza, vale il limite di
  bersagli predefinito.
- Un'aura mobile si dichiara in più punti: `MOBILE_AURA_SPELL_IDS` e
  `AREA_OVERRIDES` in `src/spellAreaCatalog.js`;
  `SELF_CAST_AURA_TARGETING_BY_SPELL`, `SELF_CAST_AURA_SPELL_IDS` e l'effetto
  di appartenenza (`membershipEffects`) in `src/spellAreaRules.js`; se l'aura
  non chiede TS, anche `AREA_PLACEMENT_ONLY_SPELL_IDS` in
  `src/areaSaveSpellRules.js`. Se l'incantesimo dava già una pill personale
  al caster, il suo id va in `MOBILE_AURA_LEGACY_CASTER_EFFECT_IDS`
  (`src/spellAuraCore.js`), che la toglie quando parte l'aura. Modello:
  Passare senza tracce.
- Il ticking degli incantesimi e il cambio di round possono passare da più di
  un percorso (`AGENTS.md`): per i TS ripetuti di L2 e i danni di zona di L3
  si leggono tutti prima di toccarne uno.

### 8.3 Test

- Test di famiglia sui pianificatori veri, non solo sui dati. Modello:
  `test/spellPassiveBenefits.test.js`, che segue la catena intera: piano
  dell'incantesimo, mutazione degli effetti, pill sul token, console attacchi
  e danno boss, fine con la concentrazione.
- Il pianificatore puro `buildEffectsMutationPlan`
  (`src/effectsMutationCore.js`) vuole le operazioni già preparate:
  `instanceIds` per le condizioni ed `entryIds` per gli incantesimi, come fa
  `prepareOperation` in `src/effectsMutations.js`. Senza id non produce
  condizioni, e il test non prova nulla.
- Coordinatore, History e Undo veri: `test/spellSlotSpendUndo.test.js`.
- Cure e danni sul piano reale del comando ad area: modello
  `test/spellHealingAndSaves.test.js`, che costruisce il comando dal contratto
  del pannello e chiama `buildSpellAreaResolutionExecutionPlan` con un
  runtime minimo (`readItems`, `readAllItems`, `readSceneMetadata`,
  `getInitiativeActorId`, `createSpellInstanceId`); gli HP risultanti sono in
  `sharedHpPreview.updates`, le condizioni tolte dal danno in
  `damageEndsRemovals`.
- Conteggi fissati che un lotto sposta: i 75 incantesimi solo registrabili
  in `test/spellCastRecord.test.js`; in `test/spellAreaRules.test.js`
  `AREA_PLACEMENT_ONLY_SPELL_IDS` (40), `MULTI_TARGET_SAVE_SPELL_IDS` (17),
  `AREA_PLACEABLE_SPELL_IDS` (135) e `AREA_POPOVER_SPELL_IDS` (152); gli
  incantesimi tracciati (361) in tre test e in
  `scripts/check-spell-catalog.mjs`. Si
  aggiornano con il lotto, con un commento che dice perché.
- `test/spellAreaIndex.test.js` fallisce finché `src/spellAreaIndex.js` non è
  rigenerato.

### 8.4 Verifica nel browser

- Server: la configurazione `boss-actions-preview` di `.claude/launch.json`
  (Vite con l'SDK di Owlbear simulato, porta 5199).
- Scheda e libro degli incantesimi:
  `/test-support/boss-actions-browser/class-features-card.html?pc=mago`, con
  il coordinatore degli effetti e la History veri; `?pc=` sceglie il
  personaggio, `?role=PLAYER` mostra la vista giocatore. Hanno un libro
  (`spellbook`) `mago` e `chierico` (le cure di L2); per provare altri
  incantesimi se ne aggiunge uno al personaggio. Gli incantesimi che passano
  dal tracker (aree, cure, TS) restano su «Esecuzione…», perché l'anteprima
  non ha il tracker: il pannello incantesimi si apre in un iframe su
  `/spell-unified-panel.html`, con la
  query di `buildSpellUnifiedPanelRouteQuery`.
- Mappa, aree e aure: `/test-support/boss-actions-browser/frame.html`
  (griglia da 70 px, token, Round +1, console boss e HP, Undo). Il controller
  delle aure non parte da solo: dalla console si importa
  `/src/spellAuraController.js`, si chiama `mountSpellAuraController()` e poi
  `requestSpellAuraReconcile()`.
- Un controllo per incantesimo rappresentativo, con la console del browser
  senza errori.

### 8.5 Chiudere il lotto

1. `npm run generate:spell-area-index` dopo ogni modifica alle regole di
   area o di TS.
2. `npm run audit:spells`: rigenera lo snapshot strutturale e conserva il
   blocco semantico.
3. Righe della matrice semantica e conteggi di questo documento (sezione 7);
   dove cambiano, anche `docs/GUIDA_UTENTE.md`, `docs/INCANTESIMI_E_ZONE.md`,
   `docs/RIFERIMENTO_FUNZIONI.md` e `docs/INDICE.md`.
4. `npm run check:spells`, `npm test`, `npm run build`, `npm run verify:dist`.

### 8.6 Commit, bundle e Windows

- Commit su `main`, uno per lotto, con il messaggio in inglese come i
  precedenti; poi un commit a parte, `build: publish production bundle from
  <sha>`, con il bundle generato da quel commit. Il push lo decide l'utente.
- La build del bundle va fatta con l'albero pulito: `dirty` in
  `dist/build-info.json` viene da `git status --porcelain`
  (`scripts/build-metadata.mjs`). `dist/` è nel `.gitignore` ma tracciato: si
  aggiunge con `git add -A -f -- dist`.
- Windows: il Git di sistema ha `core.autocrlf=true` e `.gitattributes`
  protegge soltanto `dist/`. Un worktree o un checkout nuovo scrive i file
  con fine riga CRLF, e i test che confrontano byte o hash SHA-256
  falliscono senza un vero errore. Se un worktree serve davvero:
  `core.autocrlf=false` prima del checkout; `git ls-files --eol` si legge
  separando sul tab, perché i percorsi contengono spazi; un `node_modules`
  collegato (junction) si toglie con `cmd /c rmdir` prima di
  `git worktree remove --force`, per non rischiare i `node_modules`
  principali.

## 9. Elenco completo

Lotti: L1–L4 come nella sezione 1, L5+ dopo la capacità indicata, — nessun
lotto. Gli incantesimi senza lavoro residuo sono elencati per livello.

### Pronti: bastano i dati (0)

Nessuno: i lotti L1–L3 li hanno chiusi tutti il 22 ottobre.

### Dopo una capacità condivisa (65)

Serve prima una capacità condivisa del motore (sigla CAP-…, sezione 5); poi la famiglia si completa con i dati.

| Incantesimo | Liv. | Come automatizzarlo | Lotto |
| --- | --- | --- | --- |
| Salvare i morenti (`spare-the-dying`) | T | CAP-STABILIZE: stabilizzare o riportare a 1 PF. | L5+ |
| Armatura di Agathys (`phb2014-armatura-di-agathys`) | 1° | CAP-TEMP: PF temporanei consumati dal danno. | L5+ |
| Bacche benefiche (`goodberry`) | 1° | CAP-RESOURCE: bacche come contatore consumabile. | L5+ |
| Eroismo (`heroism`) | 1° | CAP-TEMP: PF temporanei consumati dal danno. | L5+ |
| Santuario (`sanctuary`) | 1° | CAP-REACTION: reazione assistita a danno o attacco. | L5+ |
| Vita falsata (`false-life`) | 1° | CAP-TEMP: PF temporanei consumati dal danno. | L5+ |
| Aiuto (`aid`) | 2° | CAP-MAXHP: modificatore reversibile dei PF massimi. | L5+ |
| Alterare sé stesso (`alter-self`) | 2° | CAP-MODE: cambio esclusivo di modalità. | L5+ |
| Calmare emozioni (`calm-emotions`) | 2° | CAP-SUPPRESSION: sospendere condizioni senza toglierle. | L5+ |
| Cordone di Frecce (`phb2014-cordone-di-frecce`) | 2° | CAP-RESOURCE: contatore consumato (immagini, frecce, danno residuo). | L5+ |
| Immagine speculare (`mirror-image`) | 2° | CAP-RESOURCE: contatore consumato (immagini, frecce, danno residuo). | L5+ |
| Ristorare inferiore (`lesser-restoration`) | 2° | CAP-CLEANSE: scegliere un effetto attivo e terminarlo. | L5+ |
| Soffio del Drago (`xanathar-soffio-del-drago`) | 2° | CAP-ORIGIN: azione da un'origine diversa dal caster. | L5+ |
| Vincolo di interdizione (`warding-bond`) | 2° | CAP-REACTION: reazione assistita a danno o attacco. | L5+ |
| Crescita vegetale (`plant-growth`) | 3° | CAP-TERRAIN: modalità e sottozone di terreno. | L5+ |
| Dissolvi magie (`dispel-magic`) | 3° | CAP-CLEANSE: scegliere un effetto attivo e terminarlo. | L5+ |
| Minuscole Meteore di Melf (`xanathar-minuscole-meteore-di-melf`) | 3° | CAP-MULTIAREA + CAP-RESOURCE: meteore consumate per attivazione. | L5+ |
| Muro d'Acqua (`xanathar-muro-dacqua`) | 3° | CAP-TERRAIN: modalità e sottozone di terreno. | L5+ |
| Parlare con i vegetali (`speak-with-plants`) | 3° | CAP-TERRAIN: modalità e sottozone di terreno. | L5+ |
| Passo del Tuono (`xanathar-passo-del-tuono`) | 3° | CAP-TELEPORT: teletrasporto con passeggero e danno nel punto lasciato. | L5+ |
| Rinascita (`revivify`) | 3° | CAP-STABILIZE: stabilizzare o riportare a 1 PF. | L5+ |
| Scagliare maledizione (`bestow-curse`) | 3° | CAP-DURATION: concentrazione che dipende dallo slot. | L5+ |
| Trasferimento di Vita (`xanathar-trasferimento-di-vita`) | 3° | CAP-RELATION: danno al caster, cura doppia al bersaglio. | L5+ |
| Guardiano della fede (`guardian-of-faith`) | 4° | CAP-RESOURCE: contatore consumato (immagini, frecce, danno residuo). | L5+ |
| Interdizione alla morte (`death-ward`) | 4° | CAP-REACTION: reazione assistita a danno o attacco. | L5+ |
| Ombra di Moil (`xanathar-ombra-di-moil`) | 4° | CAP-REACTION: reazione assistita a danno o attacco. | L5+ |
| Rampicante Afferrante (`phb2014-rampicante-afferrante`) | 4° | CAP-ORIGIN: azione da un'origine diversa dal caster. | L5+ |
| Scudo di fuoco (`fire-shield`) | 4° | CAP-REACTION: reazione assistita a danno o attacco. | L5+ |
| Segugio fedele (`faithful-hound`) | 4° | CAP-ORIGIN: azione da un'origine diversa dal caster. | L5+ |
| Sfera Acquea (`xanathar-sfera-acquea`) | 4° | CAP-CARRIAGE: creature trasportate ed espulse dalla zona. | L5+ |
| Colpo del Vento d'Acciaio (`xanathar-colpo-del-vento-dacciaio`) | 5° | Console attacchi (5 attacchi) + teletrasporto finale (CAP-TELEPORT). | L5+ |
| Costrizione (`geas`) | 5° | CAP-CALENDAR: limiti per giorno o riposo. | L5+ |
| Dissolvi il bene e il male (`dispel-evil-and-good`) | 5° | CAP-CLEANSE: scegliere un effetto attivo e terminarlo. | L5+ |
| Flusso di Energia Negativa (`xanathar-flusso-di-energia-negativa`) | 5° | CAP-TEMP: PF temporanei consumati dal danno. | L5+ |
| Muro di pietra (`wall-of-stone`) | 5° | CAP-STRUCTURE: segmenti con PF, distruzione e residui. | L5+ |
| Passo Remoto (`xanathar-passo-remoto`) | 5° | CAP-TELEPORT: teletrasporto ripetibile da un parent. | L5+ |
| Reincarnazione (`reincarnate`) | 5° | CAP-STABILIZE + CAP-CALENDAR: ritorno in vita e penalità ai riposi. | L5+ |
| Rianimare morti (`raise-dead`) | 5° | CAP-STABILIZE + CAP-CALENDAR: ritorno in vita e penalità ai riposi. | L5+ |
| Ristorare superiore (`greater-restoration`) | 5° | CAP-MAXHP: modificatore reversibile dei PF massimi. | L5+ |
| Trasmutare Roccia (`xanathar-trasmutare-roccia`) | 5° | CAP-TERRAIN: modalità e sottozone di terreno. | L5+ |
| Banchetto degli eroi (`heroes-feast`) | 6° | CAP-MAXHP: modificatore reversibile dei PF massimi. | L5+ |
| Boschetto Druidico (`xanathar-boschetto-druidico`) | 6° | CAP-TERRAIN: modalità e sottozone di terreno. | L5+ |
| Disintegrazione (`disintegrate`) | 6° | CAP-HP-BRANCH: soglie di PF prima/dopo il danno. | L5+ |
| Ferire (`harm`) | 6° | CAP-MAXHP: modificatore reversibile dei PF massimi. | L5+ |
| Guarigione (`heal`) | 6° | CAP-CLEANSE: cura e rimozione di condizioni nello stesso comando. | L5+ |
| Interdizione Primordiale (`xanathar-interdizione-primordiale`) | 6° | CAP-REACTION: reazione assistita a danno o attacco. | L5+ |
| Muro di ghiaccio (`wall-of-ice`) | 6° | CAP-STRUCTURE: segmenti con PF, distruzione e residui. | L5+ |
| Ossa della Terra (`xanathar-ossa-della-terra`) | 6° | CAP-STRUCTURE: segmenti con PF, distruzione e residui. | L5+ |
| Portale Arcano (`phb2014-portale-arcano`) | 6° | CAP-TELEPORT: coppia di portali con attraversamento. | L5+ |
| Sfera congelante (`freezing-sphere`) | 6° | CAP-ORIGIN: globo conservato e detonazione differita. | L5+ |
| Trasformazione di Tenser (`xanathar-trasformazione-di-tenser`) | 6° | CAP-TEMP: PF temporanei consumati dal danno. | L5+ |
| Dito della morte (`finger-of-death`) | 7° | CAP-HP-BRANCH: soglie di PF prima/dopo il danno. | L5+ |
| Parola divina (`divine-word`) | 7° | CAP-HP-BRANCH: soglie di PF prima/dopo il danno. | L5+ |
| Resurrezione (`resurrection`) | 7° | CAP-STABILIZE + CAP-CALENDAR: ritorno in vita e penalità ai riposi. | L5+ |
| Rigenerazione (`regenerate`) | 7° | CAP-REPEAT-HEAL: cura ripetuta a ogni turno. | L5+ |
| Simbolo (`symbol`) | 7° | CAP-TERRAIN: modalità e sottozone di terreno. | L5+ |
| Tempesta di fuoco (`fire-storm`) | 7° | CAP-MULTIAREA: più aree in un lancio, bersagli senza duplicati. | L5+ |
| Regressione mentale (`feeblemind`) | 8° | CAP-HP-BRANCH: soglie di PF prima/dopo il danno. | L5+ |
| Tsunami (`phb2014-tsunami`) | 8° | CAP-SEQUENCE: effetto che cambia a ogni round. | L5+ |
| Guarigione di massa (`mass-heal`) | 9° | CAP-ALLOCATION + CAP-CLEANSE: 700 PF da ripartire. | L5+ |
| Parola del Potere Guarire (`phb2014-parola-del-potere-guarire`) | 9° | CAP-CLEANSE: cura e rimozione di condizioni nello stesso comando. | L5+ |
| Parola del potere uccidere (`power-word-kill`) | 9° | CAP-HP-BRANCH: soglie di PF prima/dopo il danno. | L5+ |
| Resurrezione pura (`true-resurrection`) | 9° | CAP-STABILIZE + CAP-CALENDAR: ritorno in vita e penalità ai riposi. | L5+ |
| Sciame di meteore (`meteor-swarm`) | 9° | CAP-MULTIAREA: più aree in un lancio, bersagli senza duplicati. | L5+ |
| Tempesta di vendetta (`storm-of-vengeance`) | 9° | CAP-SEQUENCE: effetto che cambia a ogni round. | L5+ |

### Su misura (11)

Stato proprio dell'incantesimo: restano registrati e tracciati, senza lotto.

| Incantesimo | Liv. | Come automatizzarlo | Lotto |
| --- | --- | --- | --- |
| Glifo di interdizione (`glyph-of-warding`) | 3° | Su misura: incantesimo custodito e lanciato da un innesco. | — |
| Metamorfosi (`polymorph`) | 4° | Su misura: forma, statistiche e PF sostitutivi. | — |
| Fuorviare (`mislead`) | 5° | Su misura: controllo e sensi su un'altra entità. | — |
| Contingenza (`contingency`) | 6° | Su misura: incantesimo custodito e lanciato da un innesco. | — |
| Giara magica (`magic-jar`) | 6° | Su misura: controllo e sensi su un'altra entità. | — |
| Inversione della gravità (`reverse-gravity`) | 7° | Su misura: salita, sospensione e caduta. | — |
| Campo anti-magia (`antimagic-field`) | 8° | Su misura: soppressione della magia. | — |
| Forme animali (`animal-shapes`) | 8° | Su misura: forma, statistiche e PF sostitutivi. | — |
| Fermare il tempo (`time-stop`) | 9° | Su misura: turni extra consecutivi. | — |
| Metamorfosi pura (`true-polymorph`) | 9° | Su misura: forma, statistiche e PF sostitutivi. | — |
| Trasformazione (`shapechange`) | 9° | Su misura: forma, statistiche e PF sostitutivi. | — |

### Da verificare (2)

Mancano testo o perimetro delle regole.

| Incantesimo | Liv. | Come automatizzarlo | Lotto |
| --- | --- | --- | --- |
| Manto del Crociato (`legacy-crusaders-mantle`) | 3° | Regole da verificare prima di decidere. | — |
| Imprigionare (`imprisonment`) | 9° | Regole da verificare prima di decidere. | — |

### Automatizzati (255)

Lancio e risoluzione assistiti dal pannello, dalla console ad area o dalla console attacchi.

- **Trucchetti**: Amicizia, Beffa crudele, Colpo accurato, Creare Falò, Dardo di fuoco, Deflagrazione occulta, Ferocia Primordiale, Fiamma sacra, Fiotto acido, Frusta di Spine, Guida, Infestazione, Interdizione alle Lame, Lama Roboante, Lama Verdefiamma, Lenza Elettrizzante, Morsa del Gelo, Parola Radiosa, Produrre fiamma, Raggio di gelo, Resistenza, Rintocco dei Morti, Rombo di Tuono, Scheggia della Mente, Spruzzo velenoso, Stretta folgorante, Tocco gelido, Turbine di Spade.
- **1° livello**: Amicizia con gli animali, Anatema, Armatura magica, Assorbire Elementi (reazione), Benedizione, Braccia di Hadar, Catapulta, Cerimonia (R), Charme su persone, Colpo dello Zefiro, Colpo Intrappolante, Coltello di Ghiaccio, Comando, Cura ferite, Dardo di Caos, Dardo incantato, Dardo Stregato, Dardo tracciante, Duello Obbligato, Favore divino, Globo Cromatico, Incuti Paura, Infliggi ferite, Intimorire infernale (reazione), Intralciare, Legame con le Bestie, Luminescenza, Mani brucianti, Marchio del cacciatore, Miscela Caustica di Tasha, Nube di nebbia, Onda tonante, Parola guaritrice, Passo veloce, Protezione dal bene e dal male, Punizione Collerica, Punizione Incandescente, Punizione Tonante, Raffica di Spine, Raggio di Infermità, Risata incontenibile, Ritirata rapida, Saltare, Scossa Tellurica, Scudo (reazione), Scudo della fede, Sonno, Sortilegio, Spruzzo colorato, Sussurri Dissonanti, Trabocchetto, Unto.
- **2° livello**: Aculeo Mentale, Allucinazione di Forza, Arma magica, Arma spirituale, Bagliore lunare, Blocca persone, Caratteristica potenziata, Cecità/sordità, Corona di Follia, Crescita di spine, Diavoletto di Polvere, Estasiare, Folata di vento, Frantumare, Freccia acida, Ingrandire/ridurre, Invisibilità, Levitazione, Movimenti del ragno, Nube di Pugnali, Oscurità, Passare senza tracce, Passo velato, Pelle coriacea, Percezione delle Bestie (R), Pirotecnica, Preghiera di guarigione, Protezione dai veleni, Punizione Marchiante, Raggio di affaticamento, Raggio rovente, Ragnatela, Riscaldare il metallo, Sciame di Palle di Neve di Snilloc, Scudiscio Mentale di Tasha, Sfera infuocata, Sfocatura, Silenzio (R), Spirito Guaritore, Stretta della Terra di Maximilian, Suggestione, Vampa di Aganazzar, Vento di Interdizione, Vincolo della Terra, Zona di verità.
- **3° livello**: Arma Elementale, Aura di Vitalità, Cerchio magico, Eruzione Terrestre, Evoca Raffica, Fame di Hadar, Faro di speranza, Forma gassosa, Fortezza della Mente, Frecce Infuocate, Freccia Folgorante, Fulmine, Guardiani spirituali, Intermittenza, Invocare il fulmine, Lentezza, Luce diurna, Morte Apparente (R), Muro di Sabbia, Muro di vento, Nemici in Abbondanza, Nube maleodorante, Onda di Marea, Palla di fuoco, Parola guaritrice di massa, Paura, Protezione dall'energia, Punizione Accecante, Sonnellino, Sudario Spirituale, Tempesta di nevischio, Tocco del vampiro, Trama ipnotica, Velocità, Volare.
- **4° livello**: Allucinazione mortale, Anatema Elementale, Aura di Purezza, Aura di Vita, Charme sui Mostri, Compulsione, Confusione, Controllare acqua, Dominare bestie, Esilio, Fulgore Nauseante, Guardiano della Natura, Inaridire, Invisibilità superiore, Libertà di movimento, Muro di fuoco, Pelle di pietra, Porta dimensionale, Punizione Demoralizzante, Sfera al Vetriolo, Sfera della Tempesta, Sfera elastica, Tempesta di ghiaccio, Tentacoli neri.
- **5° livello**: Abilità Potenziata, Alba, Animare oggetti, Arma Sacra, Blocca mostri, Cerchio di Potere, Collera della Natura, Colpo infuocato, Cono di freddo, Contagio, Controllare Venti, Cura ferite di massa, Debilitazione, Dominare persona, Evoca Pioggia di Armi, Guscio anti-vita, Immolazione, Maelstrom, Mano arcana, Muro di forza, Muro di Luce, Nube mortale, Onda Distruttiva, Piaga degli insetti, Punizione Esiliante, Risveglio, Santificare, Scossa Sinaptica, Telecinesi.
- **6° livello**: Abito Ultraterreno di Tasha, Bagliore solare, Barriera di lame, Camminare nel vento, Carne in pietra, Catena di fulmini, Cerchio di morte, Danza irresistibile, Globo di invulnerabilità, Investitura del Ghiaccio, Investitura del Vento, Investitura della Fiamma, Investitura della Pietra, Muro di spine, Prigione Mentale, Proibizione (R), Sguardo penetrante, Suggestione di massa.
- **7° livello**: Corona di Stelle, Gabbia di forza, Palla di fuoco ritardata, Parola del Potere Dolore, Spada arcana, Spruzzo prismatico, Turbine.
- **8° livello**: Antipatia/simpatia, Aura sacra, Dominare mostri, Drago Illusorio, Esplosione solare, Labirinto, Nube incendiaria, Orrido Avvizzimento di Abi-Dalzim, Oscurità della Follia, Parola del potere stordire, Terremoto.
- **9° livello**: Fatale, Invulnerabilità, Lama del Disastro, Muro prismatico, Previsione, Urlo Psichico.

### Tracciati: nessuna automazione utile (112)

Il lancio crea la pill con durata e concentrazione; gli effetti (informazioni, evocazioni, ambiente) si risolvono al tavolo. (R) = rituale.

- **Trucchetti**: Controllare Fiamme, Illusione minore, Luce, Luci danzanti, Mano magica, Messaggio, Modellare Acqua, Modellare Terra, Pietra Magica, Prestidigitazione, Randello incantato, Taumaturgia.
- **1° livello**: Allarme (R), Caduta morbida (reazione), Camuffare se stesso, Comprensione dei linguaggi (R), Disco fluttuante (R), Immagine silenziosa, Individuazione del bene e del male, Individuazione del magico (R), Individuazione delle malattie e dei veleni (R), Parlare con gli animali (R), Scritto illusorio (R), Servitore inosservato (R).
- **2° livello**: Animale messaggero (R), Aura magica dell'arcanista, Bocca magica (R), Evocare Bestia, Fiamma perenne, Individuazione dei pensieri, Lama d'Ombra, Lama infuocata, Localizza oggetto, Riposo inviolato (R), Scritta Celeste (R), Scurovisione, Serratura arcana, Trucco della corda, Vedere invisibilità.
- **3° livello**: Anti-individuazione, Camminare sull'acqua (R), Capanna (R), Chiaroveggenza, Destriero fantomatico (R), Evoca animali, Evoca Bestia d'Ombra, Evoca Demoni Minori, Evoca Folletto (Tasha), Evoca Non Morto, Fondersi nella pietra (R), Immagine maggiore, Inviare, Linguaggi, Parlare con i morti, Respirare sott'acqua (R), Servitore Minuscolo.
- **4° livello**: Evoca Aberrazione, Evoca Costrutto, Evoca creature boschive, Evoca Demone Maggiore, Evoca Elementale (Tasha), Evoca elementali minori, Insetto gigante, Localizza creatura, Occhio arcano, Santuario privato, Terreno illusorio.
- **5° livello**: Cerchio di teletrasporto, Comunione (R), Contattare altri piani (R), Creazione, Danza Macabra, Evoca Celestiale (Tasha), Evoca elementale, Faretra Rapida, Legame planare, Legame telepatico (R), Modificare memoria, Passapareti, Richiamo Infernale, Scrutare, Sembrare, Sogno, Traslazione arborea.
- **6° livello**: Evoca folletto, Evoca Immondo, Evocazione istantanea (R), Gabbia dell'Anima (reazione), Illusione programmata, Muovere il terreno, Scopri il percorso, Trasporto vegetale, Vigilanza e interdizione, Visione del vero.
- **7° livello**: Celare, Evoca celestiale, Forma eterea, Immagine proiettata, Miraggio arcano, Reggia meravigliosa, Simulacro, Sogno del Velo Celeste, Tempio degli Dèi.
- **8° livello**: Controllare tempo atmosferico, Fortezza Possente, Loquacità, Semipiano, Telepatia, Vuoto mentale.
- **9° livello**: Metamorfosi di Massa, Portale, Proiezione astrale.

### Solo registrazione: nessuna automazione utile (32)

Istantanei: il lancio spende lo slot e finisce nel registro, senza pill. (R) = rituale.

- **Trucchetti**: Artificio druidico, Folata, Riparare.
- **1° livello**: Creare o distruggere acqua, Identificare (R), Purificare cibo e bevande (R), Trova famiglio (R).
- **2° livello**: Localizza animali o vegetali (R), Presagio (R), Scassinare, Scopri trappole, Trova cavalcatura.
- **3° livello**: Animare morti, Controincantesimo (reazione), Creare cibo e acqua, Rimuovi maledizione.
- **4° livello**: Divinazione (R), Fabbricare, Scolpire pietra, Scrigno segreto, Trova Cavalcatura Superiore.
- **5° livello**: Comunione con la natura (R), Conoscenza delle leggende.
- **6° livello**: Alleato planare, Creare non morti, Creare Omuncolo, Disperdere, Parola del ritiro.
- **7° livello**: Spostamento planare, Teletrasporto.
- **8° livello**: Clone.
- **9° livello**: Desiderio.


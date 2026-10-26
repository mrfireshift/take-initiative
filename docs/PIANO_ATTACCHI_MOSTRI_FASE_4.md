# Attacchi dei mostri — fase 4: import completo dello statblock (piano)

Stato: **in corso dal 26/10/2026**, lotti 1 e 2 implementati.

Indicazione dell'utente all'avvio: **i token con lo stesso nome devono avere lo stesso statblock.** Salvare la scheda di un mostro copia quindi il suo statblock sugli omonimi (lotto 1); il nome resta da rinominare solo sul token aperto (D2). D1 confermata con il lotto 1; D2 e D3 confermate con il lotto 2 (nome solo sul token aperto, PF sostituiti tranne se il token è ferito); D4–D6 restano da confermare.

## Deviazioni dal piano emerse in implementazione

- **Lotto 1, sostituzione.** `src/monsterStatblockShareCore.js`: con uno statblock di un mostro le sezioni a elenco partono su **Sostituisci**; una sezione dello statblock spuntata si svuota prima di essere scritta, una che il nuovo blocco non ha si svuota, una che il GM toglie resta. Le azioni rapide (⚡) non sono toccate.
- **Lotto 1, omonimi.** A ogni **Salva** della scheda di un mostro (importato o modificato a mano) lo statblock va alle altre creature con lo stesso nome, mai a un personaggio: CA, velocità, percezione, CD e bonus degli incantesimi, note, azioni (anche ⚡), tiri salvezza, caratteristiche, difese, libro degli incantesimi, classi, profilo del mostro. Restano del token: PF, condizioni, indebolimento, usi e ricariche, identità. Un omonimo che ha già lo stesso statblock non si riscrive. Nel banco: drago d'argento e poi goblin su un goblin, l'altro goblin segue entrambe le volte, i suoi PF intatti, nulla del drago rimasto.


Richiesta dell'utente (26/10/2026), dopo la prova delle fasi 2 e 3: l'import
è ancora grezzo.

1. Importare uno statblock **non sostituisce** quello che la scheda aveva.
2. Manca lo **spellcasting**.
3. Manca la **modellazione delle capacità** (tratti, reazioni, leggendarie).
4. Opzioni per importare anche il **ritratto** (se c'è ed è facile), il
   **nome** del mostro e i **PF**, in automatico.

La fase 4 assorbe il lotto 4 della fase 2 (azioni e resistenze leggendarie) e
anticipa il suo lotto 5 (testo completo dello statblock). Il lotto 6 della
fase 3 (statblock 2024 opzionali) e il lotto 5 (documentazione) restano dopo.

## Cosa c'è da usare (verificato il 26/10)

- **Incantesimi nel JSON di 5eTools** (Manuale dei Mostri 2014: 87 blocchi):
  - incantatori a slot (26): «The mage is a 9th-level spellcaster… spell save
    {@dc 14}, {@hit 6} to hit… wizard spells prepared», con gli incantesimi e
    gli slot per livello (`spells: { "1": { slots: 4, spells: [...] } }`);
  - innati (53): «at will» (`will`) e «X/day each» (`daily: { "1e": [...] }`).
  - Nel plugin: CD e bonus degli incantesimi esistono già sulla scheda
    (`spellSaveDC`, `spellAttackBonus`); il libro degli incantesimi
    (`spellbook`) dà alla console le schede Trucchetti e Incantesimi; gli slot
    li calcola il plugin dalle classi (`characterBuild`); un incantesimo con usi
    propri o gratuito è un'azione rapida (costo «Usi propri» / «Gratuito»).
  - I nomi inglesi si risolvono già con il catalogo (Fire Bolt, Fireball,
    Dancing Lights…); i pochi che non tornano (Melf's Acid Arrow → Acid Arrow)
    vanno in rosso o in una piccola tabella di alias.
- **Tratti**: i più comuni nel Manuale dei Mostri sono Magic Resistance (65),
  Amphibious (36), Legendary Resistance (3/Day) (28), Shapechanger, False
  Appearance, Magic Weapons, Pack Tactics, Spider Climb, Sunlight Sensitivity,
  Regeneration (13)… Quasi tutti sono testo da leggere al tavolo; le
  resistenze e le azioni leggendarie hanno già i loro contatori nel tracker
  (`meta.legendaryResistances`, `meta.legendary`).
- **Ritratto**: il ritratto della carta del tracker è l'immagine del token. Le
  immagini dei token di 5eTools stanno in un mirror separato
  (`…/5etools-img/main/bestiary/tokens/<libro>/<nome>.webp`, verificato: 200,
  WebP da circa 100 KB, con `Access-Control-Allow-Origin: *`); i 450 mostri
  del Manuale dei Mostri hanno tutti `hasToken`.
- **Nome**: il tracker rinomina già un token (doppio clic sul nome), anche
  l'etichetta sotto il token.
- **Lotto 2.** «Rinomina il token in «…»» compare solo se il nome cambia e scrive nome ed etichetta come il doppio clic del tracker (`src/tokenNameCore.js`). Dopo **Salva** l'ordine è: scheda, nome, PF, statblock agli omonimi; così gli omonimi sono quelli del nome nuovo, per i PF come per lo statblock. «Sostituisci i PF attuali» è spuntata tranne se il token è ferito (PF sotto il massimo); «Anche agli altri token con lo stesso nome» è spuntata e non tocca mai un omonimo ferito, anche con «Sostituisci». Le due caselle principali (nome, PF) si ricordano in questo browser.

## Lotti

### Lotto 1 — lo statblock sostituisce quello di prima ✅

- Con uno statblock di un mostro (non con una scheda PG) le sezioni a elenco
  partono su **Sostituisci** e applicare sostituisce l'intero statblock:
  attacchi, multiattacco, note, difese, tiri salvezza e caratteristiche che il
  nuovo blocco non ha si svuotano; il profilo del mostro prende fonte e
  riferimento nuovi. Le parti della scheda che non vengono dallo statblock
  (classi di un PG, specie) restano.
- Test: un goblin importato sopra un drago non tiene nulla del drago.

### Lotto 2 — nome e PF automatici ✅

- Nel pannello Importa, per uno statblock, due caselle ricordate in questo
  browser:
  - **Rinomina il token in «Snowy Owlbear»** (spuntata): con lo stesso
    percorso del doppio clic sul nome, etichetta compresa; solo questo token.
  - **PF dallo statblock** (spuntata), con **Sostituisci i PF attuali** spuntata
    di default (vedi D3).
- PF e nome si scrivono dopo **Salva**, come i PF di oggi.

### Lotto 3 — ritratto (facoltativo) ⚠️ immagine del token

- Casella **Usa il ritratto di 5eTools** (spenta di default), solo se il
  mostro ha `hasToken` e c'è l'indirizzo delle immagini (seconda opzione
  **Immagini 5eTools**, vuota come quella dei dati; vedi D4).
- Cambia l'immagine del token mantenendo la sua dimensione sulla mappa (la
  griglia dell'immagine si ricalcola sul nuovo file), con la Cronologia.
- Rischio: le barre PF e le etichette sono attaccate al token; si verifica che
  seguano la nuova immagine.

### Lotto 4 — incantesimi

- CD e bonus del blocco «Spellcasting» → `spellSaveDC` e `spellAttackBonus`.
- Incantatore a slot: «Nth-level spellcaster… <classe> spells» → classe e
  livello sulla scheda, con le capacità della classe **spente**, così gli slot
  li tiene il plugin come per un PG (D5); gli incantesimi nel libro, preparati.
- Innati: «at will» → azioni rapide gratuite; «X/day each» → azioni rapide con
  X usi propri (tornano al riposo lungo) (D6).
- Nomi non trovati in rosso; alias per le differenze note.

### Lotto 5 — capacità e leggendarie ⚠️ metadata del token

- Testo completo dello statblock (tratti, reazioni, azioni leggendarie, tana)
  nella memoria locale del GM, con il riferimento `nome|libro` sulla scheda;
  per i libri dell'archivio c'è già.
- Nella console, scheda **Capacità** del mostro: tratti, reazioni e azioni
  leggendarie come voci da leggere, con il loro testo nei Dettagli.
- «Legendary Resistance (N/Day)» e le azioni leggendarie (3 di default)
  impostano i contatori del menu **Leggendario** (`meta.legendaryResistances`,
  `meta.legendary`), con il coordinatore e la Cronologia, solo se il token non
  li ha già.

### Lotto 6 — documentazione

- `docs/IMPORT_SCHEDA.md`, `docs/GUIDA_UTENTE.md`, `BACKLOG.md`.

## Decisioni da confermare

1. **D1 — sostituzione.** Lo statblock di un mostro sostituisce l'intero
   statblock precedente (raccomandato), oppure solo gli attacchi.
2. **D2 — nome.** Il token prende il nome del mostro, solo il token aperto
   (raccomandato), oppure anche gli omonimi.
3. **D3 — PF.** Sostituiti di default tranne se il token è ferito (PF attuali
   sotto i massimi: un mostro in combattimento resta com'è) (raccomandato),
   oppure sempre.
4. **D4 — ritratto.** Cambia l'immagine del token, quindi mappa e tracker
   (raccomandato: è l'unico ritratto che il tracker ha), oppure niente
   ritratto per ora.
5. **D5 — slot degli incantatori.** Classe e livello dedotti dallo statblock,
   capacità di classe spente (raccomandato), oppure incantesimi senza slot.
6. **D6 — innati.** Azioni rapide (⚡) con usi propri o gratuite (raccomandato),
   oppure solo nel libro.

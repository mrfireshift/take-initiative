# Piano di lavoro — Compendio delle regole, fase 2 (pacchetti privati)

Obiettivo: portare nell'Enciclopedia DM le regole del Manuale del Giocatore, della Guida del DM, di Xanathar e di Tasha che non sono nell'SRD, divise per argomento come in fase 1. Lo strumento è un **pacchetto privato** che il GM importa nel proprio browser e che non entra mai nel bundle né nel repository. Nello stesso pacchetto vanno anche i testi degli incantesimi dei supplementi, che oggi sono pubblici.

Stato (28/10/2026): P1–P4 chiusi. Incantesimi, capacità di classe, tabella della Magia selvaggia, descrizioni delle classi e delle sottoclassi e statblock di Tasha sono usciti dal repo e dal bundle; `npm run check:private-texts` non trova più testi dei manuali, a parte frasi brevi e generiche (meno di 70 sequenze di 12 parole per file) nei promemoria del plugin e in qualche test. P5 avviato: Xanathar ha 160 voci di regole nel suo pacchetto (talenti razziali, regole varie, competenze negli strumenti, chiarimenti sugli incantesimi, composizione degli incontri, trappole, attività fuori servizio; 19 tabelle ricostruite, le altre restano come righe). P6 chiuso: filtro per fonte nella scheda Regole. P7 chiuso: Tasha ha 182 voci di regole (personalizzare le origini, talenti, patroni del gruppo, sessione zero, seguaci, parlamentare con i mostri, pericoli ambientali e regioni soprannaturali, fenomeni magici, pericoli naturali, rompicapi), con il testo riparato da `repair-ocr-text.mjs` e 10 tabelle d100 ricostruite. P8 chiuso: il Manuale del Giocatore ha 125 voci di regole (dettagli e caratteristiche personali, i 13 background con le varianti, equipaggiamento di partenza, taglie dell'equipaggiamento, stile di vita e oggetti insoliti, i 42 talenti, attività durante il viaggio, interazioni sociali, griglia e descrizione dei danni). Il testo viene dall'OCR di Tesseract (D5, installato il 27/10), letto una colonna alla volta, con 480 righe di tabelle a dado ricostruite. Il 28/10 il testo delle regole di Tasha, Xanathar e Manuale è passato di nuovo da `repair-ocr-text.mjs`, ora con il dizionario italiano di Tesseract, la correzione delle lettere scambiate e la separazione delle parole incollate: le parole spezzate nelle regole di Tasha sono scese da 348 a 6. Il 30/10 le tabelle che i PDF davano come righe sono diventate tabelle: 10 nel Manuale, 45 in Xanathar e 59 in Tasha (tabelle a dado ricavate dal testo, ruoli dei patroni, griglie dei mostri multipli, trappole, seguaci e prezzi trascritti dalle immagini delle pagine); restano come testo i rompicapi di Tasha e due tabelle di Xanathar intrecciate con il testo vicino. Restano P9 (Guida del DM), D4 (PDF della Guida del DM) e D1: rendere privato il repository, che nella storia git conserva i testi.

Base: [fase 1](PIANO_COMPENDIO_REGOLE_FASE_1.md) (compendio SRD, scheda Regole, ricerca) e l'archivio locale di 5eTools (`src/fiveToolsArchiveStore.js`), che fa già la stessa cosa per gli statblock dei mostri.

## Indice

1. [Cosa c'è oggi di non SRD nel progetto](#1-cosa-cè-oggi-di-non-srd-nel-progetto)
2. [Decisioni da prendere prima di iniziare](#2-decisioni-da-prendere-prima-di-iniziare)
3. [Le fonti: stato dei PDF](#3-le-fonti-stato-dei-pdf)
4. [Contenuto per manuale](#4-contenuto-per-manuale)
5. [Il pacchetto privato](#5-il-pacchetto-privato)
6. [Lotti](#6-lotti)
7. [Obiettivi misurabili](#7-obiettivi-misurabili)
8. [Regole valide per ogni lotto](#8-regole-valide-per-ogni-lotto)
9. [Rischi](#9-rischi)

---

## 1. Cosa c'è oggi di non SRD nel progetto

Verificato il 27/10/2026. Il repository `mrfireshift/take-initiative` è **pubblico** su GitHub. Quindi questi testi si leggono sia nel bundle sia nel codice sorgente e nella storia git, non soltanto nel plugin installato.

| Dove | Cosa | Peso del testo | Nel bundle |
|---|---|---|---|
| `src/spells-supplements-runtime.json`, `src/spells-supplements-2014.json` | Descrizione e livelli superiori di 116 incantesimi di Xanathar e Tasha | ~133.000 caratteri | sì, in `spells-srd-*.js` |
| `src/spells-phb2014-extra.json` | 41 incantesimi del Manuale del Giocatore che non sono nell'SRD | ~45.000 caratteri | sì |
| `src/class-features-descriptions.json` | Testo delle capacità: Tasha 104.000, Xanathar 105.000, Ranger UA 15.000 caratteri; per il Manuale del Giocatore 157.000, in parte SRD e in parte no | ~380.000 caratteri | sì, caricato dalla scheda personaggio |
| `data/class-features/*_database_finale.json`, `*_livello_meccanico_*.json`, audit | Database di partenza delle capacità, con testo | diversi MB | no |
| `src/speciesCatalog*.js` | Tratti delle specie: sono riassunti scritti per il plugin, non testo dei manuali | — | sì |

Gli incantesimi e le capacità usano solo nome, livello, durata, gittata e campi meccanici per automatizzare. Il testo serve solo a mostrarlo all'utente, quindi si può staccare senza perdere automazioni.

## 2. Decisioni da prendere prima di iniziare

| # | Domanda | Proposta |
|---|---|---|
| **D1** | La storia git pubblica contiene già i testi. Cosa ne facciamo? | **Decisa il 27/10: rendere privato il repository.** Render è collegato tramite l'account GitHub, quindi continua a compilare anche dal repo privato. Il cambio lo fa l'utente da GitHub (Settings › Danger Zone › Change visibility). **Rendere privato il repository**, se l'hosting del bundle non dipende dal fatto che sia pubblico. L'alternativa è riscrivere la storia (`git filter-repo` e push forzato): è un'operazione distruttiva per gli altri worktree e le altre sessioni, e la sconsiglio. Togliere i testi solo dall'ultima versione li lascia comunque leggibili nei commit vecchi. |
| **D2** | Dove viene servito il plugin? | **Risolta il 27/10**: `https://take-initiative.onrender.com/manifest.json`. Render costruisce il bundle partendo dal repo: il suo `build-info.json` riporta il commit `d4531c6` del 26/10, cioè un commit compilato da Render stesso, non il `dist` committato. Prima di applicare D1 va controllato nella dashboard di Render (Settings › Build & Deploy › Repository) che il servizio sia collegato tramite l'account GitHub, che vede anche i repo privati, e non tramite l'URL di un repo pubblico. Dal 26/10 sono arrivati su main 47 commit che Render non ha pubblicato: l'auto-deploy sembra spento. |
| **D3** | Spostare nel pacchetto anche i testi delle capacità di classe di Tasha, Xanathar, Ranger UA e delle sottoclassi del Manuale del Giocatore che non sono nell'SRD? | **Decisa il 27/10: sì**, con lo stesso meccanismo. Altrimenti restano pubblici circa 300.000 caratteri. È il lotto più pesante (P3), perché il generatore delle capacità legge i database che contengono testo. |
| **D4** | Guida del DM: in `L:\Dungeons & Dragons\Manuali` non c'è | Mi serve il PDF italiano della **Guida del Dungeon Master** 2014. Senza, la fase 2 copre solo Manuale del Giocatore, Xanathar e Tasha. |
| **D5** | Il PDF italiano del Manuale del Giocatore ha un livello di testo illeggibile (font codificato) | **Decisa il 27/10: OCR con Tesseract** e il modello italiano, installato con `winget`. L'alternativa è leggere le pagine come immagini, che è più lento e costoso. |
| **D6** | Le voci private stanno negli stessi argomenti dell'SRD o in argomenti a parte per manuale? | **Negli stessi argomenti**, con un badge della fonte (PHB, DMG, XGE, TCE) e un filtro per fonte. Era la richiesta iniziale: «divise per argomenti». |
| **D7** | Dove si importa il pacchetto? | **Nell'Enciclopedia**, con un bottone **Pacchetti** accanto al titolo: elenco, importa, rimuovi. La scheda personaggio dice soltanto «importa il pacchetto di Xanathar per leggere il testo». |
| **D8** | Dove stanno i sorgenti privati (indici dei contenuti con le tabelle, testi estratti, pacchetti generati)? | **Fuori dal repository**, in `L:\Dungeons & Dragons\Take Initiative\` accanto ai PDF. Nel repo restano solo gli script generici e i test su dati inventati. |

## 3. Le fonti: stato dei PDF

Controllati con `pdftotext` il 27/10/2026.

| Manuale | File | Livello di testo | Lavoro in più |
|---|---|---|---|
| Manuale del Giocatore (IT) | `Manuale del giocatore.pdf` | **Illeggibile**: font codificato, escono simboli | OCR completo delle pagine in scope (D5) |
| Guida del DM (IT) | — | **Manca** | D4 |
| Xanathar (IT) | `Guida Omnicomprensiva di Xanathar 5e.pdf` | OCR presente con errori tipici (`ld10` al posto di `1d10`) | Tabella di correzioni, controlli a campione |
| Tasha (IT) | `Calderone Omnicomprensivo di Tasha.pdf` | OCR presente con parole spezzate («s uoi», «clie nti») | Ricucitura delle parole con un dizionario, controlli a campione |

Il controllo di fase 1 (le parole di ogni voce sono le parole del PDF) garantisce fedeltà all'estrazione, non al libro. Con un testo da OCR serve anche una **lista di correzioni verificate**, come `TEXT_CORRECTIONS` in `restore-srd-text-structure.mjs`, e una revisione tua per ogni manuale.

## 4. Contenuto per manuale

Solo regole, come in fase 1. Restano fuori oggetti magici, mostri, avventure e testo descrittivo del mondo.

| Manuale | Parti | Parole circa | Argomenti in cui confluiscono |
|---|---|---|---|
| Manuale del Giocatore | Talenti (cap. 6), background (cap. 4), le regole dei cap. 5–10 che non sono nell'SRD | 15.000–20.000 | Personaggio, Equipaggiamento |
| Guida del DM | Cap. 5 (ambienti d'avventura), cap. 6 (tra un'avventura e l'altra), cap. 8 (condurre il gioco), cap. 9 (regole opzionali) | 80.000–110.000 | Avventura, Combattimento, Strumenti del DM, nuovo argomento **Regole opzionali** |
| Xanathar | Cap. 2 (strumenti del DM), talenti razziali | ~30.000 | Avventura, Strumenti del DM, Personaggio |
| Tasha | Cap. 1 (origine personalizzata, talenti), cap. 4 (strumenti del DM) | 25.000–30.000 | Personaggio, Avventura, Strumenti del DM |
| Incantesimi | 116 di Xanathar e Tasha, 41 del Manuale del Giocatore | ~180.000 caratteri | schede Incantesimi e personaggio |
| Capacità (D3) | Sottoclassi di Tasha, Xanathar, Ranger UA e quelle non SRD del Manuale del Giocatore | ~300.000 caratteri | scheda personaggio |

## 5. Il pacchetto privato

### Formato

Un file JSON per manuale, generato in locale dai PDF:

```json
{
  "format": "take-initiative/private-pack",
  "schemaVersion": 1,
  "id": "xanathar",
  "title": "Guida Omnicomprensiva di Xanathar",
  "badge": "XGE",
  "generatedAt": "AAAA-MM-GG",
  "rules": { "topics": [], "entries": [] },
  "spells": { "xanathar-abilita-potenziata": { "description": "…", "higherLevels": "" } },
  "classFeatures": { "<id capacità>": "…" }
}
```

- `rules` usa lo stesso schema di `src/rules-reference-it.json`. Gli `id` dei topic sono quelli SRD (`combattimento`, `strumenti-del-dm`…) più quelli nuovi, così le voci finiscono negli stessi argomenti (D6).
- `spells` e `classFeatures` usano gli id che il plugin già conosce. La meccanica resta nel bundle, solo il testo arriva dal pacchetto.

### Archivio nel browser

- **Modulo:** `src/privatePackStore.js`, sullo schema di `fiveToolsArchiveStore.js`.
- **Database:** `${ID}.private-packs`, con un archivio di metadati (`packInfo`: titolo, data, dimensione, numero di voci) e uno dei dati (`packData`).
- **Validazione:** `privatePackCore.js` controlla formato, versione e id prima di salvare.
- **Fallback:** se IndexedDB non è disponibile, il pacchetto resta solo per la sessione, e l'interfaccia lo dice come fa già l'archivio di 5eTools.
- **Condivisione:** niente metadata, niente broadcast, niente scena. La scheda personaggio, la console attacchi e l'Enciclopedia leggono dallo stesso database, perché i popover del plugin condividono l'origine.

### Chi legge il pacchetto

| Consumatore | Oggi | Dopo |
|---|---|---|
| Scheda Regole | `rules-reference-it.json` | SRD unito ai pacchetti importati, indice ricostruito quando cambiano |
| Scheda Incantesimi, scheda personaggio, console attacchi, card (`spellbookSpellDetails`) | testo da `italianReference` nel bundle | testo SRD dal bundle, testo dei supplementi dal pacchetto; senza pacchetto «Testo nel pacchetto di Xanathar: importalo dall'Enciclopedia» |
| Capacità (`classFeatureDescription`) | `class-features-descriptions.json` | testo SRD dal bundle, il resto dal pacchetto (D3) |

## 6. Lotti

| Lotto | Contenuto | Dipende da | Sessioni |
|---|---|---|---|
| **P0** | Decisioni D1–D8, hosting, PDF della Guida del DM, installazione di Tesseract | — | tu |
| **P1** | `privatePackCore.js` (formato, validazione, unione con l'SRD), `privatePackStore.js` (IndexedDB), pannello **Pacchetti** nell'Enciclopedia; test con un pacchetto inventato | — | 1–2 |
| **P2** | Incantesimi: i generatori scrivono la meccanica nel repo e il testo in un sorgente privato; `spells-srd.js`, `spellbookCatalog.js` e l'Enciclopedia leggono il testo dal pacchetto; costruttore del pacchetto per gli incantesimi; test aggiornati | P1 | 2 |
| **P3** | Capacità (D3): separare il testo dai database in `data/class-features`, capire quali capacità del Manuale del Giocatore sono SRD (stesso confronto col PDF SRD di `restore-srd-text-structure.mjs`), generatore e lettura dal pacchetto | P1 | 2–3 |
| **P4** | Pulizia: test di guardia che fa fallire la CI se un file tracciato contiene testo non SRD; D1 applicata; bundle nuovo; verifica che nel bundle non resti nessuna frase dei supplementi | P2, P3 | 1 |
| **P5** | Costruttore dei pacchetti di regole: generalizzare `generate-srd-rules-reference.mjs` (fonte, indice e uscita configurabili, correzioni da OCR) e fare il primo manuale, **Xanathar** (testo già estraibile) | P1 | 2 |
| **P6** | Unione nell'Enciclopedia: badge della fonte, filtro per fonte, ricerca sul catalogo unito, voci senza pacchetto mai mostrate vuote | P1, P5 | 1–2 |
| **P7** | Tasha | P5 | 1–2 |
| **P8** | Manuale del Giocatore (con OCR) | P5, D5 | 2 |
| **P9** | Guida del DM: il manuale più grande | P5, D4 | 3–5 |

L'ordine chiude prima l'esposizione (P1–P4), poi aggiunge i contenuti (P5–P9). P1 e P5 possono andare in parallelo perché toccano file diversi.

### P2 nel dettaglio

- `generate-supplement-spell-catalog.mjs` e `generate-phb2014-extra-catalog.mjs` scrivono nel repo solo i campi meccanici (`description` e `higherLevels` spariscono da `src/spells-supplements-runtime.json` e `src/spells-phb2014-extra.json`). Il testo va in un file privato che il costruttore del pacchetto legge (D8).
- `src/spells-supplements-2014.json`, che contiene il catalogo completo con il testo, esce dal repo.
- `supplementRuntimeSpell` e `phb2014ExtraRuntimeSpell` in `spells-srd.js` costruiscono `italianReference` senza testo. `spellReference()` in `spellbookCatalog.js` cerca il testo prima nel bundle SRD, poi nel pacchetto.
- I test che leggono le descrizioni (`supplementSpellCatalog.test.js`, `phb2014ExtraSpellCatalog.test.js`, `rulesText.test.js`) passano a fixture inventate.

## 7. Obiettivi misurabili

| Misura | Oggi | Obiettivo |
|---|---|---|
| Frasi di Xanathar, Tasha e del Manuale del Giocatore (non SRD) nel bundle | 157 incantesimi, centinaia di capacità | **0**, verificato da un test sul `dist` |
| File tracciati con testo non SRD | ~10 | **0**, con un test di guardia in CI |
| Automazioni degli incantesimi e delle capacità | tutte | **invariate**: la suite di test resta verde senza pacchetti |
| Importare un pacchetto | — | **1 clic + file**, resta dopo il riavvio del browser |
| Voci di regole con tutti i pacchetti | 243 | **circa 600–750** |
| Ricerca sul catalogo unito | < 1 ms | **< 16 ms** |

## 8. Regole valide per ogni lotto

- Nessun testo dei manuali entra in un file tracciato, in un test, in un commit, nel piano o negli alias. Nei test si usano testi inventati.
- I sorgenti privati e i pacchetti generati stanno fuori dal repo (D8). Il `.gitignore` copre comunque `*.private-pack.json`.
- Nessun metadata della scena o della stanza e nessun broadcast: il pacchetto è locale al browser del GM.
- Si toglie il testo, mai la meccanica. Ogni lotto finisce con la suite completa verde **senza** pacchetti importati.
- Commit con solo i propri file. Bundle costruito da un worktree pulito.

## 9. Rischi

| Rischio | Effetto | Contromisura |
|---|---|---|
| D1 non applicata | I testi restano leggibili nella storia del repo pubblico | Repo privato, o riscrittura della storia solo con il tuo via libera esplicito |
| Hosting legato al repo pubblico | Rendere privato il repo rompe l'installazione in Owlbear | D2 prima di D1 |
| Errori dell'OCR | Numeri sbagliati nelle regole («ld10») | Correzioni esplicite, controllo dei dadi e dei numeri, tua revisione per manuale |
| Generatore delle capacità che dipende dal testo | P3 rompe `npm run generate:class-features` | Separare testo e meccanica nei database prima di toccare il generatore; confronto del runtime generato prima e dopo, che deve restare identico tranne il testo |
| Browser del tavolo senza pacchetto (finestra in incognito dei giocatori) | Nessuno, se è il GM a leggere | I giocatori non aprono l'Enciclopedia; la scheda mostra il messaggio «importa il pacchetto» |
| Pacchetto perso (dati del sito cancellati) | Testi spariti | Il file del pacchetto resta in `L:\…`: si reimporta con un clic |

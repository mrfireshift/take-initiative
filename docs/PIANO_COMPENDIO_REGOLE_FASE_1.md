# Piano di lavoro — Compendio delle regole, fase 1 (SRD 5.1 italiano)

Obiettivo: una terza scheda **Regole** nell'Enciclopedia DM con le regole dell'SRD 5.1 italiano divise per argomento, scaricate solo quando la scheda si apre e cercabili con un indice costruito una volta sola.

Fuori da questa fase: il testo di Manuale del Giocatore, Guida del DM, Xanathar e Tasha che non è nell'SRD (fase 2, pacchetto privato importato in locale), gli oggetti magici, i mostri, le razze e le classi (le capacità di classe hanno già il loro catalogo).

## Indice

1. [Obiettivi misurabili](#1-obiettivi-misurabili)
2. [Decisioni da prendere prima di iniziare](#2-decisioni-da-prendere-prima-di-iniziare)
3. [Contenuto: cosa entra dall'SRD](#3-contenuto-cosa-entra-dallsrd)
4. [Formato dei dati](#4-formato-dei-dati)
5. [Lotti](#5-lotti)
6. [Regole valide per ogni lotto](#6-regole-valide-per-ogni-lotto)
7. [Rischi](#7-rischi)

---

## 1. Obiettivi misurabili

| Misura | Oggi | Obiettivo |
|---|---|---|
| JS caricato all'apertura dell'Enciclopedia | ~875 KB (incantesimi caricati subito) | **non cresce**; con D4 **< 60 KB** |
| Chunk delle regole, scaricato alla prima apertura della scheda | — | **≤ 400 KB grezzi, ≤ 120 KB gzip** |
| Lettura dei dati + costruzione dell'indice | — | **< 100 ms** sul portatile del tavolo |
| Costo di una ricerca sull'intero compendio | — | **< 16 ms** (misurato da un test Node) |
| `lottare` | — | primo risultato **Lottare** |
| `afferrare` | — | trova **Lottare** (alias) |
| `cop` | — | **Copertura** tra i primi 3 |
| `riposo breve` | — | primo risultato **Riposo breve** (tutte le parole devono comparire) |
| Scritture in metadata, broadcast, `initiativeList.js` | — | **zero** |

## 2. Decisioni da prendere prima di iniziare

| # | Domanda | Proposta |
|---|---|---|
| D1 | Quanto è grande una voce? | **Una sottosezione** (Lottare, Copertura, Riposo breve), con il capitolo come argomento e la sezione come gruppo. Circa 180–230 voci. |
| D2 | Tabelle di equipaggiamento e prezzi (pp. 67–83, circa 25 tabelle) | **Sì a armature, armi, proprietà delle armi, capienza e cavalcature; no ai listini di merci, stile di vita, vitto e servizi** nella prima consegna. Le tabelle sono il lavoro manuale più lungo. |
| D3 | Appendice B (divinità) e C (piani), talento Lottatore, background Accolito | **Fuori.** Non sono regole che si consultano al tavolo durante il gioco. |
| D4 | Rendere asincrona anche la scheda Incantesimi | **Sì**: oggi aprire l'Enciclopedia sulle Condizioni scarica ~875 KB di incantesimi. Con il caricamento a richiesta l'apertura si alleggerisce senza cambiare cosa si vede. |
| D5 | Dimensione del popover (oggi 680×650) | **Invariata.** L'albero degli argomenti sta nella colonna di sinistra da 190 px; si rivede dopo averlo visto sul banco. |

## 3. Contenuto: cosa entra dall'SRD

Fonte: `SRD_CC_v5.1_IT.pdf` (URL ufficiale in `THIRD_PARTY_NOTICES.md`), letto con `pdftotext -enc UTF-8` in modalità predefinita come già fa `scripts/restore-srd-text-structure.mjs`: ogni paragrafo del PDF diventa una riga.

| Argomento | Pagine SRD | Parole | Sezioni principali |
|---|---|---|---|
| Personaggio | 59–65 | ~4.000 | Avanzamento, Multiclasse, Allineamento, Linguaggi, Ispirazione, Personalizzare un background |
| Equipaggiamento | 67–83 | ~10.500 | Moneta, Armature, Armi e proprietà, Equipaggiamento d'avventura, Strumenti, Cavalcature e veicoli (listini secondo D2) |
| Caratteristiche | 84–93 | ~9.000 | Vantaggio e svantaggio, Prove, CD tipiche, Contese, Abilità, Prove passive, Collaborare, Prove di gruppo, Sollevamento e trasporto, Nascondersi, Tiri salvezza |
| Avventura | 94–101 | ~5.000 | Tempo, Passo di viaggio, Terreno difficile, Nuotare/scalare/saltare, Cadute, Soffocamento, Visione e illuminazione, Cibo e acqua, Riposo breve e lungo, Attività fuori servizio |
| Combattimento | 101–113 | ~8.200 | Sorpresa, Iniziativa, Azioni bonus, Reazioni, Movimento e posizione, Taglia e spazio, Azioni in combattimento, Attacchi, Attacchi di opportunità, Due armi, Lottare, Spingere, Copertura, Danni e guarigione, Tiri salvezza contro morte, In sella, Sott'acqua |
| Magia | 113–119 | ~4.500 | Livello e slot, Trucchetti, Rituali, Tempo di lancio, Gittata, Componenti, Durata, Concentrazione, Bersagli, Aree di effetto, Combinare gli effetti magici |
| Strumenti del DM | 222–233 | ~6.900 | Trappole (regole ed esempi), Malattie, Follia, Oggetti (CA e PF), Veleni |

Totale: circa 48.000 parole, 300–350 KB di JSON, 90–110 KB gzip. Le liste degli incantesimi per classe (pp. 119–128) restano fuori: sono un filtro della scheda Incantesimi, non una regola. L'Appendice A (Condizioni) resta nella sua scheda e le regole la richiamano con «Vedi anche».

## 4. Formato dei dati

### Schema del file generato `src/rules-reference-it.json`

```json
{
  "schemaVersion": 1,
  "language": "it",
  "ruleset": "D&D 5e SRD 5.1 (2014)",
  "source": "https://media.wizards.com/2023/downloads/dnd/SRD_CC_v5.1_IT.pdf",
  "license": "CC-BY-4.0",
  "generatedAt": "AAAA-MM-GG",
  "topics": [
    { "id": "combattimento", "name": "Combattimento", "sections": [
      { "id": "effettuare-un-attacco", "name": "Effettuare un attacco" }
    ] }
  ],
  "entries": [
    {
      "id": "lottare",
      "topic": "combattimento",
      "section": "effettuare-un-attacco",
      "name": "Lottare",
      "page": 108,
      "text": "Paragrafi, elenchi «• » e tabelle « | », come in rulesTextCore.js",
      "aliases": ["afferrare", "presa"],
      "related": ["contese-in-combattimento", "condition:Afferrato"],
      "optional": false
    }
  ]
}
```

- `text` usa il formato che `rulesTextCore.js` sa già disegnare: righe vuote tra i paragrafi, `• ` per gli elenchi, ` | ` tra le celle.
- `related` punta a voci di regole per `id` o a condizioni con `condition:<Nome>`.
- `optional: true` segna le varianti (es. «Variante: ingombro», p. 90) e mostra l'etichetta **Regola opzionale**.

### Indice dei contenuti scritto a mano: `scripts/srd-rules-outline-it.json`

`pdftotext` non dice se una riga è un titolo di capitolo, di sezione o di voce. Per questo l'indice dei contenuti viene scritto a mano una volta e messo in git: per ogni voce titolo, livello, pagina di partenza, alias, voci collegate, `optional`. Lo stesso file contiene anche le tabelle ricostruite (stessa forma di `TABLES` in `restore-srd-text-structure.mjs`) e le correzioni di parole spezzate dall'estrazione.

### Generatore `scripts/generate-srd-rules-reference.mjs`

```
pdftotext -enc UTF-8 SRD_CC_v5.1_IT.pdf srd-it.txt
node scripts/generate-srd-rules-reference.mjs --pdf-text=srd-it.txt
```

1. Toglie i piè di pagina («Rivendita vietata… Systems Reference Document 5.1 N») e i salti pagina, tenendo il numero di pagina di ogni riga.
2. Riunisce i paragrafi spezzati da colonna o pagina: una riga che non finisce con la punteggiatura e una riga successiva che comincia in minuscolo.
3. Taglia il testo ai titoli dell'indice, nell'ordine dato. Si ferma con un errore se un titolo manca o compare due volte nel suo intervallo di pagine.
4. Sostituisce le tabelle con le loro righe ricostruite, verificando che le parole siano le stesse e nello stesso ordine.
5. **Controllo di conservazione**: le parole di tutte le voci, più quelle dei titoli e delle parti escluse, devono essere esattamente le parole delle pagine in scope. Se no, il file non viene scritto.
6. Stampa un rapporto: voci per argomento, parole, tabelle, voci senza alias.

Si aggiunge allo `package.json` come `generate:rules-reference`.

## 5. Lotti

| Lotto | Contenuto | File | Sessioni | Può partire |
|---|---|---|---|---|
| R1 | Indice dei contenuti, generatore, dati, test di integrità | nuovi: `scripts/generate-srd-rules-reference.mjs`, `scripts/srd-rules-outline-it.json`, `src/rules-reference-it.json`, `test/rulesReferenceCatalog.test.js`; `package.json` | 2–3 | **subito** |
| R2 | Core di ricerca e albero, senza DOM | nuovi: `src/rulesReferenceCore.js`, `test/rulesReferenceCore.test.js` | 1 | subito, in parallelo a R1 (usa un catalogo di prova) |
| R3 | Scheda Regole nel modale | `reference-modal.html`, `src/reference-modal.js`, `src/referencePopover.js` | 1–2 | dopo R1, R2 e **dopo il commit dell'altra sessione** che ha modifiche aperte su questi file |
| R4 | D4, documentazione e attribuzioni, build e misure | `src/reference-modal.js`, `THIRD_PARTY_NOTICES.md`, `docs/RIFERIMENTO_FUNZIONI.md`, `docs/GUIDA_UTENTE.md` | 1 | dopo R3 |

### R1 — Dati

- Scrivere l'indice dei contenuti delle pagine nella tabella del §3, secondo D1–D3.
- Ricostruire le tabelle in scope: CD tipiche, passo di viaggio, categorie di taglia, armature, armi, capienza, cavalcature, gravità dei danni delle trappole, CA e PF degli oggetti, veleni, follia temporanea/duratura/imprecisata.
- Alias in italiano per le ricerche più comuni (afferrare → Lottare, OA → Attacchi di opportunità, critico → Colpi critici, morte → Tiri salvezza contro morte, sorpreso → Sorpresa).
- `test/rulesReferenceCatalog.test.js`: id unici; ogni `topic`/`section` esiste; ogni `related` si risolve (anche `condition:` contro `CONDITION_REFERENCE`); nessun testo vuoto o con piè di pagina residui; nessuna voce oltre 6.000 caratteri (segno di un taglio mancato); `license` e `source` presenti.
- **Revisione tua**: il rapporto del generatore più un file Markdown di anteprima in scratchpad, una sezione per argomento, da sfogliare prima di R3.

### R2 — Ricerca

`src/rulesReferenceCore.js`, funzioni pure:

- `buildRulesIndex(catalog)`: una volta sola, per ogni voce nome, alias, percorso e testo già normalizzati (stessa `normalize` del modale: minuscole, senza accenti).
- `searchRules(index, query, { limit = 60 })`: parole della ricerca in AND; punteggio nome esatto > inizio del nome > nome contiene > alias > percorso > testo; a parità, ordine dell'indice dei contenuti. Restituisce `{ results, total }` per mostrare «altri N risultati».
- `rulesTree(catalog)`: argomento → sezione → voci, per l'albero.
- `resolveRelated(catalog, entry)`: le voci e le condizioni di «Vedi anche».

Test: i casi della tabella del §1, query vuota, query senza risultati, accenti («perche» trova «perché»), e una misura del costo di 200 ricerche sull'intero catalogo reale (< 16 ms in media).

### R3 — Interfaccia

- Terzo bottone **Regole** accanto a Condizioni e Incantesimi.
- Alla prima apertura della scheda: `import("./rules-reference-it.json")` in un chunk proprio, poi `buildRulesIndex`. Mentre scarica: «Caricamento delle regole…» nella colonna dei risultati. Se fallisce: messaggio e bottone Riprova.
- Colonna sinistra a ricerca vuota: albero degli argomenti, a fisarmonica, con l'argomento della voce aperta già espanso. Con la ricerca: lista piatta, ogni risultato con il percorso in piccolo (`Combattimento › Effettuare un attacco`).
- Dettaglio: percorso in alto (l'argomento è cliccabile e torna all'albero), titolo, etichetta **Regola opzionale** se serve, testo con `rulesTextBlock`, chip **Vedi anche** (una condizione apre la scheda Condizioni su quella voce), nota della fonte `D&D 5e SRD 5.1 italiano · p. 108 · CC BY 4.0`.
- Bottone **‹ Indietro** quando si arriva a una voce da «Vedi anche» (una pila che vive solo nella finestra aperta).
- La ricerca parte 120 ms dopo l'ultimo tasto, solo nella scheda Regole. Le altre due schede restano come sono.
- `referencePopover.js`: passare anche `tab=rules`, così le altre parti del plugin possono aprire una regola precisa (`openReferencePopover({ tab: "rules", entry: "lottare" })`).
- Verifica sul banco con anteprima, a 1:1, con il blocco dei reload di Vite, e nella stanza OBR reale: apertura, albero, ricerca, Vedi anche, Indietro, link diretto.

### R4 — Chiusura

- D4: anche la scheda Incantesimi carica `spells-srd.js` e `spell-reference-it.json` solo quando si apre. Il contenuto della scheda resta identico.
- `THIRD_PARTY_NOTICES.md`: aggiungere `src/rules-reference-it.json` alla sezione SRD 5.1.
- Documentazione dell'Enciclopedia in `RIFERIMENTO_FUNZIONI.md` e `GUIDA_UTENTE.md`.
- `npm test`, `npm run build` e il confronto del peso dei chunk prima e dopo con gli obiettivi del §1.

## 6. Regole valide per ogni lotto

- Non si tocca `initiativeList.js`, nessun metadata e nessun canale broadcast. Il compendio è testo statico letto solo dal GM.
- Il testo non si riscrive: si cambiano solo spazi, a capo, marcatori di elenco e tabelle, e il generatore lo verifica.
- Nel bundle entra solo testo SRD. Niente frasi da Manuale del Giocatore, Guida del DM, Xanathar o Tasha, neanche negli alias.
- Commit con solo i propri file, in un elenco esplicito. Bundle costruito da un worktree pulito se nel tree ci sono modifiche di altre sessioni.

## 7. Rischi

| Rischio | Effetto | Contromisura |
|---|---|---|
| Titoli che `pdftotext` spezza o unisce alle righe vicine | Voce tagliata male | Il generatore si ferma se un titolo dell'indice non si trova esattamente una volta; controllo di conservazione delle parole |
| Tabelle su due colonne lette riga per riga | Celle mescolate | Tabelle ricostruite a mano nell'indice, con controllo delle parole |
| Modale modificato in contemporanea da un'altra sessione | Conflitti, commit con file altrui | R3 parte solo dopo quel commit |
| Ricerca troppo generosa («vantaggio» compare ovunque) | Lista lunga e poco utile | Priorità ai titoli, limite a 60 risultati, AND tra le parole |
| Popover stretto per albero più percorso | Titoli tagliati | D5 rivista dopo la schermata dal banco |

# Audit UX e UI del pannello attacchi

Micro-audit del 04/11/2026 su `pc-attack.html` e `src/pc-attack.js`, chiesto dall'utente perché il pannello si stava riempiendo di informazioni senza gerarchia, disallineate e poco comprensibili. Schermate e proposte disegnate: [pagina dell'audit](https://claude.ai/artifact/6PEkHKtRhiHN6F64hYPBPV).

Restano fermi i colori del costo in stile Baldur's Gate, il rosso solo per il danno e niente conteggi sui tab, già decisi dall'utente.

Stato: D1-D3 approvate come consigliate il 04/11/2026. Lotto 1 fatto, gli altri da fare.

## Misure

Al banco, su 38 stati reali, nella finestra da 380×560 px.

- 19 stati con più di 40 px vuoti sotto il contenuto (mediana 130, massimo 229).
- 12 stati che scorrono, fino a 430 px di troppo con le manovre.
- Fasce fisse fino a 190 px su 560: testata 45, reazione 21, riga fissa 84, stato 40.
- Il danno parte a 245 px e il pannello finisce a 414: tre righe di danno visibili. Fuori turno con una creatura selezionata parte a 329.
- Sottotitolo tagliato in 16 stati, nome in 7.
- 30 stili di testo, 6 altezze di controllo (24, 26, 27, 28, 32, 36), 4 bordi sinistri (13, 24, 27, 56).

## Problemi

### Gerarchia

- Selettore, bersaglio, esito e danno sono riquadri uguali.
- Tab ed esito sono lo stesso controllo da 32 px.
- Titoli di sezione e sottosezione identici: `EXTRA AL COLPO` seguito da `ATTIVAZIONI`.
- Corpi a un pixel di distanza (10, 11, 12). Testi di regole lunghi a 10 px.
- Immagine speculare e Scudo occupano 5 e 3 righe in riquadri colorati a ogni attacco.

### Allineamenti

- Quattro bordi sinistri nello stesso pannello.
- Colonna vuota di 32 px davanti a «Taglienti».
- Il testo dei menu parte da punti diversi. In Lotta «Bersaglio» sta sopra il menu, nell'attacco a fianco. Due tipi di menu, disegnato e nativo.

### Spazi morti

- Finestra fissa a 560 px.
- «Pronto.» occupa 40 px sempre.
- Righe da 42 px: 12 manovre fanno 504 px.
- Riquadro del bersaglio da 50 px per un menu da 32.
- «Extra al colpo» con il solo «+ Componente» prende due righe.
- Lista Capacità alta almeno 132 px anche con due voci, e linea sopra «Dettagli» senza niente da separare.
- Fuori turno: barra da 41 px e riga da 27 px prima dei tab.

### Testi tagliati e righe a capo

- Il sottotitolo ripete il nome e perde `+14 al tiro`, la portata, la CD e la Ricarica.
- Il nome si taglia mentre `PG` e `Mostri` occupano 80 px.
- Il menu nativo del bersaglio taglia a metà lettera e nasconde i PF.
- Nelle aree i PF spariscono.
- `PROVA CONTRAPPOSTA` va a capo, con una nota su due righe a fianco.
- Ultime righe di una parola.

### Errori veri

1. `Ai livelli superiori. Ai livelli superiori.` nei dettagli di un incantesimo: `src/pc-attack.js` aggiunge il prefisso che il dato ha già (`reference-modal.js` lo toglie).
2. Azione «Trucchetti» senza `spellIds`, aperta direttamente, per un chierico che conosce solo Fiamma sacra: il selettore dice Fiamma sacra, ma testata, nota e danni sono di Dardo di fuoco. Riprodotto al banco.
3. Globo cromatico: la riga dice «Acido» mentre il menu chiede ancora il tipo e Registra è bloccato.

## Pill, badge, etichette e icone

| Elemento | Verdetto |
| --- | --- |
| `Turno` | Togliere |
| `Fuori turno` | Tenere, senza la frase ripetuta nella barra |
| `PG`, `Mostri` | Spostare nel menu ⋯ (D2) |
| `Azione` con la forma | Tenere |
| `Azione` bordata nella scheda | Togliere |
| `Res. …: 10 → 5` | Aggiungere ✕, testo più corto: `Res. taglienti non magici: 10 → 5` |
| Usi rimasti, oggi in cinque forme | Una sola: numero a destra |
| `bersaglio`, `su di sé` | `Su un bersaglio`, `Su di sé` |
| `Conc.`, `Concentrazione` | Una volta sola |
| `Leggendaria` | Togliere, resta il costo se è 2 |
| `+ Componente` | `+ Danno extra` |
| `Attivazioni` | `Manovre · Dadi 5/5` |
| `Al colpo` | `Effetto del colpo` |
| `Danno` senza danno | Nascondere |
| `TS fallito`, `TS superato` | `Fallito`, `Superato`, con il TS scritto una volta sopra |
| `Scegli il bersaglio`, tre volte | Una volta, nella riga fissa |
| `Pronto.` | Togliere |
| `Tiro per colpire` | Etichetta `Tiro` |
| `Reazione già usata…` | Solo se era già usata prima |
| Emoji delle capacità | Togliere (D3) |
| `⚔` nelle righe | Parola `Console` |
| Frecce `⌄`, `▸ ▾`, `▶ ▼` | Una sola famiglia |
| `−`, `×`, `⇄`, griglia, forme del costo | Tenere |
| Arancione e viola nei riquadri | Neutri: oggi Scudo è arancione come l'azione bonus e Immagine speculare viola come la reazione |
| Blu | Solo per selezione e azioni |
| Giallo | Solo per gli avvisi veri |

## Lotti

Tutti riguardano l'aspetto: danni, PF e registrazione non si toccano.

1. **Errori e parole.** I tre errori, le etichette, «Pronto.», i messaggi ripetuti. Fatto.
2. **Testata.** Via sottotitolo e `Turno`, dati sotto il selettore, menu ⋯, una riga sola per i cambi di creatura.
3. **Griglia e densità.** Un bordo sinistro, etichetta e controllo, righe a una linea, niente riquadri, difesa accanto al totale, menu del bersaglio con i PF a destra.
4. **Aree.** Danno prima dell'elenco, righe compatte, PF sempre visibili.
5. **Pill, icone e colori.** Una forma per gli usi, una famiglia di frecce, emoji, colori per significato, note brevi di Immagine speculare e Scudo.
6. **Altezza della finestra.** Dopo il lotto 3.
7. **Console boss.** Quello che vale anche lì: condividono `public/console-shell.css`.

## Decisioni

Approvate il 04/11/2026.

- **D1, altezza della finestra.** Segue il contenuto, cresce quando serve e non si restringe durante un attacco.
- **D2, `PG` e `Mostri`.** Nel menu ⋯ della testata.
- **D3, emoji delle capacità.** Tolte dalle righe del pannello.

## Prova in stanza del lotto 1

- [ ] **Trucchetti:** dal menu ⚔ della card apri l'azione «Trucchetti» di un PG che conosce un solo trucchetto: selettore, testata e danni dicono lo stesso.
- [ ] **Barra di stato:** con il pannello fermo non c'è. Dopo **Registra** compare con il messaggio e **Annulla**, senza coprire nulla.
- [ ] **Fuori turno:** dopo un attacco con la reazione non compare l'avviso giallo; scegliendo l'esito del colpo dopo sì.

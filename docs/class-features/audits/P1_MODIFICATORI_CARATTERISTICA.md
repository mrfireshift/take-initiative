# P1 — Modificatori di caratteristica nel profilo card (audit, 15 ottobre 2026)

Commit di partenza: `96753aa`. Primitiva P1 della Fase 3 di
[Workflow classi rimanenti](WORKFLOW_CLASSI_RIMANENTI.md).

## Stato attuale

La card salva già `savingThrows` (bonus ai TS), `spellSaveDC` e
`spellAttackBonus`, ma **non i modificatori di caratteristica**.

**Pool con massimo da formula.**
`resolveClassFeatureResourceMaximum` (`src/classFeatureCore.js:377`) risolve
solo:

- valori fissi;
- tabelle per livello;
- `N * bonus_competenza`.

Le formule con `modificatore_*` restituiscono `maximum: null`. Esiste già un
ripiego: per i pool a formula senza massimo il GM può cliccare il massimo
nella card e scriverlo a mano (`maximumEditable`,
`src/initiative-card-modal.js:882`). Il valore resta in
`state.resources[pool].maximum`. I pool quindi funzionano, ma il massimo va
inserito a mano e aggiornato a mano quando il modificatore cambia.

| Pool | Formula | Capacità che lo usano |
|---|---|---|
| `bardo-ispirazione-bardica-usi` | max(1, Car) | Ispirazione Bardica e 9 opzioni dei collegi |
| `bardo-collegio-dell-eloquenza-ispirazione-contagiosa-usi` | max(1, Car) | Ispirazione Contagiosa |
| `paladino-percezione-divino-usi` | 1 + Car | Percezione del Divino |
| `paladino-tocco-purificatore-usi` | max(1, Car) | Tocco Purificatore |
| `paladino-giuramento-di-gloria-difesa-gloriosa-usi` | max(1, Car) | Difesa Gloriosa (esclusa dalla Fase 2) |
| `chierico-dominio-dell-ordine-incarnazione-della-legge-usi` | max(1, Sag) | Incarnazione della Legge (esclusa) |
| `druido-circolo-dei-sogni-sentieri-nascosti-usi` | max(1, Sag) | Sentieri Nascosti |
| `ranger-viandante-fatato-viandante-velato-usi` | max(1, Sag) | Viandante Velato (esclusa) |
| `mago-interdizione-arcana-pf` | 2 × livello mago + Int | nessuna (PF della Interdizione Arcana) |

**CD non magiche.** Tre pill con TS ripetuto usano una CD che non è quella
degli incantesimi. Il popup non la mostra e la riporta solo nel testo
(`reminderDC`, `src/effectSaveReminderCore.js:365`):

| Capacità | CD |
|---|---|
| Runa del Fuoco, Runa della Pietra | 8 + competenza + Costituzione |
| Squarciare la Mente | 8 + competenza + modificatore indicato dalla fonte |

## Patch proposta

1. **Campo opzionale `abilityModifiers`** nel profilo card
   (`src/initiativeCards.js`), sul modello di `damageDefenses`:
   - chiavi `str`, `dex`, `con`, `int`, `wis`, `cha`, interi da −5 a +10;
   - scritto solo quando il GM ne compila almeno uno;
   - i profili senza il campo non cambiano forma.

   Va aggiunto a `sanitizeInitiativeCard`, `mergeProfile` e
   `INITIATIVE_CARD_KNOWN_FIELDS`. Le chiavi metadata restano invariate.
2. **Scheda card**: una riga «Modificatori di caratteristica» con 6 input,
   accanto a «Modificatori tiri salvezza».
3. **Resolver**: `resolveClassFeatureResourceMaximum(pool, characterBuild,
   abilityModifiers)` risolve `max(1, modificatore_X)`, `N + modificatore_X`
   e `a * livello_classe + modificatore_X`. Il terzo parametro è opzionale e
   i chiamanti esistenti restano validi. Senza modificatore il risultato
   resta `null`, quindi resta valido anche il massimo inserito a mano.
4. **CD da caratteristica**: nuovo `dcSource: "source-ability"` con
   `dcAbility`, calcolato come 8 + competenza (livello totale) + modificatore
   della card della sorgente. Si applica ai 3 override sopra.
5. **Dati**: Difesa Gloriosa, Incarnazione della Legge e Viandante Velato
   escono dall'esclusione P1 e vengono valutate con il normale percorso del
   batch.

`initiativeList.js` non viene toccato.

## Rischi

- **Salvataggio card.** Il campo nuovo passa dal merge dei profili, dal
  registry Room e dal `localStorage`. Valgono le regole di F-01: merge, mai
  sostituzione.
- **Budget Room.** Il formato a oggetto aggiunge circa 70 byte per PG. Con 6
  PG di 20° livello il benchmark di F-01 passa da ≈ 4036–4063 B a ≈ 4450 B,
  cioè **al limite**. Un formato compatto solo in Room (array di 6 valori,
  ≈ 34 B) resta sotto, a ≈ 4270 B.
- **Massimo manuale già salvato.** Quando il GM compila i modificatori, il
  massimo calcolato prende il posto di quello scritto a mano, e il contatore
  corrente viene limitato al nuovo massimo. È il comportamento atteso, ma è
  visibile.
- **Ispirazione Bardica.** Nel batch Bardo era stato deciso di lasciare
  gli usi alla scheda del personaggio. P1 renderebbe automatico solo il
  massimo, senza cambiare quella decisione.

## Esito

Patch applicata come proposta, con il formato compatto nel registry Room.

| File | Modifica |
|---|---|
| `src/abilityModifiersCore.js` (nuovo) | normalizzazione, forma compatta, competenza, `abilitySaveDC` |
| `src/initiativeCards.js` | campo opzionale `abilityModifiers` in sanitize, merge e campi noti |
| `src/initiativeCardRegistryCore.js` | array di 6 valori in scrittura Room, oggetto in lettura |
| `initiative-card-modal.html`, `src/initiative-card-modal.js` | riga «Caratteristiche» in vista e 6 input in modifica |
| `src/classFeatureCore.js` | formule con modificatore; parametro opzionale `abilityModifiers` nei calcoli dei pool |
| `src/classFeatureStateMutationCore.js`, `src/classFeatureRuntime.js`, `src/classFeatureCatalog.js` | passaggio di `abilityModifiers` dal profilo |
| `src/effectSaveReminderCore.js` | `dcSource: "source-ability"` con `dcAbility` |
| `runtime-feature-overrides.json` | CD da caratteristica per le 3 pill; Difesa Gloriosa, Incarnazione della Legge e Viandante Velato come `resource-only` |

Risultati:

- capacità implementate da 261 a 264;
- automazione con soli dati da 11 a 9;
- **budget Room**, misurato su 6 PG di 20° livello, con chiave asset e nome
  e la codifica di F-01: da 3576 B a 3780 B su 4450; tutti e 6 i profili
  conservati;
- **test**: nuovo `test/abilityModifiersP1.test.js` (9 test); i conteggi dei
  test di Chierico, Paladino e Ranger contano le capacità sbloccate;
- **browser** (harness della card): CAR +3 sul paladino porta Percezione del
  Divino da «–/–» a «4/4». Il token salva l'oggetto, la Room l'array.

Da verificare al tavolo: inserimento dei modificatori su un PG reale, pool
dopo una ricarica, CD nel popup della Runa del Fuoco.

# Boss Actions — tranche 9: Divine Brilliance e tema ghiaccio delle aree di Auril

## Divine Brilliance (profile/parser v10)

```json
{ "kind": "attack-damage", "printedTotalAverage": 21,
  "attack": { "bonus": 11, "type": "spell", "modes": ["ranged"], "range": { "normal": 120 } },
  "target": { "mode": "multiple", "selection": "area",
    "area": { "shape": "emanation", "size": 120, "origin": "Auril" }, "conscious": true },
  "damage": [
    { "id": "cold", "formula": "3d6", "type": "cold", "average": 10 },
    { "id": "necrotic", "formula": "3d6", "type": "necrotic", "average": 10 }
  ],
  "sourceAction": "polar-ray", "trigger": { "hpBelow": 105 }, "requiresConfirmation": true }
```

- **Grammatica:** testo della Reazione ancorato per intero, con il nome del boss. «per la prima volta» diventa un uso 1/fase.
- **Attacco di riferimento:**
  - attacco e danni sono quelli stampati di Polar Ray nello stesso profilo, copiati all'import;
  - la validazione verifica che coincidano con l'abilità `sourceAction`;
  - se Polar Ray manca o non è un attacco a distanza con incantesimo, Divine Brilliance resta manuale, con una diagnostica.
- **Flusso nella console:**
  1. si conferma l'innesco e che la Reazione sia disponibile;
  2. si posiziona l'emanazione da 120 ft, centrata su Auril;
  3. Colpito o Mancato per ogni creatura;
  4. **Applica**.
- **Bersagli:**
  - le creature a 0 PF sono escluse dal gruppo dopo il disegno; la console dice quante;
  - le creature che Auril non può vedere vanno tolte a mano;
  - una creatura a 0 PF viene rifiutata anche al commit.
- **Danni:**
  - ogni colpito ha i suoi campi danno (freddo e necrotici) sulla riga, precompilati con le medie (10 + 10);
  - un tiro per bersaglio; un critico va inserito con i dadi già raddoppiati;
  - un mancato non infligge danni;
  - resistenze, immunità e regola del marchio si applicano per creatura.
- **Innesco:**
  - con Auril sotto 105 PF e l'uso disponibile, la lista delle azioni mostra un avviso con «Apri»;
  - la console si aggiorna anche quando cambiano i PF del boss, perché questi entrano nella firma della sottoscrizione locale già esistente (nessun nuovo listener);
  - l'esecutore rifiuta il comando se, al commit, il boss non è sotto la soglia.
- **Uso e Annulla:** il comando consuma l'uso 1/fase; l'Annulla ripristina PF e uso.
- **Combat Log / History:** la voce registra:
  - l'attacco di riferimento e i PF del boss all'innesco;
  - l'emanazione e le creature aggiunte o tolte a mano;
  - esito e componenti di ogni bersaglio.
- **Compatibilità:** i profili v1–v9 restano validi e non possono contenere un attacco di gruppo.

## Tema ghiaccio per le aree di Auril

- **Chi lo sceglie:** la console sceglie il tema da una mappa chiusa per definizione di boss (`bossAreaTheme`: `auril` → `frost`) e lo invia nel contesto della richiesta (`areaTheme`).
- **Dove vale:**
  - lo strumento d'area lo applica solo alle aree delle Boss Actions (`boss-action-area`) e solo se il tema è nell'elenco richiedibile (`frost`);
  - gli incantesimi mantengono il tema derivato dal loro id.
- **Colori:**
  - area azzurro ghiaccio (`#7dd3fc`) con bordo bianco brina (`#f0f9ff`);
  - opacità e spessore restano quelli scelti dall'utente;
  - il cerchio del danno extra (Meteor Swarm) diventa un nucleo di ghiaccio profondo (`#1e3a8a`, bordo `#bfdbfe`) invece dell'arancione.

## Verifica (12 ottobre 2026)

- **Test:**
  - `bossActionTranche9.test.js`: contratto, varianti manuali, controllo incrociato, piano per bersaglio, rifiuti, marchio, regole della console, tema;
  - `bossActionTranche9Integration.test.js`: coordinatore, History e Annulla reali, 1/fase;
  - flusso della console in `bossActionsPopover.test.js`;
  - suite completa 3264/3264, `npm run build` PASS, `git diff --check` PASS.
- **Difetti trovati e corretti durante la verifica:**
  - la console classificava Divine Brilliance come attacco singolo;
  - il pulsante «Apri» dell'avviso restava disabilitato perché veniva disegnato durante l'aggiornamento.
- **Browser di prova** (`?phase=3`, scenari `brilliance-drawing`, `brilliance-ready`, `brilliance-final`):
  - Auril a 98 PF; un Goblin a 0 PF escluso;
  - Dars, resistente al freddo, prende 15 danni; Sera mancata;
  - l'uso risulta «Esaurita» e l'avviso sparisce;
  - le aree di Meteor Swarm usano il tema ghiaccio.

# Boss Actions — tranche 7: Spellcasting (Lentezza, Tempesta di Ghiaccio, Sfera Congelante)

C'è anche, prima della tranche, la registrazione dell'uso di Epic Resistance.

## Epic Resistance e capacità manuali senza contatore

Ogni capacità manuale di combattimento (Azioni, Azioni Epiche, Reazioni) può registrare il proprio uso in Cronologia e Combat Log, anche senza un contatore 1/Round o 1/Phase. È il caso di Epic Resistance e Hurl.

- **Come:** si spunta "Ho risolto manualmente…" e si preme **Registra uso**.
- **Cosa scrive:** nessun effetto automatico e nessun contatore. Ogni uso è una voce annullabile.
- **Tratti passivi:** non hanno un uso da registrare; il runtime rifiuta la richiesta.

## Spellcasting (profile/parser v8)

```json
{ "kind": "spell-reference",
  "spells": [
    { "spellId": "slow", "name": "lentezza", "perDay": 3 },
    { "spellId": "ice-storm", "name": "tempesta di ghiaccio", "perDay": 3 },
    { "spellId": "freezing-sphere", "name": "sfera congelante di Otiluke", "perDay": 1 }
  ],
  "saveDC": 19, "attackBonus": 11 }
```

- **Catalogo chiuso:** i nomi stampati sono mappati su un insieme chiuso (`BOSS_ACTION_SPELLS`). Un nome diverso, o un testo alterato, lascia la capacità manuale.
- **Compatibilità:** i profili v1–v7 restano validi con il solo `spellId: "slow"` e non possono contenere la lista.
- **Console:** un pulsante per incantesimo ("Lentezza · 3/giorno", …). Ognuno apre il pannello incantesimi esistente con Auril come incantatore, CD 19 e +11, e con il contesto "azione del mostro" che indica l'incantesimo scelto.
- **Risoluzione:** area, bersagli, TS e danni si risolvono nel pannello. L'esecutore delle aree accetta solo un incantesimo elencato dalla capacità e uguale a quello del contesto. Il consumo dell'1/Round di Spellcasting avviene nello stesso comando, e la provenienza nel Combat Log nomina l'incantesimo lanciato (`buildBossActionUse` riceve `spellId`).
- **Limiti per giorno:** sono solo informativi e li verifichi tu.

## Fuori scope e limiti

- **Danni senza tipo:** il pannello incantesimi applica i danni come totale unico. Le difese ai danni del profilo attore e la regola del marchio non si applicano agli incantesimi.
- **Contatori per giorno:** 3/giorno e 1/giorno non vengono contati.

## Verifica (12 ottobre 2026)

- **Test:**
  - con l'esecutore reale: Tempesta di Ghiaccio e Sfera Congelante con contesto di Auril, CD 19, uso 1/Round e provenienza;
  - rifiuto di un contesto che nomina un altro incantesimo, o di un incantesimo non elencato;
  - contratto v8 chiuso;
  - console: un pulsante per incantesimo, Epic Resistance registrabile;
  - suite completa 3236/3236, `npm run build` PASS, `git diff --check` PASS.
- **Browser di prova:**
  - la console mostra i tre pulsanti;
  - "Tempesta di ghiaccio" apre il pannello incantesimi vero con Auril, slot 4° e l'area che seleziona i bersagli;
  - il resto della risoluzione nel pannello non è simulabile con lo strumento d'area semplificato del browser di prova; è coperto dai test sull'esecutore.

## Passo velato a volontà (parser v15, 13 ottobre 2026)

- **Stat block:** nella fixture della fase 2 Spellcasting elenca «A volontà: passo velato» prima dei 3/Giorno.
- **Profilo v15:**
  - un incantesimo può essere `atWill: true` al posto di `perDay`;
  - Passo velato (`misty-step`, già nel catalogo con il teletrasporto) entra nella mappa chiusa degli incantesimi del boss;
  - i profili v1–v14 restano validi.
- **Ordine:** Passo velato è l'ultimo della lista. Una richiesta che non indica l'incantesimo apre ancora il primo, Lentezza, come nei profili v1–v7.
- **Console:** quarto pulsante «Passo velato · a volontà». Il lancio passa dal pannello incantesimi come gli altri: uno stesso esecutore controlla il contesto del boss e registra l'uso 1/Round di Spellcasting.
- **Grammatica:** un HTML senza «A volontà: passo velato» resta riconosciuto, con i tre incantesimi giornalieri.

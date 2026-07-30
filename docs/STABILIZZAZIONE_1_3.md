# Stabilizzazione 1.3

> **Documento storico.** Questa pagina descrive il gate della release 1.3 e
> non viene aggiornata con le funzioni sviluppate in seguito. Parti da
> [README](../README.md) e
> [Incantesimi, zone e reminder](INCANTESIMI_E_ZONE.md) per lo stato corrente.

## Stato

- Baseline: commit `4ad6caf`.
- Branch di lavoro: `codex/v1.3-stabilization`.
- Versione rilasciata: `1.3.0`.
- Release stabile pubblicata: `v1.3.0` (26 luglio 2026).
- Inizio feature freeze: 26 luglio 2026.

La stabilizzazione ha prodotto la release 1.3 senza cambiare le chiavi metadata,
il formato canonico degli HP o l'architettura del plugin.

## Feature freeze

Durante la stabilizzazione sono ammessi:

- correzioni di bug riproducibili;
- test di caratterizzazione e regressione;
- diagnostica e misurazioni senza effetti sullo stato;
- ottimizzazioni dimostrate da misure;
- documentazione, CI e processo di release;
- refactoring piccoli, coperti da test e privi di cambiamenti intenzionali di comportamento.

Restano fuori dal perimetro:

- nuove funzioni di gioco;
- nuovi formati metadata o migrazioni non pianificate;
- riscritture dell'iniziativa, degli effetti o degli attachment;
- modifiche estetiche non necessarie alla stabilità;
- aggiornamenti di dipendenze non richiesti da un problema verificato.

Ogni eccezione deve essere isolata, motivata e verificata separatamente.

## Gate della release

Una release può essere prodotta soltanto da un worktree pulito e deve superare:

```bash
npm ci
npm run verify:version
npm test
npm run check:spells
npm run build
npm run artifact:checksums
npm run verify:dist
```

La build genera `dist/build-info.json` con versione, commit, stato dirty e data
deterministica del commit. `dist/checksums.sha256` identifica ogni file consegnato.

Il workflow manuale `Release artifact` ripete l'intero gate e pubblica un artifact
GitHub nominato con versione e SHA breve. Non esegue automaticamente il deploy.

## Verifiche manuali della release

Prima del tag di una release:

1. aprire una room separata da quelle di gioco;
2. verificare tracker esteso, compatto e vista player;
3. avanzare e retrocedere rapidamente per almeno due round;
4. verificare condizioni e spell con scadenza di turno e round;
5. verificare HP singolo e multi-bersaglio, Undo e barre mappa;
6. verificare Lair, Paragon ed Epic con ID virtuali;
7. esportare diagnostica iniziativa ed effetti;
8. confermare che manifest e artifact riportino la stessa versione e che
   `build-info.json` e il report diagnostico riportino lo stesso commit.

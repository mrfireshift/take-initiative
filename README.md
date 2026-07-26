# Take Initiative!

**Take Initiative!** è un'estensione per [Owlbear Rodeo](https://www.owlbear.rodeo/) dedicata a D&D 5e 2014 e progettata soprattutto per il gioco **in presenza**: il Dungeon Master usa Owlbear Rodeo dal proprio computer, mentre una seconda finestra player-side viene proiettata su uno schermo orizzontale appoggiato sul tavolo.

La release stabile corrente è **v1.3.0**, pensata per D&D 5e 2014 e per l'uso
in presenza con una seconda vista player proiettata sul tavolo.

La release include il tracker con rendering incrementale e diagnostica, la
console HP multi-bersaglio con Undo, la gestione degli effetti locali sulla
mappa, il targeting geometrico delle aree e il catalogo degli incantesimi dei
supplementi 2014.

## Cosa fa

- gestisce iniziativa, round, turno attivo e gruppi di creature omonime;
- offre un lister esteso e uno compatto, con una vista player semplificata;
- tiene sincronizzati HP, HP massimi, HP temporanei, card e barre sulla mappa;
- applica condizioni, condizioni personalizzate, indebolimento e incantesimi con durata;
- gestisce concentrazione, velocità, movimento e interazioni con le condizioni di D&D 2014;
- applica danno, cura e HP temporanei a più bersagli in un'unica operazione annullabile;
- supporta boss con azioni leggendarie, resistenze leggendarie, turni Paragon e azioni epiche;
- registra un log di combattimento esportabile e una cronologia Undo separata;
- include clock manuali, quota dei token, distanza tridimensionale e targeting geometrico delle aree.

## Avvio rapido

1. Installa l'estensione in Owlbear Rodeo usando l'URL pubblico del suo `manifest.json`.
2. Apri una room come GM e aggiungi alla scena i token del combattimento.
3. Dal menu contestuale dei token scegli **Aggiungi all'iniziativa** e assegna la fazione corretta.
4. Apri **Take Initiative!** dalla barra delle estensioni.
5. Imposta iniziativa e HP dalle card, quindi avvia il combattimento.
6. Apri la stessa room in una seconda finestra o in un altro browser come player e proiettala sul tavolo.

Per installazione locale e pubblicazione consulta [Installazione](docs/INSTALLAZIONE.md).

## Documentazione

- [Guida utente](docs/GUIDA_UTENTE.md) — flusso completo per il DM e comportamento della vista player.
- [Riferimento delle funzioni](docs/RIFERIMENTO_FUNZIONI.md) — tutti i moduli, i controlli e le regole automatizzate.
- [Architettura e dati](docs/ARCHITETTURA.md) — entry point, metadata, persistenza e sincronizzazione.
- [Sviluppo e release](docs/SVILUPPO.md) — ambiente locale, script, test e checklist di rilascio.
- [Stabilizzazione 1.3](docs/STABILIZZAZIONE_1_3.md) — feature freeze, gate e verifiche della candidata.
- [Risoluzione dei problemi](docs/RISOLUZIONE_PROBLEMI.md) — verifiche e rimedi per i problemi più comuni.
- [Backlog](BACKLOG.md) — funzionalità pianificate ma non ancora incluse.
- [Licenze di terze parti](THIRD_PARTY_NOTICES.md) — attribuzioni del catalogo SRD.

## Compatibilità e principi

- Regole di riferimento: **D&D 5e 2014**.
- Catalogo incantesimi: **SRD 5.1**, 319 voci verificate dalla build.
- SDK Owlbear Rodeo: `@owlbear-rodeo/sdk` 3.x.
- Browser moderni supportati da Owlbear Rodeo.
- I dati delle creature sono conservati nei metadata dei token; lo stato globale del combattimento appartiene alla scena.
- La vista player nasconde i controlli da regia. La quantità di informazioni HP visibili dipende dal layout e dalla fazione: la modalità compatta privilegia i PG, mentre la modalità estesa può mostrare anche gli alleati; neutrali e nemici non espongono i propri HP al player.

## Sviluppo rapido

```bash
npm install
npm run dev
```

Build e controlli principali:

```bash
npm test
npm run check:spells
npm run build
```

Dettagli in [Sviluppo e release](docs/SVILUPPO.md).

## Licenza dei contenuti

Il catalogo degli incantesimi deriva dal D&D 5e SRD 5.1 ed è distribuito secondo CC BY 4.0. Le attribuzioni complete sono in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

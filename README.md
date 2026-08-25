# Take Initiative!

**Take Initiative!** è un'estensione per
[Owlbear Rodeo](https://www.owlbear.rodeo/) dedicata a D&D 5e 2014 e
progettata soprattutto per il gioco **in presenza**: il Dungeon Master usa
Owlbear Rodeo dal proprio computer, mentre una seconda finestra player-side
viene proiettata su uno schermo orizzontale appoggiato sul tavolo.

La versione dichiarata dal progetto è **v1.3.0**. Questa documentazione
descrive lo stato corrente del repository, comprese le funzioni sviluppate
dopo la stabilizzazione 1.3 e non ancora raccolte in una nuova release.

## Cosa fa

- gestisce iniziativa, round, turno attivo e gruppi di creature omonime;
- offre un lister esteso e uno compatto, con una vista player semplificata;
- sincronizza HP, HP massimi, HP temporanei, card e barre sulla mappa;
- applica condizioni, condizioni personalizzate, indebolimento e incantesimi
  con durata;
- gestisce concentrazione, velocità multimodale, movimento e interazioni con
  le condizioni di D&D 2014;
- applica danno, cura e HP temporanei a più bersagli in un'unica operazione
  annullabile;
- supporta boss con azioni leggendarie, resistenze leggendarie, turni Paragon
  e azioni epiche;
- registra un log di combattimento esportabile e una cronologia Undo separata;
- include clock manuali, quota dei token, distanza tridimensionale e targeting
  geometrico delle aree;
- mantiene un registro globale degli incantesimi attivi, anche se lanciati
  dalla Console effetti ad area;
- crea zone persistenti e aure mobili con trigger di ingresso, movimento,
  attraversamento, inizio e fine turno;
- mostra reminder aggregati per tiri salvezza ed effetti senza sostituire i
  tiri fisici al tavolo;
- consente al GM di risolvere i reminder modellati con Superato o Fallito,
  mantenendo Player view, History/Undo e Combat Log coerenti;
- offre azioni rapide per card, incantesimi preparati e azioni attive
  successive al lancio;
- conserva una configurazione di fazione nella room e può riutilizzarla quando
  nuovi token condividono immagine o nome con creature già classificate;
- permette al GM di creare aure personalizzate autonome dal menu contestuale
  del token, configurando raggio, stile, bersagli, pill persistente e warning
  a inizio o fine turno;
- permette di indicare classe, sottoclasse e livello (anche multiclasse) nella
  scheda iniziativa e di attivare capacità di classe con usi e durata tracciati;
- materializza gli effetti attivi delle capacità come condizioni persistenti sui
  token, rimovibili dalla finestra Condizioni, distinguendo caster, bersaglio
  singolo e aura, con aree mobili e proiezioni buff/debuff sui token dentro
  l'area.

## Avvio rapido

1. Installa l'estensione in Owlbear Rodeo usando l'URL pubblico del suo
   `manifest.json`.
2. Apri una room come GM e aggiungi alla scena i token del combattimento.
3. Dal menu contestuale dei token scegli **Aggiungi all'iniziativa** e assegna
   la fazione corretta.
4. Apri **Take Initiative!** dalla barra delle estensioni.
5. Imposta iniziativa e HP dalle card, quindi avvia il combattimento.
6. Apri la stessa room in una seconda finestra o in un altro browser come
   player e proiettala sul tavolo.

Per installazione locale e pubblicazione consulta
[Installazione](docs/INSTALLAZIONE.md).

## Documentazione

- [Indice della documentazione](docs/INDICE.md) — mappa dei riferimenti correnti,
  dei contratti tecnici e degli audit storici.
- [Guida utente](docs/GUIDA_UTENTE.md) — flusso completo per il DM e
  comportamento della vista player.
- [Capacità di classe](docs/CAPACITA_CLASSE.md) — build, risorse, capacità
  attivabili, aure e stato di automazione.
- [Incantesimi, zone e reminder](docs/INCANTESIMI_E_ZONE.md) — catalogo,
  registro, geometrie, trigger, automazioni e limiti correnti.
- [Riferimento delle funzioni](docs/RIFERIMENTO_FUNZIONI.md) — controlli,
  regole automatizzate e ambito dei dati.
- [Architettura e dati](docs/ARCHITETTURA.md) — entry point, metadata,
  persistenza e sincronizzazione.
- [Contratto del movimento](docs/MOVEMENT_MECHANICS.md) — profilo multimodale,
  costi delle aree e limiti intenzionali.
- [Sviluppo e release](docs/SVILUPPO.md) — ambiente locale, script, test e
  checklist di rilascio.
- [Risoluzione dei problemi](docs/RISOLUZIONE_PROBLEMI.md) — verifiche e rimedi
  per i problemi più comuni.
- [Backlog](BACKLOG.md) — funzionalità pianificate ma non ancora incluse.
- [Workspace class features](docs/class-features/README.md) — sorgenti,
  generatori e audit del catalogo capacità.
- [Licenze di terze parti](THIRD_PARTY_NOTICES.md) — attribuzioni dei
  contenuti di catalogo.

## Compatibilità e principi

- Regole di riferimento: **D&D 5e 2014**.
- Catalogo runtime: **477 definizioni**, di cui **358 opzioni trackable** e **392
  esposte dal pannello unificato** Incantesimi, provenienti da SRD 5.1, Xanathar,
  Tasha e integrazioni PHB 2014.
- Catalogo capacità: **551 record runtime**, di cui **59 attivabili** e **492
  gestiti come riferimento/manuale**; include 104 pool di risorse.
- SDK Owlbear Rodeo: `@owlbear-rodeo/sdk` 3.x.
- Browser moderni supportati da Owlbear Rodeo.
- Il plugin traccia eventi, durata, condizioni e reminder; i dadi e le
  decisioni restano al tavolo fisico.
- I dati delle creature sono conservati nei metadata dei token; lo stato
  globale del combattimento appartiene alla scena.
- Nemici e neutrali non richiedono una scheda completa. La CD mostrata nei
  reminder viene letta dalla scheda del caster, se presente.
- La vista player nasconde i controlli da regia. La quantità di informazioni
  HP visibili dipende dal layout e dalla fazione: la modalità compatta
  privilegia i PG, mentre la modalità estesa può mostrare anche gli alleati;
  neutrali e nemici non espongono i propri HP al player.

## Sviluppo rapido

```bash
npm ci
npm run dev
```

Build e controlli principali:

```bash
npm test
npm run generate:class-features
npm run audit:class-features
npm run check:spells
npm run build
```

Dettagli in [Sviluppo e release](docs/SVILUPPO.md).

## Licenza dei contenuti

Il catalogo base deriva dal D&D 5e SRD 5.1 ed è distribuito secondo CC BY 4.0.
Le attribuzioni dei contenuti redistribuiti sono in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

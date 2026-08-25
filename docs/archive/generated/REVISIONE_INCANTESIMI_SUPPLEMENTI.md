# Revisione incantesimi dei supplementi

> **Documento storico.** I conteggi e le decisioni qui riportati appartengono
> alla revisione iniziale del catalogo. Lo stato runtime e le automazioni
> correnti sono documentati in
> [Incantesimi, zone e reminder](../../INCANTESIMI_E_ZONE.md).

Catalogo generato il 2026-07-26. Tutte le voci sono abilitate nel catalogo runtime; le automazioni restano limitate ai casi revisionati esplicitamente.

## Fonti

| Manuale | Incantesimi | Pagine del file fornito |
| --- | ---: | --- |
| Guida Omnicomprensiva di Xanathar | 95 | 151–172 |
| Calderone Omnicomprensivo di Tasha | 21 | 107–117 |

Totale: **116** incantesimi.

## Stato di integrazione

| Stato | Totale |
| --- | ---: |
| trackable-review | 78 |
| reference-only | 31 |
| manual-review | 3 |
| collision-review | 3 |
| merge-existing | 1 |

- `trackable-review`: durata esplicita, candidato al tracker.
- `reference-only`: istantaneo senza effetto persistente rilevato.
- `manual-review`: istantaneo con effetto persistente nel testo.
- `merge-existing`: nome già presente nel catalogo SRD o legacy.
- `collision-review`: stesso nome italiano, ma incantesimo distinto da quello esistente.

## Incantesimi da 1 round

| Incantesimo | Fonte | Modello proposto | Scadenza spell proposta |
| --- | --- | --- | --- |
| Assorbire Elementi | xanathar | multi-stage | turn-end/source/next-turn |
| Lama Roboante | tasha | manual-trigger | turn-start/source/next-turn |
| Scheggia della Mente | tasha | manual-trigger | turn-end/source/next-turn |
| Scudiscio Mentale di Tasha | tasha | target-turn | turn-end/target/next-turn |

## Casi prioritari

| Incantesimo | Fonte | Durata | Stato | Relazione con voce esistente | Indicatori |
| --- | --- | --- | --- | --- | --- |
| Assorbire Elementi | xanathar | 1 round | trackable-review | — | exact-turn-boundary, effect-candidate, text-normalized, multi-stage |
| Cerimonia | xanathar | Istantanea | manual-review | — | effect-candidate, choice-candidate, instantaneous-lingering-effect |
| Colpo dello Zefiro | xanathar | Concentrazione, fino a 1 minuto | trackable-review | — | exact-turn-boundary, effect-candidate |
| Controllare Fiamme | xanathar | Istantanea o 1 ora (vedi sotto) | trackable-review | — | duration-review, choice-candidate, area-candidate |
| Diavoletto di Polvere | xanathar | Concentrazione, fino a 1 minuto | trackable-review | — | exact-turn-boundary, choice-candidate |
| Gabbia dell'Anima | xanathar | 8 ore | trackable-review | — | exact-turn-boundary, condition-candidate, effect-candidate |
| Interdizione Primordiale | xanathar | Concentrazione, fino a 1 minuto | trackable-review | — | exact-turn-boundary, effect-candidate |
| Investitura del Ghiaccio | xanathar | Concentrazione, fino a 10 minuti | trackable-review | — | exact-turn-boundary, effect-candidate, area-candidate |
| Investitura della Pietra | xanathar | Concentrazione, fino a 10 minuti | trackable-review | — | exact-turn-boundary, condition-candidate, effect-candidate, area-candidate |
| Modellare Acqua | xanathar | Istantanea o 1 ora (vedi sotto) | trackable-review | — | duration-review, choice-candidate, area-candidate |
| Modellare Terra | xanathar | Istantanea o 1 ora (vedi sotto) | trackable-review | — | duration-review, effect-candidate, choice-candidate, area-candidate |
| Morsa del Gelo | xanathar | Istantanea | manual-review | — | exact-turn-boundary, effect-candidate, instantaneous-lingering-effect |
| Pirotecnica | xanathar | Istantanea | manual-review | — | exact-turn-boundary, condition-candidate, choice-candidate, area-candidate, instantaneous-lingering-effect |
| Evoca Aberrazione | tasha | Concentrazione, fino a 1 ora | trackable-review | — | exact-turn-boundary, condition-candidate, effect-candidate |
| Evoca Bestia d'Ombra | tasha | Concentrazione, fino a 1 ora | trackable-review | — | exact-turn-boundary, condition-candidate, effect-candidate, choice-candidate |
| Evoca Celestiale | tasha | Concentrazione, fino a 1 ora | collision-review | collisione: srd:conjure-celestial | name-collision-existing, condition-candidate, effect-candidate |
| Evoca Costrutto | tasha | Concentrazione, fino a 1 ora | trackable-review | — | exact-turn-boundary, condition-candidate, effect-candidate, choice-candidate |
| Evoca Elementale | tasha | Concentrazione, fino a 1 ora | collision-review | collisione: srd:conjure-elemental | name-collision-existing, condition-candidate, effect-candidate |
| Evoca Folletto | tasha | Concentrazione, fino a 1 ora | collision-review | collisione: srd:conjure-fey | name-collision-existing, exact-turn-boundary, condition-candidate, effect-candidate, choice-candidate |
| Evoca Non Morto | tasha | Concentrazione, fino a 1 ora | trackable-review | — | exact-turn-boundary, condition-candidate, effect-candidate |
| Lama Roboante | tasha | 1 round | trackable-review | — | exact-turn-boundary, area-candidate, target-review |
| Scheggia della Mente | tasha | 1 round | trackable-review | — | exact-turn-boundary, effect-candidate |
| Scudiscio Mentale di Tasha | tasha | 1 round | merge-existing | merge: legacy:scudiscio-mentale-di-tasha | duplicate-existing, exact-turn-boundary, effect-candidate |
| Sudario Spirituale | tasha | Concentrazione, fino a 1 minuto | trackable-review | — | exact-turn-boundary, effect-candidate, choice-candidate, area-candidate |

## Limiti della normalizzazione automatica

- Le classi abilitate non sono presenti nei JSON forniti.
- Le pagine sono note solo come intervallo del file, non per singolo incantesimo.
- Bersagli, aree, condizioni ed effetti sono candidati ricavati dal testo e devono essere confermati.
- Le descrizioni con più fasi possono richiedere pill figlie con scadenze diverse dalla spell.

# ARCH-005 — Reconciler idempotenti e recupero parziale

## Obiettivo

ARCH-005 rende convergenti i renderer proprietari di pill, HP bar, aura e
zone senza cambiare metadata pubblici, geometria o comportamento delle
feature. La fonte autorevole resta invariata; gli item visuali continuano a
essere output ricostruibili.

## Protocollo di convergenza

`sceneItemReconcileCore.js` applica lo stesso protocollo agli item posseduti:

1. legge lo stato corrente;
2. aggiunge soltanto le identità desiderate mancanti;
3. rilegge dopo ogni chiamata SDK, anche quando la promise ha fallito;
4. aggiorna il keeper compatibile;
5. elimina duplicati, item incompatibili e residui soltanto quando ogni
   identità desiderata ha già un keeper verificato;
6. rilegge e termina solo sullo stato convergente.

Il retry è bounded. Un errore ambiguo è sicuro sia quando la mutazione non è
stata applicata sia quando Owlbear Rodeo l'ha applicata prima di rigettare la
promise. Ogni fase verifica inoltre lo scene epoch originario prima della
mutazione successiva.

## Integrazioni

- `effectsLayout.js`: widget locali e cleanup dei widget globali legacy;
- `hpbar-items.js`: coppie background/foreground e label HP;
- `spellAuraController.js`: visuali delle aure mobili;
- `classFeatureAuraController.js`: visuali delle aure delle Capacità;
- `staticSpellZoneRemovalCore.js`: delete e rollback delle zone statiche;
- `spellStaticZone.js`: retry automatico di bounds, membership e reminder.

Le due aura e le zone non applicano membership, reminder o cleanup quando una
scansione bounds è incompleta. `sceneItemBoundsCache.js` deduplica i load
concorrenti e impedisce a una risposta precedente di sostituire una geometria
più recente dopo invalidazione o cambio scena.

## Regole preservate

- attachment, layer, coordinate e builder restano quelli esistenti;
- le chiavi metadata e il formato dei valori non cambiano;
- conditions, spells e concentration continuano a passare dalla lane ARCH-003;
- il lifecycle usa lo scene epoch ARCH-001;
- gli eventi di recovery rientrano nell'hub ARCH-004;
- non è introdotto un nuovo source of truth.

## Verifica

I test di fault injection simulano errori prima e dopo `readItems`, `addItems`,
`updateItems` e `deleteItems`. Il criterio di successo è uno stato finale con
una sola istanza per identità, nessun residuo e attachment/coordinate uguali al
piano desiderato. Test dedicati coprono anche delete ambiguo e rollback
ambiguo delle zone, bounds concorrenti e invalidazione durante un load.

## Limiti

Il protocollo recupera errori temporanei; un errore SDK persistente viene
segnalato dopo il numero massimo di passaggi e il controller programma un
nuovo reconcile con ritardo. Non tenta transazioni distribuite tra sessioni GM
diverse e non modifica la semantica delle mutazioni persistenti ARCH-003.

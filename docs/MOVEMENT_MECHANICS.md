# Contratto delle meccaniche di movimento

Questo documento definisce il comportamento del profilo di movimento usato
dallo Speed Tracker. Zone, aure e attivazioni secondarie hanno controller
indipendenti, ma i loro effetti di appartenenza possono contribuire al profilo
di movimento tramite lo stesso contratto.

## Modalità supportate

Il profilo espone quattro modalità:

- `walk`: camminare;
- `fly`: volare;
- `swim`: nuotare;
- `climb`: scalare.

La velocità salvata nella scheda iniziativa rimane la velocità base di
camminare. Le altre modalità esistono soltanto quando un effetto le concede o
le copia da una modalità esistente.

Il cambio modalità non azzera il movimento consumato. Tutte le modalità
condividono la distanza totale già percorsa nel turno, come previsto dalle
regole 2014 per l'uso combinato di velocità differenti.

## Schema `mechanics.movement`

I campi scalari già esistenti restano validi:

```js
movement: {
  addMeters: 3,
  multiplier: 0.5,
  costMultiplier: 2,
  maximumMeters: 9,
  setMeters: 0,
  appliesTo: ["walk"],
  label: "Descrizione"
}
```

Senza `appliesTo`, i campi scalari si applicano a tutte le modalità
disponibili. `appliesTo` limita invece quei campi alle modalità elencate.
`multiplier` applica un moltiplicatore dopo i modificatori additivi,
mantenendo l'arrotondamento per difetto a caselle intere.
`costMultiplier` non cambia la velocità disponibile: moltiplica invece il costo
delle caselle percorse, come nel terreno difficile.

Un effetto può dichiarare immunità selettive e un costo legato alla direzione
del segmento:

```js
movement: {
  immunities: ["difficult-terrain", "magical-speed-reduction"],
  directional: {
    direction: "toward-source",
    costMultiplier: 2,
    sourceId: casterId,
    instanceId: spellInstanceId,
    zoneId: zoneItemId,
    label: "Folata di vento: movimento verso il caster ×2"
  }
}
```

`difficult-terrain` ignora soltanto i costi dichiarati come terreno difficile;
`magical-speed-reduction` ignora riduzioni magiche della velocità, ma non la
velocità base nulla, Prono o impedimenti non coperti dall'effetto. Il costo
direzionale è risolto sui segmenti reali, usando la posizione corrente della
`sourceId` e, quando presente, la geometria della `zoneId`.

Le modalità aggiuntive sono dichiarate in `modes`:

```js
movement: {
  modes: {
    fly: { grantMeters: 18 },
    swim: { copyFrom: "walk" },
    climb: { maximumMeters: 0 }
  }
}
```

- `grantMeters` concede la modalità con la velocità indicata;
- `copyFrom` usa la velocità base della modalità indicata;
- `addMeters`, `multiplier`, `maximumMeters` e `setMeters` possono essere applicati anche
  alla singola modalità;
- un limite su una modalità inesistente non la concede.

Un effetto trasformativo può limitare i metodi utilizzabili:

```js
movement: {
  modes: { fly: { grantMeters: 3 } },
  exclusiveModes: ["fly"]
}
```

Più concessioni della stessa modalità non si sommano: viene usata la velocità
base più alta. Più limiti usano invece il valore più restrittivo.

## Ordine di risoluzione

Per ogni modalità il resolver applica:

1. velocità base, concessioni e copie;
2. bonus e penalità additive;
3. moltiplicatori, come Velocità e Lentezza;
4. limiti massimi;
5. valori imposti;
6. condizioni che impediscono completamente il movimento.

Il costo delle caselle viene risolto separatamente. Se più effetti dichiarano
`costMultiplier`, viene usato il valore più alto invece di moltiplicarli tra
loro. I modificatori direzionali indipendenti si moltiplicano soltanto sulla
porzione di segmento interessata; la stessa combinazione di sorgente, istanza,
zona, direzione e moltiplicatore viene applicata una sola volta. Prono conserva
la propria regola di costo nel conteggio del movimento.

I dimezzamenti vengono arrotondati per difetto a caselle intere da 1,5 metri,
conservando il comportamento precedente.

## Stato e persistenza

Gli incantesimi e le condizioni restano la fonte di verità. Il profilo
risolto è derivato e non viene scritto nei metadata del token.

Le capacità di classe che dichiarano `passiveMechanics.movement` entrano nello
stesso profilo quando la capacità è presente nella build e il relativo adapter
è supportato. Possono concedere una modalità, modificare velocità o costo e
applicare un limite; una voce `not-automated` resta invece un promemoria
manuale.

Nel campo turnale `speedCheckMovement` vengono conservati soltanto:

- turno;
- movimento consumato;
- ultima casella;
- posizione iniziale;
- quota iniziale;
- modalità attiva;
- stato necessario a ricostruire il costo del movimento del turno.

Ogni segmento registrato conserva il costo effettivamente addebitato, inclusi
terreno difficile e modificatori direzionali. Il percorso usato da Undo non
ricalcola le condizioni correnti: sottrae il costo già registrato del segmento.

La modalità selezionata vale quindi per il turno corrente e viene abbandonata
automaticamente se l'effetto che la concedeva termina.

## Quota e volo

Quando la modalità attiva è `fly`, ogni variazione manuale della quota consuma
movimento in entrambe le direzioni. Il delta viene convertito in caselle usando
il moltiplicatore della griglia e poi contabilizzato dallo Speed Tracker.

Il widget della quota può inoltre salvare `climbing: true` nel metadata del
token. In questo caso una variazione di quota viene contabilizzata anche con
`walk`; ogni movimento mentre il flag è attivo costa il doppio, salvo la
presenza di una modalità `climb` con velocità positiva. Il costo della scalata
si somma agli altri costi applicabili, come terreno difficile e Prono.

Le altre modalità non consumano movimento in seguito a una variazione di quota
quando il flag di scalata non è attivo.
Se il limite al movimento è attivo e la distanza verticale eccede il residuo,
la quota precedente viene ripristinata.

## Limiti intenzionali

- Il resolver non determina se il token si trovi in aria, acqua o su una
  parete: la modalità viene scelta dal DM.
- La caduta e la discesa forzata non vengono automatizzate.
- Le zone supportate possono dichiarare terreno difficile tramite un effetto
  di appartenenza. Il profilo lo riceve come `costMultiplier` e ne conserva la
  categoria per le immunità selettive.
- Libertà di movimento blocca le applicazioni magiche di `Paralizzato` e
  `Trattenuto`. Se sul bersaglio resta una restrizione non magica `Afferrato` o
  `Trattenuto`, all'inizio del suo turno il sistema propone il reminder
  `Spendi 1,5 m`: la scelta rimuove quella singola istanza e, quando il relativo
  `Speed Tracker` è attivo sullo stesso turno, aggiorna anche il movimento
  consumato. In assenza del tracker il reminder resta una conferma manuale del
  costo RAW.
- Le trasformazioni che consentono di alternare forma normale e speciale
  richiederanno un'azione esplicita in una fase successiva.

I casi ancora aperti sono tracciati nel [Backlog](../BACKLOG.md).

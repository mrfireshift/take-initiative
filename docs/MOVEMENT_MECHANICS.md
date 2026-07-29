# Contratto delle meccaniche di movimento

Questo documento definisce il comportamento del profilo di movimento usato
dallo Speed Tracker. Il contratto riguarda la fase multimodale; le aree,
le aure e le attivazioni secondarie restano sistemi indipendenti.

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

I dimezzamenti vengono arrotondati per difetto a caselle intere da 1,5 metri,
conservando il comportamento precedente.

## Stato e persistenza

Gli incantesimi e le condizioni restano la fonte di verità. Il profilo
risolto è derivato e non viene scritto nei metadata del token.

Nel campo turnale `speedCheckMovement` vengono conservati soltanto:

- turno;
- movimento consumato;
- ultima casella;
- posizione iniziale;
- modalità attiva.

La modalità selezionata vale quindi per il turno corrente e viene abbandonata
automaticamente se l'effetto che la concedeva termina.

## Quota e volo

Quando la modalità attiva è `fly`, ogni variazione manuale della quota consuma
movimento in entrambe le direzioni. Il delta viene convertito in caselle usando
il moltiplicatore della griglia e poi contabilizzato dallo Speed Tracker.

Le altre modalità non consumano movimento in seguito a una variazione di quota.
Se il limite al movimento è attivo e la distanza verticale eccede il residuo,
la quota precedente viene ripristinata.

## Limiti intenzionali

- Il resolver non determina se il token si trovi in aria, acqua o su una
  parete: la modalità viene scelta dal DM.
- La caduta e la discesa forzata non vengono automatizzate.
- Aree, terreno difficile e aure non fanno parte di questo contratto.
- Le trasformazioni che consentono di alternare forma normale e speciale
  richiederanno un'azione esplicita in una fase successiva.

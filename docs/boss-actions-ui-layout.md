# Boss Actions — organizzazione della console

La lista della console ha due schede.

- **Azioni (n):** tutte le capacità usabili in combattimento, automatizzate o manuali.
  - Sono raggruppate per manifestazione nell'ordine dello stat block; le reazioni vengono per ultime.
  - Se le azioni sono più di 8 compare la ricerca, che filtra tutti i gruppi.
- **Passive (n):** il riepilogo in sola lettura dei tratti (nome e testo, senza il titolo stampato). Non ci sono pulsanti.

La scheda scelta viene ricordata per la sessione del popover.

## Da dove vengono i gruppi

I gruppi non vengono dedotti dal testo. Li dichiara lo stat block, con un sottotitolo esplicito nella sezione delle azioni:

```html
<div class="section-title">Azioni Epiche</div>
<div class="manifestation">Titano</div>
<p class="entry"><span class="title">Breathe Deep (1/Round).</span> …</p>
```

- **Parser v7:** salva il sottotitolo come `group` su ogni capacità che segue, fino al sottotitolo o alla sezione successiva.
  - Un sottotitolo tra i tratti, o più lungo di 60 caratteri, rende l'import non valido.
  - I profili v1–v6 restano validi e non possono contenere `group`.
- **Senza sottotitoli:** i gruppi seguono la categoria (Azioni Epiche, Azioni, Reazioni). È il caso della fase 3, che ha un'unica manifestazione.

## Fixture di fase 2

| Gruppo | Capacità | Fonte nel testo canonico |
|---|---|---|
| Titano | Breathe Deep, Breath of the Long Night, Titan's Grasp, Crush, Hurl, Rock, Hand Slam | "il Titano attira la tormenta", "cono che origina dal Titano"; Gather elenca le Azioni Epiche del Titano |
| Proiezione Fatata | Icekiss +2, Frostmaiden's Kiss, Mark of the Frostmaiden, Spellcasting, Meteor Swarm | "origina dalla Proiezione Fatata", "che la Proiezione Fatata possa vedere", "la Proiezione Fatata lancia" |
| Auril | Gather the Winter Sky, Epic Resistance | azioni della creatura nel suo insieme |

Per spostare una capacità basta spostare la sua voce sotto un altro sottotitolo nella fixture e reimportarla.

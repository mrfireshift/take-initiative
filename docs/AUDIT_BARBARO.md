# Audit capacità del Barbaro

Report generato il 2026-08-01 a partire dal catalogo meccanico generale (versione 2).

## Obiettivo

Questo audit guarda una capacità alla volta e chiede se, durante un combattimento, convenga applicare un promemoria su uno o più token. Non decide quali risorse consumare e non automatizza danni o guarigioni; gli HP temporanei fissi senza tiro possono invece essere applicati dal runtime.

## Perimetro

Sono stati esaminati **68 record** del Barbaro base e dei 7 Cammini presenti nei JSON: phb2014, xanathar, tasha.

| Categoria | Record |
|---|---:|
| Marker token prioritario | 19 |
| Marker da curare | 6 |
| Effetto istantaneo | 13 |
| Gestione al tavolo | 26 |
| Coperta da capacità contenitore | 4 |

Marker prioritari: **19**. Marker da curare: **6**.

## Verifica durate runtime

Le durate delle capacità automatizzate sono confrontate con regole dichiarative per evitare marker troppo lunghi o troppo brevi.

| Capacità | Regola attesa | Runtime | Esito |
|---|---|---|---|
| Ira | {"kind":"rounds-with-end-conditions"} | {"kind":"rounds-with-end-conditions","rounds":10} | OK |
| Attacco Irruento | {"kind":"next-turn"} | {"kind":"next-turn"} | OK |
| Frenesia | {"kind":"until-feature","featureId":"barbaro-ira"} | {"kind":"until-feature","featureId":"barbaro-ira"} | OK |
| Presenza Intimidatoria | {"kind":"next-turn-end"} | {"kind":"next-turn-end"} | OK |
| Sintonia Totemica: Aquila | {"kind":"until-feature","featureId":"barbaro-ira"} | {"kind":"until-feature","featureId":"barbaro-ira"} | OK |
| Sintonia Totemica: Orso | {"kind":"until-feature","featureId":"barbaro-ira"} | {"kind":"until-feature","featureId":"barbaro-ira"} | OK |
| Spirito Totemico: Aquila | {"kind":"until-feature","featureId":"barbaro-ira"} | {"kind":"until-feature","featureId":"barbaro-ira"} | OK |
| Spirito Totemico: Lupo | {"kind":"until-feature","featureId":"barbaro-ira"} | {"kind":"until-feature","featureId":"barbaro-ira"} | OK |
| Spirito Totemico: Orso | {"kind":"until-feature","featureId":"barbaro-ira"} | {"kind":"until-feature","featureId":"barbaro-ira"} | OK |
| Protettori Ancestrali | {"kind":"next-turn"} | {"kind":"next-turn"} | OK |
| Magia Selvaggia: Teletrasporto | {"kind":"until-feature","featureId":"barbaro-ira"} | {"kind":"until-feature","featureId":"barbaro-ira"} | OK |
| Magia Selvaggia: Ritorsione della Forza | {"kind":"until-feature","featureId":"barbaro-ira"} | {"kind":"until-feature","featureId":"barbaro-ira"} | OK |
| Impeto Selvaggio | {"kind":"until-feature","featureId":"barbaro-ira"} | {"kind":"until-feature","featureId":"barbaro-ira"} | OK |
| Aura Tempestosa | {"kind":"until-feature","featureId":"barbaro-ira"} | {"kind":"until-feature","featureId":"barbaro-ira"} | OK |
| Tempesta Protettrice | {"kind":"until-feature","featureId":"barbaro-cammino-dell-araldo-della-tempesta-aura-tempestosa"} | {"kind":"until-feature","featureId":"barbaro-cammino-dell-araldo-della-tempesta-aura-tempestosa"} | OK |
| Forma della Bestia | {"kind":"until-feature","featureId":"barbaro-ira"} | {"kind":"until-feature","featureId":"barbaro-ira"} | OK |
| Chiamata alla Caccia | {"kind":"until-feature","featureId":"barbaro-ira"} | {"kind":"until-feature","featureId":"barbaro-ira"} | OK |
| Magia Corroborante | {"kind":"rounds","rounds":100} | {"kind":"rounds","rounds":100} | OK |
| Presenza Zelante | {"kind":"next-turn"} | {"kind":"next-turn"} | OK |

## Verifica concentrazione

Ira e le varianti legate a Ira devono chiudere la concentrazione del caster prima di lasciare attivo il marker.

| Capacità | Regola | Runtime | Esito |
|---|---|---|---|
| Ira | break | break | OK |
| Frenesia | break | break | OK |
| Sintonia Totemica: Aquila | break | break | OK |
| Sintonia Totemica: Orso | break | break | OK |
| Spirito Totemico: Aquila | break | break | OK |
| Spirito Totemico: Lupo | break | break | OK |
| Spirito Totemico: Orso | break | break | OK |
| Forma della Bestia | break | break | OK |
| Chiamata alla Caccia | break | break | OK |
| Magia Selvaggia: Teletrasporto | break | break | OK |
| Magia Selvaggia: Ritorsione della Forza | break | break | OK |
| Impeto Selvaggio | break | break | OK |
| Aura Tempestosa | break | break | OK |

## Candidati prioritari

| Capacità | Livello | Esito | Bersaglio | Durata | Nota |
|---|---:|---|---|---|---|
| Ira | 1 | Marker token prioritario | self | ira_con_terminazioni | Stato centrale del Barbaro: bersaglio personale e durata/terminazione già definite; adapter esistente. |
| Attacco Irruento | 2 | Marker token prioritario | self | fino_al_prossimo_turno | Scelta attiva che modifica gli attacchi del turno e rende il Barbaro più facile da colpire fino al suo turno successivo. |
| Frenesia | 3 | Marker token prioritario | self | fino_a_termine_ira | Scelta effettuata entrando in Ira; abilita un attacco con azione bonus per turno e termina con Ira. |
| Presenza Intimidatoria | 10 | Marker token prioritario | single_target | fino_al_termine_del_prossimo_turno_del_barbaro | Applica spaventato a un bersaglio scelto fino al termine del prossimo turno, con rinnovo esplicito. |
| Spirito Totemico: Aquila | 3 | Marker token prioritario | self | ira | La variante Aquila resta attiva per tutta Ira e ricorda volo, Scatto e svantaggio agli attacchi di opportunità. |
| Spirito Totemico: Lupo | 3 | Marker token prioritario | aura | ira | L'aura automatica aggiorna area, alleati e pill di vantaggio mentre il barbaro è in Ira. |
| Spirito Totemico: Orso | 3 | Marker token prioritario | self | ira | La resistenza a tutti i danni tranne psichici resta attiva per tutta Ira e merita un promemoria sul barbaro. |
| Sintonia Totemica: Aquila | 14 | Marker token prioritario | self | fino_a_termine_ira | Volo attivo durante Ira: bersaglio e durata sono chiari e il promemoria sul token evita di dimenticare la caduta a fine turno. |
| Sintonia Totemica: Orso | 14 | Marker token prioritario | aura | ira | L'aura automatica aggiorna le creature ostili vicine e la pill di svantaggio mentre il barbaro si muove. |
| Protettori Ancestrali | 3 | Marker token prioritario | single_target | fino_all_inizio_del_prossimo_turno_del_barbaro | La prima creatura colpita diventa un bersaglio preciso fino all'inizio del prossimo turno; il marker ricorda svantaggio e resistenza indiretta. |
| Aura Tempestosa | 3 | Marker token prioritario | aura | ira | L'area automatica di 3 metri resta agganciata al barbaro e il dropdown conserva l'ambiente scelto; danni e HP vengono risolti dal testo del marker. |
| Tempesta Protettrice | 10 | Marker token prioritario | selected_allies | aura | L'area automatica riconcilia solo gli alleati selezionati e applica la pill di resistenza finché restano nell'Aura Tempestosa. |
| Forma della Bestia | 3 | Marker token prioritario | self | ira | Il marker conserva la scelta Morso, Artigli o Coda fino al termine di Ira; tiri e guarigioni restano manuali. |
| Chiamata alla Caccia | 14 | Marker token prioritario | selected_allies | ira | Le pill sui compagni ricordano il d6 per i danni fino al termine di Ira e il barbaro riceve automaticamente 5 HP temporanei per creatura scelta. |
| Impeto Selvaggio | 3 | Marker token prioritario | self | ira | Si attiva automaticamente con Ira; il dropdown registra l'esito rinominato della tabella sul token e mantiene esplicite le risoluzioni manuali. |
| Magia Selvaggia: Ritorsione della Forza | 3 | Marker token prioritario | self | fino_a_termine_ira | Effetto reattivo persistente: chi colpisce il Barbaro subisce danni fino al termine di Ira. |
| Magia Selvaggia: Teletrasporto | 3 | Marker token prioritario | self | fino_a_termine_ira | Teletrasporto ripetibile come azione bonus fino al termine di Ira: stato chiaro sul Barbaro. |
| Magia Corroborante | 6 | Marker token prioritario | single_target | 10_minuti | Il marker sul bersaglio conserva per 10 minuti la scelta tra bonus al d20 e recupero slot; dadi e slot restano manuali. |
| Presenza Zelante | 10 | Marker token prioritario | selected_allies | fino_all_inizio_del_prossimo_turno_del_barbaro | Fino a dieci alleati ricevono vantaggio su attacchi e tiri salvezza fino all'inizio del prossimo turno. |

## Criteri applicati

- **Marker prioritario**: Candidato prioritario per una pill sul token, con bersaglio e durata sufficientemente chiari.
- **Marker da curare**: Candidato utile, ma da curare per aura, scelta, bersagli multipli o durata composta.
- **Effetto istantaneo**: Si risolve nell'evento; il promemoria eventuale è manuale e non persistente.
- **Gestione al tavolo**: Passiva, statica, narrativa, di reazione o troppo contestuale per una pill persistente.
- **Coperta da parent**: Non genera una pill autonoma: è già rappresentata dal marker della capacità contenitore.
- Le risorse servono solo a descrivere il contesto; non sono un criterio di priorità e non vengono automatizzate.
- Gli HP temporanei fissi e privi di tiro possono essere applicati automaticamente; valori con dadi o risoluzione mista restano manuali.

## Coda di revisione

| Capacità | Livello | Esito | Bersaglio | Durata | Nota |
|---|---:|---|---|---|---|
| Tempesta Furibonda | 14 | Marker da curare | single_target | fino_al_prossimo_turno | Le tre varianti applicano danno, Prono o velocità 0 a un bersaglio; il marker dipende dall'ambiente e dalla condizione scelta. |
| Magia Selvaggia: Dardo di Luce | 3 | Marker da curare | mixed | fino_al_prossimo_turno | Accecamento su un bersaglio e riuso come azione bonus fino a fine Ira; combina marker su bersaglio e stato sul Barbaro. |
| Magia Selvaggia: Luci Protettive | 3 | Marker da curare | self_and_selected_allies | ira | Bonus CA sul Barbaro e alleati entro 3 metri; aura dinamica da ricordare senza applicare automaticamente il bonus. |
| Magia Selvaggia: Rampicanti | 3 | Marker da curare | aura | ira | Terreno difficile per i nemici entro 4,5 metri fino alla fine di Ira; richiede area dinamica. |
| Magia Selvaggia: Spirito Esplosivo | 3 | Marker da curare | mixed | ira | Spirito temporaneo, esplosione a fine turno e riuso come azione bonus: bersagli e timing composti. |
| Ira Imperitura | 14 | Marker da curare | self | ira | Stato speciale del Barbaro a 0 HP mentre è in Ira; utile come promemoria, ma con regole di morte condizionali. |

## Dettaglio completo

### Cammino del Berserker

| Capacità | Livello | Esito | Bersaglio | Durata | Nota |
|---|---:|---|---|---|---|
| Frenesia | 3 | Marker token prioritario | self | fino_a_termine_ira | Scelta effettuata entrando in Ira; abilita un attacco con azione bonus per turno e termina con Ira. |
| Ira Incontenibile | 6 | Coperta da capacità contenitore | self | ira | È una modifica del marker Ira: sospende affascinato/spaventato senza richiedere una pill separata. |
| Presenza Intimidatoria | 10 | Marker token prioritario | single_target | fino_al_termine_del_prossimo_turno_del_barbaro | Applica spaventato a un bersaglio scelto fino al termine del prossimo turno, con rinnovo esplicito. |
| Ritorsione | 14 | Effetto istantaneo | event_target | reazione | È un attacco di reazione immediato; non lascia un effetto persistente da ricordare. |

### Cammino del Combattente Totemico

| Capacità | Livello | Esito | Bersaglio | Durata | Nota |
|---|---:|---|---|---|---|
| Cercatore di Spiriti | 3 | Gestione al tavolo | self | rituale | Accesso a rituali fuori dalla gestione del round. |
| Spirito Totemico | 3 | Gestione al tavolo | self | scelta_sottoclasse | Contenitore della scelta del totem. |
| Spirito Totemico: Aquila | 3 | Marker token prioritario | self | ira | La variante Aquila resta attiva per tutta Ira e ricorda volo, Scatto e svantaggio agli attacchi di opportunità. |
| Spirito Totemico: Lupo | 3 | Marker token prioritario | aura | ira | L'aura automatica aggiorna area, alleati e pill di vantaggio mentre il barbaro è in Ira. |
| Spirito Totemico: Orso | 3 | Marker token prioritario | self | ira | La resistenza a tutti i danni tranne psichici resta attiva per tutta Ira e merita un promemoria sul barbaro. |
| Aquila | 6 | Gestione al tavolo | self | passiva | Percezione e vista migliorate, prevalentemente esplorative. |
| Aspetto della Bestia | 6 | Gestione al tavolo | self | scelta_sottoclasse | Contenitore di una scelta permanente del totem. |
| Lupo | 6 | Gestione al tavolo | self | passiva | Tracciamento di viaggio e furtività, non di uno stato del round. |
| Orso | 6 | Gestione al tavolo | self | passiva | Capacità di trasporto e prove di Forza, senza stato persistente di combattimento. |
| Viandante Spirituale | 10 | Gestione al tavolo | self | rituale | Incantesimo rituale e informazione narrativa. |
| Lupo | 14 | Effetto istantaneo | event_target | azione_bonus | Atterramento su un bersaglio dopo un colpo; il risultato può essere gestito dalla condizione Prono. |
| Sintonia Totemica | 14 | Gestione al tavolo | self | scelta_sottoclasse | Contenitore della scelta di Sintonia Totemica. |
| Sintonia Totemica: Aquila | 14 | Marker token prioritario | self | fino_a_termine_ira | Volo attivo durante Ira: bersaglio e durata sono chiari e il promemoria sul token evita di dimenticare la caduta a fine turno. |
| Sintonia Totemica: Orso | 14 | Marker token prioritario | aura | ira | L'aura automatica aggiorna le creature ostili vicine e la pill di svantaggio mentre il barbaro si muove. |

### Cammino del Guardiano Ancestrale

| Capacità | Livello | Esito | Bersaglio | Durata | Nota |
|---|---:|---|---|---|---|
| Protettori Ancestrali | 3 | Marker token prioritario | single_target | fino_all_inizio_del_prossimo_turno_del_barbaro | La prima creatura colpita diventa un bersaglio preciso fino all'inizio del prossimo turno; il marker ricorda svantaggio e resistenza indiretta. |
| Spiriti Protettori | 6 | Effetto istantaneo | event_target | reazione | Riduzione di danno su un evento; non c'è uno stato persistente da applicare. |
| Consultare gli Spiriti | 10 | Gestione al tavolo | self | riposo_breve_o_lungo | Capacità di lancio e consultazione, non un'applicazione su token nel round. |
| Antenati Vendicativi | 14 | Effetto istantaneo | event_target | reazione | Danno riflesso nello stesso evento di Spiriti Protettori. |

### Cammino dell'Araldo della Tempesta

| Capacità | Livello | Esito | Bersaglio | Durata | Nota |
|---|---:|---|---|---|---|
| Aura Tempestosa | 3 | Marker token prioritario | aura | ira | L'area automatica di 3 metri resta agganciata al barbaro e il dropdown conserva l'ambiente scelto; danni e HP vengono risolti dal testo del marker. |
| Deserto | 3 | Effetto istantaneo | aura | attivazione | Danno ad area risolto ogni volta che l'aura viene attivata. |
| Mare | 3 | Effetto istantaneo | single_target | attivazione | Tiro salvezza e danno immediato su una creatura entro l'aura. |
| Tundra | 3 | Effetto istantaneo | selected_allies | attivazione | HP temporanei con dado applicati a scelta nell'aura; il tiro e il calcolo restano manuali. |
| Anima Tempestosa | 6 | Gestione al tavolo | self | passiva | Resistenze e movimenti scelti dall'ambiente, senza applicazione ricorrente a un bersaglio nel round. |
| Tempesta Protettrice | 10 | Marker token prioritario | selected_allies | aura | L'area automatica riconcilia solo gli alleati selezionati e applica la pill di resistenza finché restano nell'Aura Tempestosa. |
| Tempesta Furibonda | 14 | Marker da curare | single_target | fino_al_prossimo_turno | Le tre varianti applicano danno, Prono o velocità 0 a un bersaglio; il marker dipende dall'ambiente e dalla condizione scelta. |

### Cammino della Bestia

| Capacità | Livello | Esito | Bersaglio | Durata | Nota |
|---|---:|---|---|---|---|
| Artigli | 3 | Coperta da capacità contenitore | self | ira | È una variante dell'arma naturale scelta dentro Forma della Bestia, non una pill separata. |
| Coda | 3 | Coperta da capacità contenitore | self | ira | È una variante dell'arma naturale scelta dentro Forma della Bestia, non una pill separata. |
| Forma della Bestia | 3 | Marker token prioritario | self | ira | Il marker conserva la scelta Morso, Artigli o Coda fino al termine di Ira; tiri e guarigioni restano manuali. |
| Morso | 3 | Coperta da capacità contenitore | self | ira | La guarigione del morso è un effetto d'innesco; la forma resta rappresentata dal marker parent. |
| Anima Bestiale | 6 | Gestione al tavolo | self | fino_al_prossimo_riposo | Scelta di movimento che dura tra i riposi; non è un'applicazione specifica del round. |
| Furia Contagiosa | 10 | Effetto istantaneo | single_target | reazione | Tiro salvezza e conseguenza immediata sul bersaglio; nessun effetto persistente da ricordare. |
| Chiamata alla Caccia | 14 | Marker token prioritario | selected_allies | ira | Le pill sui compagni ricordano il d6 per i danni fino al termine di Ira e il barbaro riceve automaticamente 5 HP temporanei per creatura scelta. |

### Cammino della Magia Selvaggia

| Capacità | Livello | Esito | Bersaglio | Durata | Nota |
|---|---:|---|---|---|---|
| Consapevolezza Magica | 3 | Effetto istantaneo | self | fino_al_prossimo_turno | Informazione temporanea ottenuta con un'azione, senza stato da mostrare su altri token. |
| Impeto Selvaggio | 3 | Marker token prioritario | self | ira | Si attiva automaticamente con Ira; il dropdown registra l'esito rinominato della tabella sul token e mantiene esplicite le risoluzioni manuali. |
| Magia Selvaggia: Arma Infusa | 3 | Effetto istantaneo | self | fine_turno_corrente | Infusione temporanea di un'arma fino alla fine del turno; promemoria breve e manuale. |
| Magia Selvaggia: Dardo di Luce | 3 | Marker da curare | mixed | fino_al_prossimo_turno | Accecamento su un bersaglio e riuso come azione bonus fino a fine Ira; combina marker su bersaglio e stato sul Barbaro. |
| Magia Selvaggia: Luci Protettive | 3 | Marker da curare | self_and_selected_allies | ira | Bonus CA sul Barbaro e alleati entro 3 metri; aura dinamica da ricordare senza applicare automaticamente il bonus. |
| Magia Selvaggia: Rampicanti | 3 | Marker da curare | aura | ira | Terreno difficile per i nemici entro 4,5 metri fino alla fine di Ira; richiede area dinamica. |
| Magia Selvaggia: Ritorsione della Forza | 3 | Marker token prioritario | self | fino_a_termine_ira | Effetto reattivo persistente: chi colpisce il Barbaro subisce danni fino al termine di Ira. |
| Magia Selvaggia: Spirito Esplosivo | 3 | Marker da curare | mixed | ira | Spirito temporaneo, esplosione a fine turno e riuso come azione bonus: bersagli e timing composti. |
| Magia Selvaggia: Teletrasporto | 3 | Marker token prioritario | self | fino_a_termine_ira | Teletrasporto ripetibile come azione bonus fino al termine di Ira: stato chiaro sul Barbaro. |
| Magia Selvaggia: Viti Oscure | 3 | Effetto istantaneo | mixed | attivazione | Danno ad area e HP temporanei immediati; gli HP temporanei non sono automatizzati. |
| Magia Corroborante | 6 | Marker token prioritario | single_target | 10_minuti | Il marker sul bersaglio conserva per 10 minuti la scelta tra bonus al d20 e recupero slot; dadi e slot restano manuali. |
| Reazione Instabile | 10 | Effetto istantaneo | self | attivazione | Sostituisce il risultato di Magia Selvaggia in risposta a un evento; non crea necessariamente uno stato autonomo. |
| Impeto Controllato | 14 | Gestione al tavolo | self | passiva | Modifica il tiro sulla tabella, senza applicazione persistente a un token. |

### Cammino dello Zelota

| Capacità | Livello | Esito | Bersaglio | Durata | Nota |
|---|---:|---|---|---|---|
| Furia Divina | 3 | Effetto istantaneo | event_target | una_volta_per_turno | Danno extra alla prima creatura colpita in ciascun turno; il promemoria di disponibilità resta manuale. |
| Guerriero degli Dèi | 3 | Gestione al tavolo | self | passiva | Protezione dalla resurrezione, fuori dal tracciamento del round. |
| Concentrazione Fanatica | 6 | Gestione al tavolo | self | ira | Un singolo ritentativo per Ira; non è un effetto persistente e non si tracciano risorse. |
| Presenza Zelante | 10 | Marker token prioritario | selected_allies | fino_all_inizio_del_prossimo_turno_del_barbaro | Fino a dieci alleati ricevono vantaggio su attacchi e tiri salvezza fino all'inizio del prossimo turno. |
| Ira Imperitura | 14 | Marker da curare | self | ira | Stato speciale del Barbaro a 0 HP mentre è in Ira; utile come promemoria, ma con regole di morte condizionali. |

## Output e prossima decisione

Il report non abilita automaticamente nuove capacità nel runtime. Il primo lotto implementabile è costituito dai marker prioritari; per quelli da curare occorre prima definire il comportamento UI per bersagli multipli, aure e scelte del Cammino.

Il dettaglio macchina è disponibile in [barbaro-combat-audit.json](../data/class-features/barbaro-combat-audit.json).

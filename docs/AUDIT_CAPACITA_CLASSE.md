# Audit capacità di classe

Report generato il 2026-10-14 dai tre overlay meccanici locali.

## Perimetro

Il catalogo contiene **860 record**. Il catalogo runtime attuale ne espone **860**. Le risorse non sono un obiettivo di questo audit.

| Categoria | Record |
|---|---:|
| Manuale del Giocatore 2014 | 440 |
| Guida Omnicomprensiva di Xanathar | 199 |
| Calderone Omnicomprensivo di Tasha | 176 |
| Unearthed Arcana: Ranger, Revised (2016) | 45 |

## Esito per il combattimento

| Categoria | Record |
|---|---:|
| Tracciamento su token | 8 |
| Candidato token da curare | 160 |
| Effetto istantaneo | 43 |
| Gestione al tavolo | 649 |

- Marker ad alta confidenza: **8**.
- Marker da curare prima dell'esposizione: **160** (strutturati: 13, testuali: 147).
- Effetti istantanei senza pill persistente: **43**.
- Risorse escluse come criterio: **sì**.

## Marker ad alta confidenza

| Categoria | Record |
|---|---:|
| Ira | barbaro-ira |
| Ispirazione Bardica | bardo-ispirazione-bardica |
| Forma Selvatica | druido-forma-selvatica |
| Incanalare Divinità: Giuramento di Inimicizia | paladino-giuramento-di-vendetta-incanalare-divinita-giuramento-di-inimicizia |
| Parole Inquietanti | bardo-collegio-dell-eloquenza-parole-inquietanti |
| Ispirazione Contagiosa | bardo-collegio-dell-eloquenza-ispirazione-contagiosa |
| Incanalare Divinità: Santuario del Crepuscolo | chierico-dominio-del-crepuscolo-incanalare-divinita-santuario-del-crepuscolo |
| Protettori Ancestrali | barbaro-cammino-del-guardiano-ancestrale-protettori-ancestrali |

## Regole dell'audit

- **Marker token**: la capacità viene applicata a un token e resta da ricordare per round, durata o consumo.
- **Marker da curare**: il testo indica un possibile stato persistente, ma bersaglio/durata/effetto non sono ancora abbastanza espliciti.
- **Effetto istantaneo**: danno, guarigione, tiro o consumo che non richiede una pill persistente.
- Le tre candidate deterministiche dell'audit precedente sono escluse da questa roadmap.
- Nessun marker viene promosso senza bersaglio e durata espliciti, salvo adapter già verificato.

## Roadmap

### 1. Marker token ad alta confidenza (8)

### 2. Curare i marker suggeriti dal testo o da effetti incompleti (160)

### 3. Lasciare gli effetti istantanei alla risoluzione manuale (43)

### 4. Escludere passive, riferimenti e soli contenitori di risorse (649)

Il dettaglio per ogni record, inclusi segnali testuali, effetti marker, bersaglio, durata e stato runtime, è disponibile in [class-feature-automation-audit.json](../data/class-features/class-feature-automation-audit.json).

## Stato runtime

| Categoria | Record |
|---|---:|
| not-automated | 801 |
| implemented | 59 |

## Backlog per primitiva

Capacità non implementate: **801**. Raggiungibili con soli override: **736** (di cui automazione: **148**, il resto carte descrittive). Bloccate da una primitiva mancante: **65**. Archetipo e primitiva sono euristiche da confermare nel batch; le decisioni manuali confermate sono 2.

| Primitiva | Disponibile | Implementate | Da fare |
|---|---|---:|---:|
| Carta descrittiva (`reference-only`) | sì | 0 | 588 |
| Consumo risorsa (`resource-only`) | sì | 11 | 48 |
| Pill con durata (`condition`) | sì | 23 | 61 |
| Pill con esito scelto dal GM (choiceOptions) (`condition-choice`) | sì | 1 | 25 |
| Aura dinamica (`aura`) | sì | 11 | 14 |
| Adapter dedicato esistente (`custom-adapter`) | sì | 13 | 0 |
| Valore numerico inserito dal GM (cura/PF temporanei) (`value-input`) | no | 0 | 28 |
| Compagno o evocazione su token esistente (`linked-token`) | no | 0 | 17 |
| Trasformazione (`transformation`) | no | 0 | 6 |
| Ponte verso il sistema Incantesimi (`spell-bridge`) | no | 0 | 14 |

| Archetipo | Primitiva | Implementate | Da fare |
|---|---|---:|---:|
| Descrittiva / passiva (`reference`) | `reference-only` | 0 | 430 |
| Reazione o effetto istantaneo da ricordare (`instant-reminder`) | `reference-only` | 0 | 137 |
| Movimento / teletrasporto (`movement`) | `reference-only` | 0 | 21 |
| Solo consumo risorsa (`resource-only`) | `resource-only` | 11 | 48 |
| Buff o marker con durata (`timed-condition`) | `condition` | 23 | 61 |
| Condizione dopo tiro salvezza (`save-outcome-condition`) | `condition-choice` | 1 | 25 |
| Aura (`aura`) | `aura` | 11 | 14 |
| Cura o PF temporanei (`hp-change`) | `value-input` | 0 | 28 |
| Compagno / evocazione (`companion-summon`) | `linked-token` | 0 | 17 |
| Trasformazione (`transformation`) | `transformation` | 0 | 6 |
| Lancio o slot tramite capacità (`spell-bridge`) | `spell-bridge` | 0 | 14 |
| Adapter dedicato (`custom-adapter`) | `custom-adapter` | 13 | 0 |

## Backlog per classe

| Classe | Implementate | Carte descrittive | Automazione con dati | Richiede primitiva | Primitive mancanti |
|---|---:|---:|---:|---:|---|
| Barbaro | 20 | 42 | 5 | 1 | spell-bridge 1 |
| Bardo | 5 | 28 | 10 | 3 | value-input 2, spell-bridge 1 |
| Chierico | 3 | 55 | 15 | 5 | value-input 4, spell-bridge 1 |
| Druido | 0 | 36 | 7 | 13 | linked-token 5, transformation 3, value-input 3, spell-bridge 2 |
| Guerriero | 0 | 63 | 25 | 5 | value-input 3, spell-bridge 1, transformation 1 |
| Ladro | 4 | 47 | 11 | 1 | linked-token 1 |
| Mago | 0 | 44 | 12 | 5 | linked-token 2, spell-bridge 2, value-input 1 |
| Monaco | 0 | 54 | 23 | 2 | value-input 2 |
| Paladino | 12 | 24 | 17 | 3 | value-input 3 |
| Ranger | 0 | 57 | 4 | 4 | spell-bridge 3, linked-token 1 |
| Ranger (Revised) | 2 | 38 | 2 | 3 | linked-token 3 |
| Stregone | 13 | 30 | 8 | 5 | transformation 2, value-input 2, linked-token 1 |
| Warlock | 0 | 70 | 9 | 15 | value-input 8, linked-token 4, spell-bridge 3 |

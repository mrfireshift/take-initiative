# Audit capacità di classe

Report generato il 2026-08-02 dai tre overlay meccanici locali.

## Perimetro

Il catalogo contiene **860 record**. Il catalogo runtime attuale ne espone **542**. Le risorse non sono un obiettivo di questo audit.

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
| not-automated | 483 |
| implemented | 59 |
| non_esposta | 318 |

# Audit capacità di classe

Report generato il 2026-08-01 dai tre overlay meccanici locali.

## Perimetro

Il catalogo contiene **815 record**. Il catalogo runtime attuale ne espone **416**. Le risorse non sono un obiettivo di questo audit.

| Categoria | Record |
|---|---:|
| Manuale del Giocatore 2014 | 440 |
| Guida Omnicomprensiva di Xanathar | 199 |
| Calderone Omnicomprensivo di Tasha | 176 |

## Esito per il combattimento

| Categoria | Record |
|---|---:|
| Tracciamento su token | 6 |
| Candidato token da curare | 160 |
| Effetto istantaneo | 28 |
| Gestione al tavolo | 621 |

- Marker ad alta confidenza: **6**.
- Marker da curare prima dell'esposizione: **160** (strutturati: 14, testuali: 146).
- Effetti istantanei senza pill persistente: **28**.
- Risorse escluse come criterio: **sì**.

## Marker ad alta confidenza

| Categoria | Record |
|---|---:|
| Ira | barbaro-ira |
| Ispirazione Bardica | bardo-ispirazione-bardica |
| Forma Selvatica | druido-forma-selvatica |
| Incanalare Divinità: Giuramento di Inimicizia | paladino-giuramento-di-vendetta-incanalare-divinita-giuramento-di-inimicizia |
| Incanalare Divinità: Santuario del Crepuscolo | chierico-dominio-del-crepuscolo-incanalare-divinita-santuario-del-crepuscolo |
| Protettori Ancestrali | barbaro-cammino-del-guardiano-ancestrale-protettori-ancestrali |

## Regole dell'audit

- **Marker token**: la capacità viene applicata a un token e resta da ricordare per round, durata o consumo.
- **Marker da curare**: il testo indica un possibile stato persistente, ma bersaglio/durata/effetto non sono ancora abbastanza espliciti.
- **Effetto istantaneo**: danno, guarigione, tiro o consumo che non richiede una pill persistente.
- Le tre candidate deterministiche dell'audit precedente sono escluse da questa roadmap.
- Nessun marker viene promosso senza bersaglio e durata espliciti, salvo adapter già verificato.

## Roadmap

### 1. Marker token ad alta confidenza (6)

### 2. Curare i marker suggeriti dal testo o da effetti incompleti (160)

### 3. Lasciare gli effetti istantanei alla risoluzione manuale (28)

### 4. Escludere passive, riferimenti e soli contenitori di risorse (621)

Il dettaglio per ogni record, inclusi segnali testuali, effetti marker, bersaglio, durata e stato runtime, è disponibile in [class-feature-automation-audit.json](../data/class-features/class-feature-automation-audit.json).

## Stato runtime

| Categoria | Record |
|---|---:|
| non_esposta | 399 |
| implemented | 21 |
| not-automated | 395 |

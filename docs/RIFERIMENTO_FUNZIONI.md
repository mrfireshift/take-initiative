# Riferimento delle funzioni

## Matrice GM/player

| Funzione | GM | Player |
| --- | --- | --- |
| Vedere ordine, round e turno attivo | Sì | Sì |
| Toolbar Incontro/Tracker | Sì | No |
| Modificare HP, condizioni e incantesimi | Sì | No |
| Vedere HP dei PG | Sì | Sì |
| Vedere HP degli alleati | Sì | Sì nell'estesa; nascosti nella compatta |
| Vedere HP di neutrali/nemici | Sì | No |
| Console HP rapida | Sì | No |
| Creare/stilizzare aree AoE | Sì | No |
| Vedere aree persistenti | Sì | Sì |
| Creare e gestire clock | Sì | No |
| Vedere clock dichiarati visibili | Sì | Sì |
| Impostare quota | Sì | No |
| Usare Distanza 3D | Sì | Sì |

## Condizioni predefinite

Il catalogo comprende:

- Accecato
- Affascinato
- Afferrato
- Assordato
- Avvelenato
- Incapacitato
- Invisibile
- Paralizzato
- Pietrificato
- Privo di sensi
- Prono
- Spaventato
- Stordito
- Trattenuto
- Indebolimento
- Ira
- Giuramento di Inimicizia

L'indebolimento è riconosciuto dal catalogo ma viene modificato dalla scheda iniziativa, non dal selettore generico. È inoltre possibile definire condizioni personalizzate.

### Modalità di scadenza

| Modalità | Comportamento |
| --- | --- |
| Manuale | Resta attiva finché il GM non la rimuove. |
| Round | Scade dopo il numero di round indicato. |
| Inizio turno | Scade all'inizio del turno dell'attore associato. |
| Fine turno | Scade alla fine del turno dell'attore associato. |
| Concentrazione | Termina quando viene interrotta la concentrazione collegata. |

## Interazioni condizioni/velocità

| Condizione | Effetto automatico |
| --- | --- |
| Afferrato | Velocità 0 |
| Trattenuto | Velocità 0 |
| Paralizzato | Velocità 0 |
| Pietrificato | Velocità 0 |
| Stordito | Velocità 0 |
| Privo di sensi | Velocità 0 |
| Indebolimento 2–4 | Velocità dimezzata, caselle arrotondate per difetto |
| Indebolimento 5 | Velocità 0 |
| Prono | Rialzarsi costa metà movimento; movimento prono ×2 |

## Console HP rapida

| Modalità | Risultato |
| --- | --- |
| Danno | Sottrae HP dopo l'applicazione del fattore. |
| Cura | Aggiunge HP senza superare `hpMax`. |
| HP temp. | Imposta gli HP temporanei secondo la logica del modulo. |

Fattori per bersaglio: `×2`, `1`, `½`, `¼`. L'anteprima mostra valore precedente, valore successivo e variazione prima della conferma.

## Fazioni e filtri

Condizioni, Incantesimi e Console HP condividono la stessa logica:

- ricerca testuale per nome;
- toggle indipendenti PG, Alleati, Neutrali e Nemici;
- nessun toggle attivo equivale a nessun filtro di fazione;
- più toggle attivi producono l'unione delle categorie;
- la selezione della lista è sincronizzata con la selezione sulla mappa.

## Risorse boss

| Modalità | Metadata principali | Effetto nell'ordine |
| --- | --- | --- |
| Leggendario | azioni e resistenze, ciascuna con `current` e `max` | Card boss con due contatori |
| Paragon | numero di azioni/turni | Più voci virtuali per lo stesso token |
| Epic | flag epic e iniziativa 20 | Azioni epiche virtuali nell'ordine |

Le tre modalità sono mutuamente esclusive.

## Clock

| Proprietà | Valori |
| --- | --- |
| Segmenti | 4, 6, 8, 12 |
| Valore | da 0 al numero di segmenti |
| Visibilità | tutti oppure solo GM |
| Colori | rosso, ambra, verde, azzurro, viola, rosa |
| Operazioni | crea, rinomina, ±1, azzera, riordina, elimina |

## Distanza 3D

Il calcolo usa:

```text
distanza_3D = sqrt(distanza_planare² + dislivello²)
```

La distanza planare non è centro-centro: viene calcolata tra le caselle occupate più vicine. La misura risultante è espressa nelle unità della scena e presentata anche in caselle D&D.

## Aree di effetto

| Forma | Misura mostrata | Regola di inclusione |
| --- | --- | --- |
| Cerchio | raggio | Caselle toccate dal template |
| Quadrato | lato | Caselle comprese nel quadrato |
| Cono | lunghezza | Template di Xanathar, rotazione libera |
| Linea | lunghezza | Caselle attraversate dalla linea |

La selezione considera l'intersezione tra l'area e l'ingombro del token, inclusi i token grandi. Ogni area persistente conserva geometria e stile nei propri metadata.

## Persistenza funzionale

| Dato | Ambito |
| --- | --- |
| HP, iniziativa, fazione, condizioni, incantesimi, boss, quota | Token |
| Ordine, turno, round, gruppi, turni virtuali | Scena |
| Clock | Scena |
| Cronologia Undo e log di combattimento | Scena |
| Memoria persistente dei PG e card | Room, con fallback locale |
| Posizioni finestre, layout e stile AoE | Browser locale |

Per i nomi esatti delle chiavi consulta [Architettura e dati](ARCHITETTURA.md).

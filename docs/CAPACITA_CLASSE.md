# Capacità di classe

Take Initiative! conserva nella scheda personaggio la classe, la sottoclasse e
il livello di un personaggio e può offrire un workflow per le capacità di
classe. Il sistema è un assistente per il tavolo: registra risorse, durata,
bersagli e reminder, ma non tira dadi e non decide gli esiti di gioco.

## Stato corrente del catalogo

Il catalogo runtime è `src/class-features-runtime.json`, versione `4`.
Contiene **860 capacità**, **104 pool di risorse** e 13 identificatori di
classe. L'identificatore `ranger-revised` è il dataset opzionale Unearthed
Arcana 2016 e non è la stessa progressione del Ranger 2014.

| Sorgente | Record runtime |
| --- | ---: |
| Manuale del Giocatore 2014 | 440 |
| Guida Omnicomprensiva di Xanathar | 199 |
| Calderone Omnicomprensivo di Tasha | 176 |
| Unearthed Arcana: Ranger, Revised (2016) | 45 |
| **Totale** | **860** |

Lo stato di supporto è intenzionalmente esplicito:

- **267 `implemented`**: la capacità può essere attivata dal runtime secondo
  l'adapter dichiarato;
- **593 `not-automated`**: la voce resta consultabile e gestibile manualmente,
  ma il pulsante di attivazione non applica una meccanica automatica. Le
  passive, le reazioni e gli effetti istantanei compaiono come
  **Promemoria descrittivo**; le altre come gestione manuale al tavolo, con il
  loro pool di risorse tracciato;
- anche una capacità `implemented` può chiedere al GM un tiro, una scelta o una
  conferma manuale.

Perciò la presenza nel catalogo non equivale a un'automazione RAW completa.
L'[audit generato](AUDIT_CAPACITA_CLASSE.md) contiene lo snapshot tecnico, non
una guida al tavolo.

## Configurare una scheda

Il GM apre la card del token e seleziona la scheda **Capacità**.

1. In modalità modifica aggiunge fino a **quattro classi**.
2. Per ogni classe indica un livello da 1 a 20 e, quando disponibile, la
   sottoclasse.
3. Controlla le capacità filtrate dalla combinazione classe/livello/sottoclasse.
4. Abilita esplicitamente le capacità che devono comparire sulla card.
5. Salva la scheda e verifica le risorse iniziali proposte dal catalogo.

Nella scheda delle statistiche, in modalità modifica, il GM può compilare i
**Modificatori di caratteristica**. Servono a due cose:

- calcolare il massimo dei pool che dipendono da una caratteristica, per
  esempio Ispirazione Bardica, Percezione del Divino, Tocco Purificatore,
  Difesa Gloriosa e Viandante Velato;
- mostrare nel popup del TS la CD 8 + competenza + modificatore di Runa del
  Fuoco, Runa della Pietra e Squarciare la Mente.

Senza modificatori, il massimo di quei pool resta da scrivere a mano nella
card, come prima. Quando il GM li compila, il massimo calcolato sostituisce
quello scritto a mano.

Le capacità con `defaultEnabled` possono essere proposte automaticamente al
primo profilo; una configurazione esplicita diventa la selezione persistente
del personaggio. Tutti i privilegi sono proposti di default; le opzioni a scelta
(Stili di Combattimento, Manovre, Suppliche, Discipline, Rune, Tiri Arcani, Dono
del Patto…) restano da abilitare, e quelle a scelta singola sono esclusive. Un
profilo già configurato conserva la propria selezione: le carte aggiunte dopo
vanno abilitate dal GM. Le voci non automatizzate rimangono descrittive e non devono
essere abilitate aspettandosi un adapter che il catalogo non dichiara.

Il player può vedere le informazioni rese disponibili dalla card e i reminder,
ma non modifica build, risorse o istanze. I comandi di configurazione,
attivazione e terminazione sono del GM.

## Cosa compare sulla card

La sezione mostra, quando presenti:

- build di classe e sottoclasse;
- capacità abilitate, con stato `pronta`, `manuale` o descrittivo;
- pool di risorse con valore corrente, massimo, dado/formula e recupero;
- capacità attive con bersaglio, scelta, durata residua e caster;
- azioni rapide disponibili per le capacità supportate.

Una capacità attivabile può essere aperta dalla card o dal menu contestuale del
token. Le capacità a bersaglio usano la selezione sulla mappa e verificano, se
dichiarata, portata e numero massimo di bersagli.

## Modalità di effetto

| Modalità | Comportamento |
| --- | --- |
| `self` | L'istanza resta collegata al token che attiva la capacità. |
| `single-target` | Il GM seleziona un bersaglio, con eventuale limite e portata. |
| `aura` | Il token sorgente proietta un effetto sui token validi dentro l'area. |

Gli effetti persistenti vengono salvati come condizioni collegate all'istanza
della capacità. Sono quindi visibili nella finestra **Condizioni** e possono
essere rimossi senza cancellare condizioni manuali omonime. Le aure mobili sono
item derivati della scena e vengono riconciliate quando il caster o i bersagli
si spostano.

Il runtime distingue il caster, il bersaglio singolo e l'effetto proiettato
dall'aura. La rimozione usa l'identità dell'istanza, non soltanto il nome
visualizzato della condizione.

## Risorse e durate

Il GM può consumare, recuperare o reimpostare una risorsa dalla card. Il pool
dichiara il proprio massimo, dado o formula e il tipo di recupero previsto dal
catalogo. La presenza del testo “riposo breve/lungo” è un promemoria del
momento di recupero: il plugin non dichiara da solo che il tavolo abbia
completato un riposo.

Le attivazioni possono essere istantanee oppure conservare un'istanza con:

- `instanceId` stabile;
- sorgente e bersagli;
- scelta della variante;
- round di inizio e scadenza;
- condizioni figlie e collegamenti all'aura, se applicabili.

Alcuni adapter richiedono conferme aggiuntive: risultato del dado di Ispirazione
Bardica, esito di Scacciare Non Morti, modalità di Linguaggio Universale/Occhi
della Notte, scelta dello spell per Ladro di Incantesimi o livello dello slot
per Fonte di Magia. Questi passaggi restano deliberatamente al GM.

## Adapter attualmente pronti

Il catalogo non espone un elenco separato di “regole garantite”: il campo
`runtimeSupport.status` è l'autorità. Le famiglie sotto sono esempi delle
capacità già coperte dai test e dagli adapter:

| Area | Esempi di workflow |
| --- | --- |
| Barbaro | Ira, Attacco Irruento, Frenesia, Forma della Bestia, Impeto Selvaggio, Protettori Ancestrali, scelte totemiche e alcune aure. |
| Bardo | Ispirazione Bardica, Parole Inquietanti, Controfascino, Linguaggio Universale, Ispirazione Contagiosa; Parole di Terrore, Conoscenze dell'Ombra, Esibizione Estasiante, Manto di Maestà, Maestà Inviolabile, Creazione Animata e Virtuosismo della Lama. |
| Guerriero | Azione Impetuosa, Indomito, tutte le Manovre (dadi di Superiorità), Frecce del Tiro Arcano, Potenza del Gigante e Rune, Potere Psionico, Baluardo della Forza, Marchio Incrollabile, Forza di Fronte alla Morte. |
| Chierico | Santuario del Crepuscolo, Scacciare Non Morti, Passi nella Notte e le opzioni di Incanalare Divinità di tutti i domini; Legame Incoraggiante, Benedizione dell'Ingannatore, Ira dell'Ordine, Corona di Luce, Incarnazione della Legge. |
| Druido | Forma Selvatica e Forma Elementale come marker (i PF della bestia restano al GM), Forma Siderale e Totem Spirituale con scelta della variante, Entità Simbiotica, Diffusione di Spore, Infestazione Fungina, Spirito della Fiamma con Legame Migliorato e gli usi dei circoli. |
| Ladro | Imboscata Magica, Ingannatore Versatile, Ladro di Incantesimi e Colpo di Fortuna; i poteri della Lama Spirituale, Velo Psichico, Squarciare la Mente, Cammino Fantasma, Spavalderia, Combattimento Intuitivo e Maestro di Imboscate. |
| Mago | Portento, Terzo Occhio, Sguardo Ipnotico, Deviazione Arcana, Melodia della Lama, Comandare Non Morti e gli usi delle scuole (Trasposizione Benevola, Sosia Illusorio, Ordine degli Scribi). |
| Monaco | Ogni uso RAW del Ki: Difesa Paziente, Passo del Vento, Raffica di Colpi, Colpo Stordente, Corpo Vuoto, le discipline elementali e le capacità di tutte le tradizioni, con le pill di Schivata, Stordito, Sé Astrale, Palmo Tremante e Tranquillità. |
| Paladino | Imposizione delle Mani, Percezione del Divino, varianti di Incanalare Divinità, aure, Tocco Purificatore, Angelo Vendicatore e Nube Sacra; le opzioni di Incanalare Divinità di tutti i giuramenti, le aure della Sentinella, di Alacrità e di Interdizione, Difesa Gloriosa e i capstone dei giuramenti. |
| Ranger | Compagno del Ranger, Imboscata Terrificante, Preda dell'Uccisore, Combattente Planare, Passo Etereo, Scambio Seducente, Marea Avvolgente, Viandante Velato e gli usi delle sottoclassi. |
| Ranger Revised | Compagno Animale e Nascondersi in Piena Vista. |
| Stregone | Impulso/Onde di Magia Selvaggia, Fonte di Magia, metamagie supportate, Piegare la Fortuna e Ripristino Stregonesco; Presenza Draconica (aura con scelta), Ali di Drago e Ali Ultraterrene, Forma d'Ombra, Segugio dei Presagi Nefasti, Trance dell'Ordine, Anima del Vento e gli usi delle origini. |
| Warlock | Presenza Fatata e Delirio Oscuro (affascinato o spaventato), Fuga Velata, Maledizione della Lama del Sortilegio, Dono Elementale, Tentacoli delle Profondità, Scagliare all'Inferno, Mantello di Mosche, Tomba di Levistus, Sguardo Fantasma, Patto della Catena e gli usi dei patroni. |

L'elenco completo, con ID, adapter, durata, bersaglio e motivo di eventuale
esclusione, è nel catalogo JSON e nei test `test/*FeatureRuntime.test.js`.

## Limiti intenzionali

- il plugin non tira dadi e non calcola automaticamente successo o fallimento;
- danni, guarigioni, trasformazioni, evocazioni e condizioni dipendenti da un
  esito non vengono applicati senza conferma quando la regola lo richiede;
- le capacità `not-automated` sono un riferimento descrittivo o un promemoria
  per la gestione al tavolo;
- gli slot incantesimo sono pool di risorse ricavati dalla build
  (`src/spellSlotCore.js`) e si spendono nel comando del lancio, delle
  punizioni e di Fonte di Magia (gli slot creati possono superare il massimo
  fino al riposo lungo); Recupero Arcano e Recupero Naturale restano manuali,
  dai pallini della scheda Incantesimi;
- il riposo breve ripristina i pool che tornano con un riposo breve al livello
  del personaggio (`classFeatureResourceRefreshEvents`), il riposo lungo tutti,
  compresi gli usi delle azioni rapide incantesimo con costo "Usi propri";
- la gestione delle capacità non sostituisce il registro delle decisioni del
  tavolo;
- le aure rispettano le categorie di bersaglio dichiarate dalla capacità e non
  diventano automaticamente un effetto su ogni token della scena.

## Persistenza tecnica

La configurazione vive nel profilo `initiativeCard` dentro il metadata canonico
del token. Lo stato runtime è annidato nello stesso metadata in:

```text
com.thebigpicture.initiative/meta.classFeatureState
```

Non è una nuova chiave metadata indipendente. Le condizioni figlie usano il
sistema condizioni esistente; gli item di aura usano:

```text
com.thebigpicture.initiative/classFeatureAura
```

Il profilo della card può essere condiviso tra scene tramite il registry delle
card nella room, mentre stato attivo, risorse correnti e condizioni restano
specifici del token nella scena.

## Verifica rapida

Per una prova manuale GM/player:

1. configura un token con una classe, sottoclasse e livello;
2. abilita una capacità `implemented` e verifica il pool associato;
3. attivala su sé stesso, su un bersaglio e, se disponibile, come aura;
4. controlla card, condizioni, durata e movimento dei bersagli;
5. consuma e recupera la risorsa;
6. termina l'istanza e verifica la rimozione per `instanceId`;
7. apri la room come player e verifica che i controlli GM non siano esposti.

Per rigenerare il catalogo o l'audit consulta [Sviluppo e release](SVILUPPO.md)
e [Workspace class features](class-features/README.md).

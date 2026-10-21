# Attacchi PG — fase 3: attivazioni al colpo (piano)

Stato: **tranche 3A implementata, non committata**. Decisioni 1–5 e perimetro allargato confermati.

## Note di implementazione (3A)

- **Tabella curata** in [pcAttackActivationCatalog.js](../src/pcAttackActivationCatalog.js): 35 attivazioni, verificate da `test/pcAttackActivationCatalog.test.js` contro gli id del catalogo. Potenza del Gigante e Sterminatore di Nemici sono rider nella tabella della fase 1.
- **Stesse regole dell'attivazione dalla card.** Le pill passano da `planClassFeatureActivation` e `classFeatureConditionInstancesForActivation`: stessa scadenza, tema, reminder e riconciliazione alla rimozione. Ne segue che una pill già presente sullo stesso bersaglio blocca la riga ("Già attiva su questo bersaglio."), come dalla card. Le capacità senza pill (o con il TS superato) spendono solo la risorsa con `planClassFeatureResourceAdjustment`.
- **Virtuosismi della Lama.** L'attivazione dalla card di Virtuosismo Difensivo non richiede Virtuosismo della Lama attiva: la console segue la card e non lo richiede neanche per Virtuosismo Mobile.
- **Pill su di sé** (Virtuosismo Difensivo): l'attaccante entra tra i `targetIds` del comando e dopo il commit si aggiornano le sue etichette sulla mappa.
- **Limiti per turno** nello stesso `pcAttackState.riderUses` dei rider, con chiave di gruppo per Tiro Arcano (`group:tiro-arcano`).
- **Verifica nel browser** (harness): Maestro di Battaglia 10° su un goblin, Attacco Minaccioso con TS fallito. PF 7 → 2, pill Spaventato, dadi 5/5 → 4/5 aggiornati nella console; un Annulla ripristina PF, pill e dado. Segue le fasi 0–2 ([FASE_0](PIANO_ATTACCHI_PG_FASE_0.md), [FASE_1](PIANO_ATTACCHI_PG_FASE_1.md), [FASE_2](PIANO_ATTACCHI_PG_FASE_2.md)) e i trucchetti C1–C4.

## Punto di partenza

Le capacità che si attivano **quando si colpisce** esistono già nel catalogo dei privilegi (`activation.primary: "innesco"`), ma vivono separate dall'attacco:

- le attivazioni **`condition`** (Attacco Minaccioso, Colpo Stordente, Runa del Fuoco…) spendono la risorsa e mettono la pill, con scadenza e tema;
- le attivazioni **`resource-only`** (Attacco Sbilanciante, Spinta, Colpo Psionico…) spendono soltanto la risorsa.

Oggi il GM registra l'attacco, poi attiva la capacità dalla card, e aggiunge il dado con "+ Componente". Il tiro salvezza resta implicito: la pill si mette solo se il TS fallisce, ma lo decide il GM attivando o no. Sono tre passaggi e tre Undo.

## Obiettivo

Nella console d'attacco, sotto "Extra al colpo", una sezione **"Attivazioni"** con le capacità al colpo **abilitate** sulla card dell'attore. Scegliendone una, in un **solo comando** (una voce di History, un Undo):

1. si **spende la risorsa** (dado di superiorità, Ki, uso di Tiro Arcano…) con la stessa pianificazione dell'attivazione dalla card (`planClassFeatureActivation`);
2. il **dado** della capacità diventa una **componente di danno** con il suo tipo (dell'arma per le manovre, tipo proprio per Tiro Arcano e Colpo Psionico). Il GM inserisce il totale, come sempre;
3. per le capacità con **tiro salvezza** il GM sceglie l'esito, **Fallito/Superato**, come per i trucchetti. La console mostra la CD calcolata dai modificatori della card;
4. con TS fallito, o senza TS, si applica l'**effetto**:
   - la **pill esistente** della capacità (stessa scadenza, tema e reminder dell'attivazione dalla card);
   - una **condizione standard** per le manovre che oggi non hanno pill (Sbilanciante → Prono);
   - una **nota** nel Combat Log per gli effetti sulla mappa (spinta di 4,5 m, arma lasciata cadere, alleato che si sposta).

Con TS superato la risorsa è spesa e il dado si aggiunge, ma senza effetto: è la regola, ed è già scritta nei dettagli delle pill.

L'attivazione dalla card resta com'è, per i casi fuori dall'attacco.

## Tranche 3A — capacità incluse

| Capacità | Risorsa | Dado / danno | TS e CD | Effetto |
| --- | --- | --- | --- | --- |
| **Maestro di Battaglia** (manovre) | dado di superiorità | d8, d10 dal 10°, d12 dal 18°; tipo dell'arma | CD 8 + comp. + FOR o DES (la più alta) | |
| · Attacco Minaccioso | | dado | SAG | Spaventato (pill esistente) |
| · Attacco Adescante | | dado | SAG | pill esistente |
| · Colpo Distraente | | dado | — | pill esistente |
| · Attacco Sbilanciante | | dado | FOR (Grande o inferiore) | **Prono** (condizione standard) |
| · Attacco con Spinta | | dado | FOR (Grande o inferiore) | nota: spinto di 4,5 m |
| · Attacco Disarmante | | dado | FOR | nota: lascia cadere un oggetto |
| · Attacco con Manovra | | dado | — | nota: un alleato si sposta |
| · Attacco con Affondo, Attacco con Finta | | dado | — | — |
| **Colpo Stordente** (monaco) | 1 Ki | — | COS, CD 8 + comp. + SAG | Stordito (pill esistente) |
| **Tiro Arcano** (Arciere Arcano), 1 per turno | uso di Tiro Arcano | 2d6, 4d6 dal 18° | CD 8 + comp. + INT | |
| · Freccia Afferrante | | veleno | — | Rovi Afferranti (pill esistente) |
| · Freccia Ammaliante | | psichico | SAG | Affascinato (pill esistente) |
| · Freccia d'Ombra | | psichico | SAG | vista entro 1,5 m (pill esistente) |
| · Freccia Indebolente | | necrotico | COS | danni dimezzati (pill esistente) |
| · Freccia Esiliante | | forza (dal 18°) | CAR | Esiliato (pill esistente) |
| **Runa del Fuoco** (Cavaliere Runico) | uso della runa | 2d6 fuoco | FOR, CD 8 + comp. + COS | Trattenuto (pill esistente) |
| **Colpo Psionico** (Guerriero Psionico), 1 per turno | dado psionico | dado psionico + INT, forza | — | — |
| **Marchio Incrollabile** (Cavaliere Errante) | — | — | — | pill esistente |
| **Lancia della Letargia** (warlock), 1 per turno | — | — | — | pill esistente |

**Aggiunte dopo la verifica della copertura** (stesso modello: risorsa, dado, TS facoltativo, effetto):

| Capacità | Risorsa | Dado / danno | TS | Effetto |
| --- | --- | --- | --- | --- |
| **Lame Psichiche** (Bardo, Collegio dei Sussurri), 1 per turno | Ispirazione Bardica | 2d6, 3d6 dal 5°, 5d6 dal 10°, 8d6 dal 15°; psichico | — | — |
| **Virtuosismo Difensivo e Mobile** (Bardo, Collegio delle Spade) | Ispirazione Bardica | dado di Ispirazione, tipo dell'arma | — | Difensivo: pill esistente (CA) · Mobile: nota spinta |
| **Mano del Dolore** (Monaco, Via della Misericordia), 1 per turno | 1 Ki | dado delle arti marziali + SAG, necrotico | — | — |
| **Colpo Abile** (Monaco, Via del Kensei), 1 per turno | 1 Ki | dado delle arti marziali, tipo dell'arma | — | — |
| **Zanne del Serpente di Fuoco** (Monaco, Quattro Elementi) | 1 Ki | 1d10 fuoco | — | — (richiede la pill attiva) |
| **Protettori Ancestrali** (Barbaro, Guardiano Ancestrale), prima creatura colpita nel turno | — | — | — | pill esistente (richiede Ira) |
| **Sintonia Totemica: Lupo** (Barbaro, Combattente Totemico) | — | — | — | Prono, Grande o inferiore (richiede Ira) |
| **Ira dell'Ordine** (Chierico, Dominio dell'Ordine), 1 per turno | — | — | — | pill esistente (con Colpo Divino) |
| **Maestro di Imboscate** (Ladro, Esploratore) | — | — | — | pill esistente (primo round) |
| **Scagliare all'Inferno** (Warlock, l'Immondo) | 1 per riposo lungo | — | — | pill esistente |
| **Colpo Mistico** (Guerriero, Cavaliere Mistico) | — | — | — | nota: svantaggio al prossimo TS contro i suoi incantesimi |
| **Mantenere la Posizione** (Guerriero, Cavaliere Errante) | — | — | — | nota: velocità 0 (attacco di opportunità) |
| **Deflagrazione Respingente, Stretta di Hadar** (suppliche) | — | — | — | nota: spinto / tirato di 3 m (raggi di Deflagrazione Occulta) |
| **Colpo del Tuono e del Fulmine** (Chierico, Dominio della Tempesta) | — | — | — | nota: spinto di 3 m (danni da fulmine) |

Due capacità sono **danno puro** e vanno nella tabella dei rider della fase 1, non tra le attivazioni:

- **Potenza del Gigante** (Cavaliere Runico): +1d6, d8 dal 10°, d10 dal 18°; una volta per turno, con la capacità attiva;
- **Sterminatore di Nemici** (Ranger rivisto, 20°): + mod. SAG ai danni, una volta per turno.

Le attivazioni di queste tabelle sono dati verificati sul catalogo. I dati mancanti (dimensione dei dadi, abilità della CD, tipo di danno) vanno in una **tabella curata**, chiusa e versionata come quella dei rider.

## Tranche 3B-1 — implementata, non committata

- **Seconda creatura** (Attacco con Spazzata, Virtuosismo Tagliente, Lamenti dalla Tomba). Il dado si tira una volta: va solo alla seconda creatura (Spazzata, Lamenti) o anche al bersaglio (Tagliente). Usa lo stesso percorso della seconda creatura di Lama Verdefiamma: difese e PF propri, stesso comando, stesso Undo. Una sola seconda creatura per attacco. Lamenti dalla Tomba tira metà dei dadi dell'Attacco Furtivo (per eccesso), solo insieme all'Attacco Furtivo e nel proprio turno.
- **Prima del tiro** (Attacco Preciso, Colpo Guidato del Paladino di Conquista e del Chierico della Guerra). Sono disponibili anche con l'attacco mancato: spendono la risorsa e registrano il bonus al tiro, senza danno. Su un mancato la console mostra solo queste righe, sotto "Prima del tiro". Attacco Preciso resta una manovra (una per attacco).
- **Rider:** Imboscata Terrificante (+1d8 una volta nel proprio turno, con la pill attiva sul ranger) e Chiamata alla Caccia (+1d6 una volta per turno a chiunque abbia la pill del barbaro, anche senza la capacità sulla propria card).
- **Verifica nel browser** (harness): Attacco con Spazzata su Auril con il goblin come seconda creatura. Auril 580 → 571, goblin 7 → 0, dado speso. Poi un mancato con Attacco Preciso.

## Tranche 3B-2 — implementata, non committata

Decisioni confermate: Palmo Tremante si termina nella console d'attacco; Punizione Ispiratrice completamente automatizzata; Parata rinviata alla console degli attacchi dei boss.

- **Replica**: manovra col dado di superiorità, solo in mischia e solo come reazione (fuori dal proprio turno).
- **Tecnica della Mano Aperta**: un'attivazione a tre scelte, ognuna con TS ed effetto propri.
  - TS Destrezza: Prono.
  - TS Forza: nota della spinta di 4,5 m.
  - Senza TS: pill "Niente reazioni", che scade da sola alla fine del prossimo turno del monaco.
  - La Raffica di Colpi resta una valutazione del GM (promemoria nella riga).
- **Palmo Tremante**, prima fase: attivazione con 3 Ki e la pill della capacità sul bersaglio.
- **Palmo Tremante**, seconda fase: un comando a sé, nel riquadro "Palmo Tremante" della sezione Bersaglio, visibile quando il bersaglio ha le vibrazioni di quel monaco. Con TS fallito il bersaglio va a 0 PF (anche i temporanei); con TS superato subisce 10d10 necrotici, con le sue difese; si può anche terminare senza effetto. In ogni caso la pill viene rimossa e l'istanza attiva della capacità si chiude. L'Undo ripristina PF, pill e capacità. Combat Log: "Palmo Tremante: TS Costituzione CD 17 fallito → 0 PF".
- **Punizione Ispiratrice**: disponibile con la Punizione Divina nello stesso attacco. Spende Incanalare Divinità; il totale (2d8 + livello) si distribuisce fra le creature scelte, il paladino compreso, mai quelle danneggiate dall'attacco; la somma non può superare il totale. I PF temporanei usano la regola della Console HP (`QUICK_HP_MODES.TEMP`) nello stesso `hp:set` del danno. Hanno proiezioni proprie (barra PF, testo, memoria PF, etichette), senza gli avvisi di concentrazione del danno. Le righe della distribuzione stanno sulla griglia del danno: importi sotto il totale.
- **Prestazioni**: nel test d'integrazione il comando con danno e due destinatari dura circa 13 ms. Nell'harness del browser, con il pannello nascosto, la pagina in background può superare il timeout di 8 s del trasporto: il commit avviene comunque, ed è un effetto del rallentamento della pagina, non del comando.

## Dopo la 3B-2

- **Parata** (Maestro di Battaglia): nella console degli attacchi dei boss, come reazione del bersaglio. Riduce il danno di dado + Destrezza e spende il dado di superiorità.

## Tranche 3C — rinviata

- **Attacco con Spazzata**: il danno va a una seconda creatura; si può riusare il modello della seconda creatura di Lama Verdefiamma.
- **Freccia Esplosiva, Perforante, Cercatrice**: area o nessun tiro per colpire. Servono il disegno dell'area o un attacco a sé.
- **Palmo Tremante**: in due fasi, il colpo e poi l'azione che fa vibrare il bersaglio, con TS o 10d10 necrotici.
- **Tecnica della Mano Aperta**: dipende dalla Raffica di Colpi.
- **Replica e Parata**: reazioni. Replica è un attacco a sé con il dado.
- **Attacco Preciso e Colpo Guidato** (Paladino di Conquista e Chierico della Guerra): si applicano **prima** del tiro per colpire, che il motore non conosce. Restano una nota.
- **Lamenti dalla Tomba** (Ladro, Fantasma) e **Virtuosismo Tagliente** (Bardo delle Spade): il danno va a una seconda creatura, come Attacco con Spazzata.
- **Imboscata Terrificante** (Ranger, Cacciatore delle Tenebre): l'attacco in più del primo turno, con +1d8.
- **Punizione Ispiratrice** (Paladino, Giuramento di Gloria): PF temporanei agli alleati dopo una Punizione Divina.
- **Chiamata alla Caccia** (Barbaro, Cammino della Bestia): +1d6 ai danni degli alleati coinvolti, una volta per turno. È un rider sugli attacchi degli altri.

## Fuori perimetro (verificato)

La verifica ha riguardato tutte le 860 capacità del catalogo: 13 classi, compreso il Ranger rivisto, e 100 sottoclassi. Ha preso le attivazioni "innesco" e ogni descrizione che parla di colpire. Restano fuori, con il motivo:

- **Scattano quando il PG viene colpito**, non quando colpisce: Difesa dal Multiattacco, Intimorire Sprezzante, Impeto Selvaggio, Antenati Vendicativi, Vendicatore Implacabile, Opportunista.
- **Sono armi**, da configurare come attacchi nella scheda "Attacchi": Forma della Bestia (Morso, Artigli, Coda), Lame Psichiche del Lama Spirituale, Forma Siderale Arciere. La cura del Morso resta una nota.
- **Stili di combattimento**: Duellare (+2) entra nella formula dell'arma; i ritiri di Combattere con Armi Possenti restano al tavolo.
- **Modificano tiri, non colpi**: Colpo Mortale, Maestro Duellante, Colpi Guidati del Lama Spirituale, Onde del Caos, Prescelto dagli Dei, Colpo Rapido.

## Contratto tecnico

- **`src/pcAttackActivationCatalog.js`** (nuovo, solo dati e funzioni pure): `featureId`, dado (`superiority` / `psionic` / fisso per livello), tipo (`weapon` o un tipo), TS (`ability`, `dcAbility`), effetto (`pill` / `condition: "Prono"` / `note`), limite (`perAttack` / `perTurn`).
- **`pcAttackCore.js`**:
  - `pcAttackActivationOptions(action, card, state, turn)`: le attivazioni disponibili, con il motivo se sono bloccate (capacità non abilitata, risorsa esaurita, già usata nel turno, attacco a distanza per una capacità solo in mischia);
  - `buildPcAttackMutation` aggiunge la componente del dado, il patch di `classFeatureState` sulla sorgente con `expected`, accanto a `pcAttackState`, e `condition:add-instances` sul bersaglio con le istanze di `classFeatureConditionInstancesForActivation`. Sono le stesse istanze dell'attivazione dalla card, quindi la riconciliazione alla rimozione della pill continua a funzionare.
- **Console**: righe allineate alla griglia degli extra (spunta, nome, dado, importo); sotto, se c'è un TS, i pulsanti Fallito/Superato e la CD.
- **Combat Log**: riga "Manovra: Attacco Minaccioso (d8 · TS Sag CD 15 fallito → Spaventato)", più la nota per gli effetti sulla mappa.

## Rischi

- **Stato dei privilegi.** Si scrive lo stesso campo dell'attivazione dalla card. Il patch usa `expected`: se nel frattempo la card ha speso una risorsa, il comando viene rifiutato e la console lo segnala, come già succede per i PF.
- **Nessun cambio alle chiavi dei metadati** né al flusso del turno attivo. I limiti "1 per turno" usano la chiave di turno delle fasi 1–2.

## Decisioni da confermare

1. **Esito del TS** scelto dal GM nella console (Fallito/Superato), con la CD mostrata solo come riferimento. *Proposta: sì.*
2. **Risorsa spesa nello stesso comando** dell'attacco; senza risorse la riga è bloccata con il motivo. *Proposta: sì.*
3. **Limiti**: una manovra per attacco, Tiro Arcano e Colpo Psionico una volta per turno, Colpo Stordente su ogni colpo finché c'è Ki. *Proposta: sì.*
4. **Effetti senza pill**: Sbilanciante applica la condizione standard Prono; spinta, disarmo e spostamento dell'alleato sono note nel Combat Log. *Proposta: sì.*
5. **Perimetro**: tranche 3A ora, 3B dopo. *Proposta: sì.*

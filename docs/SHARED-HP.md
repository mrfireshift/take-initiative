# HP condivisi: MVP

## Collegare Auril e la forma titanica

1. In Owlbear Rodeo, come GM, seleziona i tre token secondari sulla mappa.
2. Apri il menu contestuale **HP condivisi**.
3. Scegli **Auril** come token principale. Deve avere HP e massimo validi.
4. Verifica l'anteprima e premi **Conferma collegamento**.

Gli HP dei secondari vengono sostituiti da quelli del principale. I secondari
restano sulla mappa e fuori dall'iniziativa, anche usando Aggiungi tutti.
Auril mantiene la sua normale presenza nel tracker.
I secondari ereditano la fazione del principale, anche quando
viene cambiata successivamente. Il collegamento non aggiunge automaticamente il principale
all'iniziativa se non ne faceva già parte.

Le modifiche HP e massimo effettuate nel plugin da qualunque membro si
applicano all'intera riserva. Tracker e barre leggono ancora `hp` e `hpMax`.
Condizioni, schede, concentrazione e risorse rimangono individuali.
Le barre e i testi sulla mappa si aggiornano anche con il tracker chiuso,
rispettando le opzioni di attivazione e visibilità del plugin.

## Modificare gli HP dai secondari

I secondari compaiono sotto al principale nel tracker, nello stesso formato
delle pedine evocate. Il gruppo chiuso mostra **Token collegati · N**;
per le evocazioni la dicitura è **Evocazioni · N**.
Il GM può espandere il gruppo e modificare la pill HP
del secondario colpito con l'editor standard, anche usando un delta come `-25`.
La riserva si aggiorna per tutti e il log indica il bersaglio effettivo, per
esempio **Mano del Titano**, insieme alla variazione della riserva di Auril.
I secondari non ricevono un turno proprio.

Nella Console **HP condivisi**, **Righe dei secondari nel tracker** permette
di scegliere **Solo GM** (default) oppure **Tutto il tavolo**. La seconda
opzione mostra le righe ai giocatori rispettando le policy HP già configurate
nel plugin. L'editing rimane riservato al GM.

## Danni a più membri

Effetti rapidi e risoluzioni delle magie/azioni boss mostrano la policy HP
condivisi quando sono coinvolti più membri della stessa riserva:

- **Una volta per gruppo** è il default per una singola applicazione.
- **Per ogni token colpito** somma i contributi sulla riserva.
- Se gli importi differiscono con la prima policy, scegli esplicitamente il
  bersaglio dal quale prendere l'importo. Anche zero è una scelta valida.

La scelta vale per quell'applicazione. Una nuova applicazione usa di nuovo
il default. Attacchi distinti, compresi i singoli raggi di un multiattacco,
restano eventi distinti e sottraggono ciascuno i propri danni.
Anche il danno primario di Freccia Folgorante resta distinto dall'esplosione:
la policy del gruppo si applica ai contributi dell'area.

Undo usa la Cronologia del plugin e ripristina i membri modificati al momento
dell'evento. Aggiungere o scollegare token successivamente non cambia lo
scope dell'evento precedente.

## Scollegare e correggere un collegamento

Il pannello permette di scollegare un token, i selezionati oppure tutti i
secondari del principale scelto. Gli ultimi HP rimangono sul token e il token
non viene reinserito automaticamente nell'iniziativa.

Se il principale è stato eliminato, il pannello mostra il collegamento
interrotto e permette di scollegarlo. Le modifiche HP del secondario sono
bloccate fino alla correzione, senza azzerare i valori conservati.

## Limiti

- Il collegamento usa gli ID della scena. Dopo copie o trasferimenti tra
  scene verifica e, se necessario, ricrea i collegamenti.
- Le scritture effettuate da altre estensioni non sono sincronizzate
  universalmente da questo MVP.
- Trasformazioni del boss, condivisione delle condizioni e turni separati
  dei secondari non sono automatizzati.
- La verifica automatica usa il coordinatore produttivo con SDK simulato.
  La sessione live di Owlbear Rodeo deve ancora essere collaudata con i token
  e la scena effettivi del combattimento.

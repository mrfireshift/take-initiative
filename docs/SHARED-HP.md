# HP condivisi: MVP

## Collegare Auril e la forma titanica

1. In Owlbear Rodeo, come GM, seleziona i tre token secondari sulla mappa.
2. Apri il menu contestuale **HP condivisi**.
3. Scegli **Auril** come token principale. Deve avere HP e massimo validi.
4. Verifica l'anteprima e premi **Conferma collegamento**.

Gli HP dei secondari vengono sostituiti da quelli del principale. I secondari
restano sulla mappa e fuori dall'iniziativa, anche usando Aggiungi tutti.
Auril mantiene la sua normale presenza nel tracker e mostra il numero di
token collegati. Il collegamento non aggiunge automaticamente il principale
all'iniziativa se non ne faceva già parte.

Le modifiche HP e massimo effettuate nel plugin da qualunque membro si
applicano all'intera riserva. Tracker e barre leggono ancora `hp` e `hpMax`.
Condizioni, schede, concentrazione e risorse rimangono individuali.
Le barre e i testi sulla mappa si aggiornano anche con il tracker chiuso,
rispettando le opzioni di attivazione e visibilità del plugin.

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

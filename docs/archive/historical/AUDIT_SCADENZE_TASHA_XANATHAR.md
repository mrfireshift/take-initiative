# Audit delle scadenze — Tasha e Xanathar

> **Documento storico.** Questo audit fotografa la fase di importazione dei
> supplementi e non descrive il motore corrente di zone e reminder. Per il
> comportamento operativo consulta
> [Incantesimi, zone e reminder](../../INCANTESIMI_E_ZONE.md).

## Copertura

- 116 incantesimi importati dai due JSON.
- 115 definizioni supplementari distinte nel catalogo generale.
- `Scudiscio Mentale di Tasha` è unificato con la voce legacy già presente.
- 88 definizioni supplementari sono selezionabili nel tracker; gli istantanei di solo danno o spostamento restano nel riferimento, ma non generano una spell attiva.
- Gli istantanei con un effetto persistente revisionato sono tracciabili separatamente.

## Condizioni applicabili al lancio

| Incantesimo | Condizione | Scadenza massima | Uscita anticipata |
| --- | --- | --- | --- |
| Charme sui Mostri | Affascinato | 1 ora | Danno inflitto dal caster o dai suoi compagni |
| Drago Illusorio | Spaventato | 1 minuto, indipendente dalla concentrazione | TS Sag a fine turno, soltanto senza linea di vista verso l’illusione |
| Incuti Paura | Spaventato | Concentrazione, fino a 1 minuto | TS Sag alla fine di ogni turno |
| Muro di Luce | Accecato | 1 minuto, indipendente dalla durata del muro | TS Cos alla fine di ogni turno |
| Prigione Mentale | Trattenuto | Concentrazione, fino a 1 minuto | Movimento forzato fuori dall’illusione, attacco attraverso il limite o attraversamento del limite |
| Sfera Acquea | Trattenuto | Concentrazione, fino a 1 minuto | TS For alla fine di ogni turno, espulsione dalla sfera o superamento della capacità |
| Sonnellino | Privo di sensi | 10 minuti | Danno o azione di un’altra creatura per svegliare il bersaglio |
| Stretta della Terra di Maximilian | Trattenuto | Concentrazione, fino a 1 minuto | Prova di Forza con un’azione, cambio bersaglio o spostamento della mano |
| Urlo Psichico | Stordito | Senza durata numerica | TS Int alla fine di ogni turno |
| Sogno del Velo Celeste | Privo di sensi | 6 ore | Danno al singolo bersaglio; se subisce danni il caster, termina per tutti |

`Drago Illusorio` e `Muro di Luce` conservano una durata propria per la condizione: interrompere la concentrazione rimuove l’illusione o il muro, ma non cancella immediatamente paura o cecità.

## Pill persistenti con scadenza speciale

| Incantesimo | Dinamica |
| --- | --- |
| Morsa del Gelo | Si consuma al prossimo attacco con arma o alla fine del turno successivo del bersaglio |
| Pirotecnica — Fuochi d’Artificio | Accecato fino alla fine del turno successivo del caster |
| Pirotecnica — Fumo | 10 round oppure rimozione manuale quando un vento forte disperde il fumo |
| Parola del Potere Dolore | Durata manuale; TS Cos alla fine di ogni turno |
| Scossa Sinaptica | 10 round; TS Int alla fine di ogni turno |
| Cerimonia — Dedizione/Età Adulta | 24 ore |
| Cerimonia — Matrimonio/Rito Funebre | 7 giorni |
| Assorbire Elementi | Resistenza fino all’inizio del turno successivo del caster; danno caricato fino alla fine dello stesso turno |
| Scheggia della Mente | Prossimo TS o fine del turno successivo del caster |
| Scudiscio Mentale di Tasha | Fine del turno successivo del bersaglio |
| Lama Roboante | Movimento del bersaglio o inizio del turno successivo del caster |

## Effetti secondari da applicare manualmente

Questi effetti non nascono automaticamente al lancio della spell. Dipendono da un’azione successiva, da una creatura evocata, dall’ingresso in un’area o da un altro trigger; generarli subito sarebbe scorretto.

| Origine | Effetto secondario |
| --- | --- |
| Collera della Natura | Trattenuto fino alla fine della concentrazione o prova di Atletica con un’azione; Prono istantaneo dalle rocce |
| Arma Sacra, quando viene congedata | Accecato per 1 minuto, con TS Cos a fine turno |
| Ossa della Terra | Trattenuto finché il bersaglio usa un’azione e supera la prova |
| Trabocchetto | Trattenuto fino a 8 ore, TS Des a fine turno o prova di Arcano con un’azione |
| Trasmutare Roccia | Trattenuto con uscita tramite azione; la variante fango-in-roccia può richiedere la distruzione della roccia |
| Turbine | Trattenuto fino alla fine della concentrazione o prova For/Des con un’azione |
| Interdizione Primordiale | Dopo la reazione, immunità al tipo scelto fino alla fine del turno successivo del caster |
| Investitura del Ghiaccio | Velocità dimezzata fino all’inizio del turno successivo del caster |
| Investitura della Pietra | Se il caster termina nella roccia: Stordito fino alla fine del suo turno successivo |
| Sudario Spirituale | Blocco delle cure e riduzione di velocità fino all’inizio del turno successivo del caster |
| Evoca Aberrazione — Artigli | Blocco delle cure fino all’inizio del turno successivo dell’aberrazione |
| Evoca Bestia d’Ombra | Riduzione velocità fino all’inizio del turno successivo del bersaglio; Spaventato per 1 minuto con TS a fine turno |
| Evoca Costrutto — Pietra | Niente reazioni e velocità dimezzata fino all’inizio del turno successivo del bersaglio |
| Evoca Folletto | Affascinato per 1 minuto o fino ai danni; oscurità fino alla fine del turno successivo del folletto |
| Evoca Non Morto | Avvelenato fino all’inizio del turno successivo; Spaventato o Paralizzato fino alla fine del turno successivo del bersaglio |

Per gli effetti delle creature evocate la fonte temporale deve essere il token evocato, non il caster della spell.

## Dinamiche da collaudare

1. **Fine del turno corrente contro turno successivo.** Lanciare Morsa del Gelo o Pirotecnica durante il turno dell’attore che governa la scadenza e verificare che la prima fine turno venga ignorata.
2. **Inizio e fine dello stesso turno successivo.** Assorbire Elementi deve perdere la resistenza all’inizio del turno del caster e conservare il danno fino alla sua fine.
3. **Condizione indipendente dal parent.** Interrompere Drago Illusorio e Muro di Luce: Spaventato e Accecato devono restare fino al proprio limite o alla rimozione manuale.
4. **Concentrazione collegata.** Interrompere Incuti Paura, Prigione Mentale, Sfera Acquea e Stretta della Terra: le condizioni collegate devono sparire.
5. **TS ripetuto.** Rimuovere manualmente una condizione dopo il TS riuscito senza alterare gli altri bersagli della stessa concentrazione.
6. **Danno o azione come uscita.** Provare Charme sui Mostri, Sonnellino e Sogno del Velo Celeste, inclusa la differenza tra danno al bersaglio e danno al caster.
7. **Durate numeriche.** Verificare 10 round di Pirotecnica/Fumo e Scossa Sinaptica, poi una durata lunga di Cerimonia tramite decremento simulato.
8. **Durata manuale.** Parola del Potere Dolore e Urlo Psichico non devono essere consumati dal cambio round.
9. **Multi-bersaglio.** Una rimozione anticipata su un bersaglio non deve terminare le altre copie della spell.
10. **Fonte evocata.** Per gli effetti secondari delle evocazioni, controllare inizio/fine turno usando il token evocato come fonte.

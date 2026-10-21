# Attacchi PG — trucchetti come attacco (piano futuro)

Stato: **solo pianificazione**, nessun codice. Obiettivo: i trucchetti sono per gli incantatori l'equivalente degli attacchi base dei marziali, quindi devono passare dalla stessa console d'attacco, con gli stessi extra, contatori, History e Combat Log.

## Punto di partenza

- **Catalogo**: 44 trucchetti, circa 25 con danno. Hanno `damageType` (solo quelli SRD) ma **nessun dado né progressione strutturati**; i trucchetti di Xanathar e Tasha non hanno neanche il tipo, solo il testo italiano.
- **Il sistema incantesimi risolve già alcuni trucchetti**: Tocco Gelido e Raggio di Gelo hanno una tabella in [spellAttackResolutionCore.js](../src/spellAttackResolutionCore.js) e i loro effetti (niente guarigione, −3 m di velocità) passano dal pannello incantesimi. **Non vanno duplicati**: la console d'attacco deve riusare quegli effetti, non reimplementarli.
- **La console d'attacco** gestisce già componenti tipizzate, extra, limiti per turno, condizioni al colpo e precondizione di turno.

## Modello proposto

La quick action "Attacco" acquista una **fonte**:

```js
{ kind: "attack", label, range, source: { kind: "weapon" } }                    // oggi (default)
{ kind: "attack", label, range, source: { kind: "cantrip", spellId } }          // trucchetto
```

Per un trucchetto le componenti non si scrivono a mano: vengono da una **tabella curata** (come i rider) con dadi, tipo, modalità (tiro per colpire o tiro salvezza) e progressione per **livello del personaggio** (1/5/11/17, `totalCharacterLevel`, non il livello di classe).

Tre modalità di consegna:

| Modalità | Esempi | Esiti nella console |
| --- | --- | --- |
| tiro per colpire | Dardo di Fuoco, Deflagrazione Occulta, Stretta Folgorante, Produrre Fiamma, Frusta di Spine | Colpito / Critico / Mancato (come oggi) |
| tiro salvezza | Fiamma Sacra, Rintocco dei Morti, Spruzzo Velenoso, Scheggia della Mente, Beffa Crudele | TS fallito / TS superato (niente danno al successo, salvo Trucchetto Potenziato) |
| attacco con arma + effetto | Lama Roboante, Lama Verdefiamma | come un attacco con arma, più la componente del trucchetto |

## Punti che richiedono progettazione

1. **Requisito "attacco con arma" sui rider.** Oggi tutti gli attacchi sono con arma. Con i trucchetti, Attacco Furtivo, Punizioni, Colpo Divino, Ira, Furia Divina, Sterminatore di Colossi e Succhiavita devono escludere gli attacchi con incantesimo. Va aggiunto `requires.attack: "weapon"` alla tabella dei rider. Lama Roboante e Lama Verdefiamma restano attacchi con arma, quindi compatibili con Furtivo e Punizioni.
2. **Rider per incantesimi**: Deflagrazione Agonizzante (+CAR alla Deflagrazione Occulta, per raggio), Incantesimi Potenziati del chierico (+SAG ai trucchetti), Colpi Benedetti (Tasha), Evocazione Potenziata (+INT), Affinità Elementale, Trucchetto Potenziato (metà danno su TS superato). Il Marchio della Lama del Sortilegio vale per qualsiasi tiro di danno contro il bersaglio.
3. **Deflagrazione Occulta a più raggi** (1/2/3/4 ai livelli 1/5/11/17): ogni raggio è un tiro per colpire, anche su bersagli diversi. Proposta: un comando per raggio, con "Raggio 2/3" nella console (stesso schema dell'Attacco Extra), Deflagrazione Agonizzante applicata a ogni raggio.
4. **Effetti al colpo**: Tocco Gelido, Raggio di Gelo, Stretta Folgorante, Scheggia della Mente, Morsa del Gelo. Vanno presi dagli `effects` del catalogo incantesimi e applicati con le stesse operazioni del pannello incantesimi, nello stesso comando del danno. È il punto di maggior rischio: va verificato se il piano di applicazione degli incantesimi (`spellApplicationPlanCore`) si può comporre con il comando d'attacco senza toccarlo.
5. **Lama Roboante**: il danno da tuono ritardato se il bersaglio si muove volontariamente richiede una pill sul bersaglio con promemoria; esiste già l'automazione di zone e movimento degli incantesimi, da valutare.
6. **Lama Verdefiamma**: danno da fuoco a una seconda creatura entro 1,5 m; serve un secondo bersaglio nella console (utile anche per Attacco con Spazzata).
7. **Provenienza**: `cause.kind: "pc-attack"` con `spellId` e nome dell'incantesimo, così il Combat Log mostra l'incantesimo senza cambiare categoria.
8. **Bonus d'attacco e CD**: solo informativi (esiste `abilitySaveDC`); l'esito resta una scelta del GM.

## Tranche proposte

1. **C1 — trucchetti con tiro per colpire, bersaglio singolo**: tabella curata, progressione per livello del personaggio, `requires.attack` sui rider, provenienza dell'incantesimo.
2. **C2 — trucchetti con tiro salvezza**: esiti TS fallito/superato nella console.
3. **C3 — Deflagrazione Occulta a raggi e rider da incantatore** (Deflagrazione Agonizzante, Incantesimi Potenziati, Colpi Benedetti, Trucchetto Potenziato).
4. **C4 — trucchetti con arma** (Lama Roboante, Lama Verdefiamma) e secondo bersaglio.
5. **C5 — effetti al colpo** tramite la pipeline degli incantesimi.

## Decisioni da prendere più avanti

- Raggi della Deflagrazione Occulta: un comando per raggio (proposta) oppure uno per lancio con più bersagli.
- Trucchetti già gestiti dal pannello incantesimi (Tocco Gelido, Raggio di Gelo): restano anche lì, oppure la quick action "Attacco" diventa la strada preferita?
- Trucchetto Potenziato e "metà su TS superato": regola del rider oppure modalità del trucchetto?

# Attacchi PG — C3: extra degli incantatori e raggi della Deflagrazione

Stato: **implementata, non committata**. Terza tranche di [PIANO_ATTACCHI_PG_TRUCCHETTI.md](PIANO_ATTACCHI_PG_TRUCCHETTI.md).

## Extra degli incantatori (rider `spellOnly`)

Compaiono in "Extra al colpo" / "Extra al danno" come gli altri privilegi, ma **solo sui trucchetti**: su un'arma restano disattivati con "Solo per i trucchetti". Simmetricamente, i privilegi dei marziali restano "Solo per gli attacchi con arma".

| Privilegio | id catalogo | Bonus | Ambito |
| --- | --- | --- | --- |
| Deflagrazione Agonizzante | `warlock-suppliche-occulte-deflagrazione-agonizzante` | + mod. Carisma | solo Deflagrazione occulta, ogni raggio |
| Incantesimi Potenti (Conoscenza, Luce, Tomba, Pace) | `chierico-dominio-della-*-incantesimi-potenti` | + mod. Saggezza | trucchetti da chierico |
| Invocazione Potente | `mago-scuola-di-invocazione-invocazione-potente` | + mod. Intelligenza | incantesimi di invocazione da mago |
| Affinità Elementale | `stregone-discendenza-draconica-affinita-elementale` | + mod. Carisma | tipo di danno della discendenza |

Il catalogo non riporta le liste di classe degli incantesimi, né la scuola dei trucchetti dei supplementi. Per questo solo la Deflagrazione Agonizzante è limitata al suo incantesimo; per gli altri l'etichetta dice l'ambito e decide il GM. Senza il modificatore nel profilo il rider resta disponibile, ma senza dadi suggeriti ("—").

## Trucchetto Potente

`mago-scuola-di-invocazione-trucchetto-potente` non è un rider: cambia l'esito. Con un TS superato contro un trucchetto con TS, il bersaglio subisce **metà danni** invece di nessuno (`pcAttackDamageFactor` → `"half"`):

- il campo del danno resta attivo sul "TS superato";
- la console lo segnala nella nota del trucchetto;
- la causalità registra `save.potentCantrip: true`.

Sul TS superato non si applicano extra né l'effetto del trucchetto ("non subisce ulteriori effetti").

## Raggi della Deflagrazione occulta

Ogni raggio resta una registrazione a sé (un tiro per colpire, eventualmente un bersaglio diverso). La console conta i raggi registrati dalla sua apertura per il trucchetto in uso: "Raggi: 2 al livello del personaggio · registrati 1", poi "registrati tutti e 2". Il conteggio si azzera cambiando trucchetto o riaprendo la console: è un promemoria, non un limite.

## Non incluso

- **Colpi Benedetti** (Tasha): non è nel catalogo dei privilegi; resta disponibile "+ Componente".
- **Saturazione Magica**: danni massimi agli incantesimi di 1°–5° livello, non ai trucchetti.

## Verifica

Test su tabella, core e console. Nell'harness browser: warlock di 5° livello con CAR +4 e Deflagrazione Agonizzante, due raggi su Sera (7+4 e 3+4) → PF 38 → 27 → 20, nota dei raggi aggiornata.

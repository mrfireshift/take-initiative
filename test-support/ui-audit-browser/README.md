# UI audit preview

Same fake SDK as the tracker polishing preview, with four extra rows (low HP
and many conditions, a downed PC, a dead enemy, an ally) and a `layout`
parameter, so the compact and the classic tracker can be compared:

```powershell
node node_modules/vite/bin/vite.js --config test-support/boss-actions-browser/vite.config.mjs --host 127.0.0.1 --port 5199
```

Open `http://127.0.0.1:5199/test-support/ui-audit-browser/frame.html?layout=compact`
(or `layout=classic`, plus `role=PLAYER` for the players' window).

Add `&scale=1.5` (0.5–2) to preview the tracker size option: it sets the GM's
size on this browser and the players' size for the table screen. The "Seleziona
token" menu selects a creature, so the contextual panels (Condizioni,
Incantesimi, character sheet) open on it. Popovers are kept inside the viewport
as OBR does.

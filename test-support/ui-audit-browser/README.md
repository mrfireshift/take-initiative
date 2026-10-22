# UI audit preview

Same fake SDK as the tracker polishing preview, with four extra rows (low HP
and many conditions, a downed PC, a dead enemy, an ally) and a `layout`
parameter, so the compact and the classic tracker can be compared:

```powershell
node node_modules/vite/bin/vite.js --config test-support/boss-actions-browser/vite.config.mjs --host 127.0.0.1 --port 5199
```

Open `http://127.0.0.1:5199/test-support/ui-audit-browser/frame.html?layout=compact`
(or `layout=classic`, plus `role=PLAYER` for the players' window).

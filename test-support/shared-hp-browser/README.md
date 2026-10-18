# Shared HP browser fixture

Run from the repository root:

```powershell
node node_modules/vite/bin/vite.js --config test-support/boss-actions-browser/vite.config.mjs --host 127.0.0.1 --port 5199
```

Open `http://127.0.0.1:5199/test-support/shared-hp-browser/frame.html`.
The fixture uses the existing fake SDK and the production tracker, shared HP
panel, mutation coordinator, history owner, and combat log presentation.
Scene data is simulated; it does not connect to Owlbear Rodeo.

- Close the shared HP panel and choose **Apri tracker**.
- Expand **Token collegati · 3**, edit the hand's HP with `-25`, and commit.
- All four map values and tracker rows must become 275/400.
- **Aggiorna log** must name the hand and Auril's shared pool, with a single
  25 HP decrease. **Undo** must restore all four values to 300/400.
- Check classic and compact layouts, collapsed labels, and expanded rows.
- In the shared HP panel, change row visibility between **Solo GM** and
  **Tutto il tavolo**. Player disclosure is covered by the projection tests.

Use `?linked=0` for an initially unlinked scene and test linking separately.
The ongoing background faction reconciliation is covered by the controller
and mutation integration tests, rather than mounted by this fixture.

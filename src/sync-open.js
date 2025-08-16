// sync-open.js
import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./contextMenu";

const UI_KEY = `${ID}/ui`;        // dove memorizziamo lo stato "aperto/chiuso"

// evita doppie registrazioni in dev/HMR
if (!window.__TBP_SYNC_OPEN_MOUNTED) {
  window.__TBP_SYNC_OPEN_MOUNTED = true;

  OBR.onReady(async () => {
    // 1) Se il GM apre/chiude il pannello, aggiorniamo il metadata della room
    OBR.action.onOpenChange(async (isOpen) => {           // ascolta apertura/chiusura del tuo Action
      const role = await OBR.player.getRole();
      if (role === "GM") {
        await OBR.room.setMetadata({ [UI_KEY]: { open: isOpen, at: Date.now() } }); // persiste per nuovi join
      }
    });

    // 2) Tutti ascoltano i cambi dello stato e si adeguano (solo i PLAYER eseguono)
    OBR.room.onMetadataChange(async (meta) => {
      const flag = meta[UI_KEY];
      if (!flag) return;

      const role = await OBR.player.getRole();
      if (role === "GM") return;                          // il GM non viene forzato

      const isCurrentlyOpen = await OBR.action.isOpen();
      if (flag.open && !isCurrentlyOpen) {
        await OBR.action.open();                          // apri per i giocatori
      } else if (!flag.open && isCurrentlyOpen) {
        await OBR.action.close();                         // chiudi per i giocatori
      }
    });

    // 3) All’ingresso di un nuovo giocatore, apri se il GM l’ha già aperto
    const role = await OBR.player.getRole();
    if (role !== "GM") {
      const meta = await OBR.room.getMetadata();
      if (meta?.[UI_KEY]?.open && !(await OBR.action.isOpen())) {
        await OBR.action.open();
      }
    }
  });
}

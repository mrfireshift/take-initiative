// Archivio degli attori (docs/PIANO_ARCHIVIO_ATTORI.md), lotto A2: tries a real archive server.
//   PowerShell:  $env:TI_ARCHIVE_KEY = "<la chiave>"; node scripts/check-archive-server.mjs https://<nome>:<porta>/archivio.php
// The key comes from the environment, never from the command line, so it does not end up in the shell's history.
// It works in a room named `prova-…` and deletes it at the end. Exit code 0 when every check passes.
import { runArchiveServerChecks } from "./archiveServerCheckCore.mjs";

const url = process.argv[2];
const key = process.env.TI_ARCHIVE_KEY || "";

// The exit code is set and the program left to end by itself: process.exit() right after a fetch crashes Node on Windows.
async function main() {
  if (!url || !/^https?:\/\//.test(url) || !key) {
    console.error("Uso: imposta TI_ARCHIVE_KEY con la chiave, poi: node scripts/check-archive-server.mjs https://<nome>:<porta>/archivio.php");
    return 2;
  }
  // First of all: is it there, and is the key its own? Fourteen failed checks would say it less clearly.
  let greeting = null;
  try {
    greeting = await fetch(`${url}${url.includes("?") ? "&" : "?"}ping=1`, { headers: { "X-TI-Key": key } });
  } catch (error) {
    console.error(`Il server non risponde: ${error?.cause?.message || error?.message || error}`);
    return 1;
  }
  if (greeting.status === 401) {
    console.error("Il server risponde, ma la chiave in TI_ARCHIVE_KEY non è la sua.");
    return 1;
  }
  if (greeting.status !== 200) {
    console.error(`Il server risponde ${greeting.status}: ${(await greeting.text()).slice(0, 300)}`);
    return 1;
  }

  const results = await runArchiveServerChecks({ fetch, url, key });
  for (const result of results) {
    console.log(`${result.ok ? "ok  " : "NO  "} ${result.name}${result.ok ? "" : `\n      ${result.detail}`}`);
  }
  const failed = results.filter((result) => !result.ok).length;
  console.log(failed ? `\n${failed} controlli falliti su ${results.length}.` : `\nTutti i ${results.length} controlli passati.`);
  return failed ? 1 : 0;
}

process.exitCode = await main();

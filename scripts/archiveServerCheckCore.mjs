// Archivio degli attori (docs/PIANO_ARCHIVIO_ATTORI.md), lotto A2: the checks an archive server must pass. They speak
// the protocol described in test-support/archiveServerReference.js to a real address (scripts/check-archive-server.mjs)
// or to the reference itself (test/archiveServerCheck.test.js). They work in a room of their own, `prova-…`, and delete
// it at the end: no campaign's room is read or written.
const ORIGIN = "https://take-initiative.onrender.com";

function describe(value) {
  const text = JSON.stringify(value);
  return text === undefined ? String(value) : text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

// Runs every check and returns [{ name, ok, detail }]. `fetch` is the platform's, or the reference's.
export async function runArchiveServerChecks({ fetch, url, key, room = `prova-${Date.now().toString(36)}` } = {}) {
  const results = [];
  const base = String(url || "");
  const address = (query) => `${base}${base.includes("?") ? "&" : "?"}${new URLSearchParams(query)}`;
  const call = async (method, query, { body, headers = {}, withKey = true, origin = ORIGIN } = {}) => {
    const response = await fetch(address(query), {
      method,
      headers: { ...(origin ? { Origin: origin } : {}), ...(withKey ? { "X-TI-Key": key } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
      ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}
    return { status: response.status, data, text, headers: response.headers };
  };
  const check = async (name, run) => {
    try {
      const failure = await run();
      results.push({ name, ok: !failure, detail: failure || "" });
    } catch (error) {
      results.push({ name, ok: false, detail: `errore: ${error?.message || error}` });
    }
  };
  const expectStatus = (answer, status) => (answer.status === status ? "" : `atteso ${status}, arrivato ${answer.status}: ${answer.text.slice(0, 200)}`);
  // The dates are milliseconds, as the plugin sends them: a server that reads them as 32 bit numbers fails here.
  const T0 = 1764000000000;
  const write = (extra = {}) => ({ kind: "actor", id: "actor-prova", name: "Prova", section: "card", baseRev: 0, at: T0,
    json: JSON.stringify({ entry: { name: "Prova", profile: { armorClass: 15, savingThrows: {}, quickActions: [] } }, keys: ["prova"] }), ...extra });

  await check("risponde al saluto con la chiave giusta", async () => {
    const answer = await call("GET", { ping: 1 });
    return expectStatus(answer, 200) || (answer.data?.ok === true && answer.data.protocollo === 1 ? "" : `risposta inattesa: ${describe(answer.data)}`);
  });
  await check("rifiuta una chiave sbagliata o assente", async () => {
    const wrong = await call("GET", { ping: 1 }, { headers: { "X-TI-Key": "x".repeat(40) }, withKey: false });
    const missing = await call("GET", { ping: 1 }, { withKey: false });
    return expectStatus(wrong, 401) || expectStatus(missing, 401);
  });
  await check("dichiara l'origine del plugin e rifiuta le altre", async () => {
    const allowed = await call("GET", { ping: 1 });
    if (allowed.headers.get("access-control-allow-origin") !== ORIGIN) return `Access-Control-Allow-Origin: ${allowed.headers.get("access-control-allow-origin")}`;
    const preflight = await call("OPTIONS", { room }, { withKey: false, headers: { "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "content-type,x-ti-key" } });
    if (preflight.status !== 204 && preflight.status !== 200) return `preflight: ${preflight.status}`;
    if (!/x-ti-key/i.test(preflight.headers.get("access-control-allow-headers") || "")) return "il preflight non ammette X-TI-Key";
    return expectStatus(await call("GET", { ping: 1 }, { origin: "https://altro.example" }), 403);
  });
  await check("rifiuta una stanza non valida", async () => expectStatus(await call("GET", { room: "../etc" }), 400));
  await check("una stanza nuova è vuota", async () => {
    const answer = await call("GET", { room, since: 0 });
    return expectStatus(answer, 200) || (answer.data?.seq === 0 && Array.isArray(answer.data.records) && answer.data.records.length === 0 ? "" : describe(answer.data));
  });
  await check("accetta la prima scrittura e le dà la revisione 1", async () => {
    const answer = await call("PUT", { room }, { body: write() });
    return expectStatus(answer, 200) || (answer.data?.rev === 1 && answer.data.seq === 1 ? "" : describe(answer.data));
  });
  await check("la stessa scrittura rimandata non conta due volte", async () => {
    const answer = await call("PUT", { room }, { body: write() });
    return expectStatus(answer, 200) || (answer.data?.rev === 1 && answer.data.seq === 1 ? "" : describe(answer.data));
  });
  await check("rifiuta una scrittura partita da una revisione vecchia e restituisce la sua", async () => {
    const answer = await call("PUT", { room }, { body: write({ at: T0 + 2000, json: JSON.stringify({ altro: true }) }) });
    if (answer.status !== 409) return expectStatus(answer, 409);
    return answer.data?.section?.rev === 1 && answer.data.section.json === write().json ? "" : describe(answer.data);
  });
  await check("accetta la scrittura partita dalla revisione giusta", async () => {
    const answer = await call("PUT", { room }, { body: write({ baseRev: 1, at: T0 + 3000, json: JSON.stringify({ entry: { name: "Prova 2" }, keys: [] }) }) });
    return expectStatus(answer, 200) || (answer.data?.rev === 2 && answer.data.seq === 2 ? "" : describe(answer.data));
  });
  await check("le sezioni hanno revisioni separate", async () => {
    const answer = await call("PUT", { room }, { body: write({ section: "vitals", at: T0 + 3500, json: JSON.stringify({ hp: 7, hpMax: 9 }) }) });
    return expectStatus(answer, 200) || (answer.data?.rev === 1 && answer.data.seq === 3 ? "" : describe(answer.data));
  });
  await check("restituisce il valore identico, oggetti vuoti compresi", async () => {
    const json = JSON.stringify({ vuoto: {}, lista: [], testo: "àèìòù «»", numero: 1.5, nullo: null });
    const put = await call("PUT", { room }, { body: write({ kind: "card-key", id: "asset:https://img.example/a b.png?x=1|2", name: "Chiave", at: T0 + 4000, json }) });
    if (put.status !== 200) return expectStatus(put, 200);
    const answer = await call("GET", { room, since: 3 });
    const record = answer.data?.records?.[0];
    if (answer.data?.records?.length !== 1 || record.kind !== "card-key" || record.id !== "asset:https://img.example/a b.png?x=1|2") return describe(answer.data);
    return record.sections.card.json === json && record.sections.card.rev === 1 && record.sections.card.at === T0 + 4000 && record.name === "Chiave" ? "" : describe(record);
  });
  await check("elenca le voci cambiate dopo un punto, dalla più vecchia", async () => {
    const all = await call("GET", { room, since: 0 });
    if (all.status !== 200 || all.data.seq !== 4) return describe(all.data);
    const actor = all.data.records.find((record) => record.kind === "actor");
    if (all.data.records.length !== 2 || all.data.records[0] !== actor) return `ordine o numero: ${describe(all.data.records.map((record) => [record.kind, record.seq]))}`;
    if (actor.seq !== 3 || actor.sections.card.rev !== 2 || actor.sections.vitals.rev !== 1) return describe(actor);
    const none = await call("GET", { room, since: 4 });
    return none.data?.records?.length === 0 ? "" : describe(none.data);
  });
  await check("rifiuta tipo, sezione, corpo e valore non validi", async () => {
    const cases = [
      [write({ kind: "pet" }), 400], [write({ kind: "card-key", section: "vitals" }), 400], [write({ id: "" }), 400],
      [write({ baseRev: -1 }), 400], [write({ json: "{non json" }), 400], ["{non json", 400],
      [write({ json: JSON.stringify("x".repeat(70000)) }), 413],
    ];
    for (const [body, status] of cases) {
      const answer = await call("PUT", { room }, { body });
      if (answer.status !== status) return `${describe(typeof body === "string" ? body : { ...body, json: undefined })}: ${expectStatus(answer, status)}`;
    }
    return "";
  });
  await check("non cancella una stanza che non è di prova", async () => expectStatus(await call("DELETE", { room: "campagna-vera" }), 403));
  await check("cancella la stanza di prova", async () => {
    const removed = await call("DELETE", { room });
    if (removed.status !== 200) return expectStatus(removed, 200);
    const answer = await call("GET", { room, since: 0 });
    return answer.data?.seq === 0 && answer.data.records.length === 0 ? "" : describe(answer.data);
  });
  return results;
}

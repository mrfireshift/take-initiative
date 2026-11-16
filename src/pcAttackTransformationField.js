// Trasformazioni, lotto W2a (docs/PIANO_TRASFORMAZIONI.md): the «Forma» field of Wild Shape in the attack console's
// Capacità tab (field type "transformation-form" of pcAttackFeatureFormCore.js).
// - The card's quick forms (G37): at most 8, refused ones shown but not selectable.
// - «Altra forma…» (the user's addition to G37): the 5eTools archive of this browser (the GM's; a player's has none), or a
//   monster's JSON or a stat block pasted as text; a preview that says why a form is refused, and asks the type or the
//   challenge rating a pasted text leaves out.
// - «Usa» takes the form for this activation only (it lives on the pill); «Usa e salva» also keeps it among the quick
//   forms, replacing the one the GM picks when the 8 are full. «Togli dalle rapide» takes one off the card.
// The chosen form goes in values.form, which pcAttackFeatureRequest passes to activateClassFeature.
import {
  CREATURE_TYPES,
  MAX_TRANSFORMATION_FORMS,
  TRANSFORMATION_FORMS_FIELD,
  sanitizeTransformationForm,
  sanitizeTransformationForms,
  transformationContextForCharacter,
  transformationFormAllowed,
  transformationFormKey,
  transformationFormPortraitUrl,
  transformationFormSummary,
  transformationFormsWith,
  transformationFormsWithout,
  transformationTokenSources,
} from "./transformationFormsCore.js";

import { createLocalOptionsStore } from "./options/localOptionsStore.js";
import { transformationFormEntries, transformationFormStatblockRef, transformationStatblockText } from "./transformationStatblockCore.js";

// The forms' stat blocks read in this page, by reference: { state, view } (16/11/2026).
const statblockViews = new Map();
let statblockLoader = null;
async function loadFormStatblock(ref) {
  try {
    if (!statblockLoader) {
      const { createMonsterStatblockTextLoader } = await import("./monsterStatblockTextLoader.js");
      statblockLoader = createMonsterStatblockTextLoader();
    }
    return await statblockLoader.view(ref, { fromArchive: true, revision: ref });
  } catch {
    return null;
  }
}

const IMPORTED = "__imported__";

// The GM's 5eTools image mirror, from this browser's options ("" for a player, or without one).
function fiveToolsImagesBase() {
  try {
    return String(createLocalOptionsStore().readPersisted()?.tools?.fiveToolsImages || "");
  } catch {
    return "";
  }
}

// The size of a portrait once it has loaded, or null (missing in the mirror, too slow).
function loadPortraitSize(documentRef, url) {
  const ImageClass = documentRef?.defaultView?.Image || globalThis.Image;
  if (typeof ImageClass !== "function") return Promise.resolve(null);
  return new Promise((resolve) => {
    const image = new ImageClass();
    const timer = setTimeout(() => resolve(null), 15000);
    image.onload = () => {
      clearTimeout(timer);
      resolve(image.naturalWidth > 0 && image.naturalHeight > 0 ? { width: image.naturalWidth, height: image.naturalHeight } : null);
    };
    image.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    image.src = url;
  });
}
const RESULTS_LIMIT = 12;
const SAVED_FORMS_MS = 10000;

// The archive of this browser (fiveToolsArchiveStore.js, IndexedDB): read on each opening of «Altra forma…» (a book added
// in the sheet's «Archivio online» while the console is open shows at the next opening), and kept while the panel stays
// open, for the search's keystrokes.
let archivePromise = null;
function loadArchive() {
  archivePromise ||= (async () => {
    const [{ createFiveToolsArchiveStore }, { fiveToolsCollection }] = await Promise.all([
      import("./fiveToolsArchiveStore.js"),
      import("./fiveToolsMonsterCore.js"),
    ]);
    return fiveToolsCollection(await createFiveToolsArchiveStore().allData());
  })().catch(() => ({ monsters: [], pool: [] }));
  return archivePromise;
}

function element(documentRef, tag, className = "", text = "") {
  const node = documentRef.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function miniButton(documentRef, label, title, onClick, disabled = false) {
  const node = element(documentRef, "button", "mini-button", label);
  node.type = "button";
  node.title = title;
  node.disabled = !!disabled;
  node.addEventListener("click", onClick);
  return node;
}

/**
 * The field's block. values: the feature's values in the console (kept across re-renders): form, formKey, formPanel,
 * formQuery, formText, formPreview, formReplaceKey, formBusy. card: the actor's card; item: its token (id and name, for
 * «Usa e salva»). rerender: draws the Capacità tab again; setStatus: the console's status line. creatures: the tokens of
 * the scene, for the source «token nella stanza» of «Altra forma…» (the monsters among them).
 */
export function transformationFormField({
  documentRef = globalThis.document, field = {}, values = {}, card = {}, item = null, disabled = false,
  rerender = () => {}, setStatus = () => {}, creatures = [],
} = {}) {
  // Lotto W7: a spell's limits come with the field (the target's level for Polymorph, the caster's for Shapechange).
  const context = field.context && typeof field.context === "object"
    ? field.context
    : transformationContextForCharacter(card?.characterBuild, field.kind);
  // The quick forms just written, until the card read back has them: the console's card is not drawn again when only
  // the character's card changes, and a form saved must show among them at once.
  const stored = sanitizeTransformationForms(card?.[TRANSFORMATION_FORMS_FIELD]);
  const written = Array.isArray(values.formSaved?.forms) && Date.now() - values.formSaved.at < SAVED_FORMS_MS
    && JSON.stringify(values.formSaved.forms) !== JSON.stringify(stored) ? values.formSaved.forms : null;
  if (!written) values.formSaved = null;
  const quick = written || stored;
  const check = (form) => transformationFormAllowed(form, context);
  const off = disabled || values.formBusy === true;

  // The chosen form: a quick form the source allows, or an imported one (also a quick form just saved, until the card
  // read back lists it).
  const chosenKey = values.form ? transformationFormKey(values.form) : "";
  const inQuick = !!chosenKey && quick.some((form) => transformationFormKey(form) === chosenKey && check(form).allowed);
  values.formKey = !values.form ? "" : inQuick ? chosenKey : IMPORTED;

  const wrap = element(documentRef, "div", "feature-field feature-transformation");
  wrap.append(element(documentRef, "span", "feature-field-label", field.label || "Forma"));
  const select = element(documentRef, "select", "inline-select");
  const options = [{ value: "", label: quick.length ? "— scegli una forma —" : "Nessuna forma rapida: usa «Altra forma…»" }];
  for (const form of quick) {
    const allowed = check(form).allowed;
    options.push({ value: transformationFormKey(form), label: `${form.name}${form.cr ? ` · GS ${form.cr}` : ""}${allowed ? "" : " · non ammessa"}`,
      disabled: !allowed });
  }
  if (values.formKey === IMPORTED) options.push({ value: IMPORTED, label: `Importata: ${values.form.name}` });
  select.replaceChildren(...options.map((option) => {
    const node = element(documentRef, "option", "", option.label);
    node.value = option.value;
    node.disabled = option.disabled === true;
    return node;
  }));
  select.value = values.formKey;
  select.disabled = off;
  select.addEventListener("change", () => {
    if (select.value !== IMPORTED) values.form = quick.find((form) => transformationFormKey(form) === select.value) || null;
    rerender();
  });
  wrap.append(select);
  if (values.form) {
    wrap.append(element(documentRef, "span", "feature-field-hint", transformationFormSummary(values.form)));
    const checked = check(values.form);
    for (const reason of checked.reasons) wrap.append(element(documentRef, "p", "hint", reason));
    if (checked.note) wrap.append(element(documentRef, "p", "hint", checked.note));
  }
  // 16/11/2026: the form's portrait on the token, from the GM's 5eTools image mirror, once the file has loaded (its size
  // keeps the token's footprint). On unless the GM takes the tick off; nothing without a mirror or a portrait.
  const portrait = values.form ? portraitOption() : null;
  if (!values.form) values.formPortrait = null;
  if (portrait) wrap.append(portrait);

  function portraitOption() {
    const url = transformationFormPortraitUrl(values.form, fiveToolsImagesBase());
    if (!url) {
      values.formPortrait = null;
      return null;
    }
    if (values.portraitProbe?.url !== url) {
      values.portraitProbe = { url, state: "loading" };
      values.formPortrait = null;
      void loadPortraitSize(documentRef, url).then((size) => {
        if (values.portraitProbe?.url !== url) return;
        values.portraitProbe = size ? { url, state: "ok", ...size } : { url, state: "none" };
        rerender();
      });
      return null;
    }
    if (values.portraitProbe.state !== "ok") {
      values.formPortrait = null;
      return null;
    }
    const on = values.formPortraitOff !== true;
    values.formPortrait = on ? { url, width: values.portraitProbe.width, height: values.portraitProbe.height } : null;
    const label = element(documentRef, "label", "feature-transformation-portrait");
    const box = element(documentRef, "input");
    box.type = "checkbox";
    box.checked = on;
    box.disabled = off;
    box.addEventListener("change", () => {
      values.formPortraitOff = !box.checked;
      rerender();
    });
    const image = element(documentRef, "img", "feature-transformation-portrait-preview");
    image.src = url;
    image.alt = "";
    label.append(box, image, documentRef.createTextNode("Usa il ritratto della forma sul token"));
    return label;
  }

  async function saveForms(forms, done) {
    if (!item?.id) return false;
    values.formBusy = true;
    rerender();
    try {
      const { saveInitiativeCard } = await import("./initiativeCards.js");
      await saveInitiativeCard(item.id, item.name || "", { [TRANSFORMATION_FORMS_FIELD]: forms }, { preserveExhaustion: true });
      values.formSaved = { forms: sanitizeTransformationForms(forms), at: Date.now() };
      setStatus(done, "ok");
      return true;
    } catch (error) {
      setStatus(String(error?.message || error || "Forme rapide non salvate."), "error");
      return false;
    } finally {
      values.formBusy = false;
      rerender();
    }
  }

  const actions = element(documentRef, "div", "feature-transformation-row");
  actions.append(miniButton(documentRef, values.formPanel ? "Chiudi" : "Altra forma…",
    values.formPanel ? "Chiude l'import della forma" : "Importa una forma che non è tra le rapide",
    () => {
      values.formPanel = !values.formPanel;
      if (values.formPanel) archivePromise = null;
      rerender();
    }, off));
  // 16/11/2026: the chosen form's stat block to read, before choosing it (transformationStatblockCore.js).
  if (values.form) {
    actions.append(miniButton(documentRef, values.formStatblockOpen ? "Chiudi statblock" : "Statblock",
      values.formStatblockOpen ? "Chiude lo statblock della forma" : "Legge lo statblock della forma: tratti, multiattacco, azioni",
      () => { values.formStatblockOpen = !values.formStatblockOpen; rerender(); }));
  }
  const chosenQuick = values.formKey && values.formKey !== IMPORTED
    ? quick.find((form) => transformationFormKey(form) === values.formKey) : null;
  if (chosenQuick && item?.id) {
    actions.append(miniButton(documentRef, "Togli dalle rapide", `Toglie ${chosenQuick.name} dalle forme rapide della scheda`, () => {
      void saveForms(transformationFormsWithout(quick, values.formKey), `${chosenQuick.name}: tolta dalle forme rapide.`)
        .then((saved) => { if (saved) { values.form = null; rerender(); } });
    }, off));
  }
  wrap.append(actions);
  if (values.form && values.formStatblockOpen) wrap.append(statblockPanel());
  if (values.formPanel) wrap.append(importPanel());
  return wrap;

  // The form's stat block: the GM's archive by its reference, read once per page; without it, the snapshot's text.
  function statblockPanel() {
    const ref = transformationFormStatblockRef(values.form);
    const read = ref ? statblockViews.get(ref) : null;
    if (ref && !read) {
      statblockViews.set(ref, { state: "loading" });
      void loadFormStatblock(ref).then((view) => {
        statblockViews.set(ref, { state: "done", view });
        rerender();
      });
    }
    const loading = ref && statblockViews.get(ref)?.state === "loading";
    const view = ref ? statblockViews.get(ref)?.view || null : null;
    const text = loading ? "Lettura dello statblock…"
      : view ? transformationStatblockText(view)
        : transformationFormEntries(values.form, null).find((entry) => entry.group === "form-statblock")?.text || "";
    return element(documentRef, "p", "spell-text feature-transformation-statblock", text);
  }

  function importPanel() {
    const panel = element(documentRef, "div", "feature-transformation-panel");
    // The archive's search: only the forms the source allows, the highest challenge rating first.
    const query = element(documentRef, "input", "field");
    query.type = "search";
    query.placeholder = "Cerca nell'archivio 5eTools";
    query.value = values.formQuery || "";
    query.disabled = off;
    const results = element(documentRef, "div", "feature-transformation-row");
    let serial = 0;
    const fillResults = async () => {
      const current = ++serial;
      const archive = await loadArchive();
      if (current !== serial) return;
      const text = String(values.formQuery || "").trim();
      if (!archive.monsters.length) {
        results.replaceChildren(element(documentRef, "span", "feature-field-hint",
          "Nessun archivio 5eTools in questo browser: incolla un JSON o il testo dello statblock."));
        return;
      }
      if (!text) {
        results.replaceChildren(element(documentRef, "span", "feature-field-hint", "Scrivi un nome: l'elenco mostra solo le forme ammesse."));
        return;
      }
      const { transformationFormCandidates, transformationFormFromFiveTools } = await import("./transformationCore.js");
      if (current !== serial) return;
      const found = transformationFormCandidates(archive.monsters, context, { query: text, limit: RESULTS_LIMIT });
      results.replaceChildren(...(found.length
        ? found.map(({ monster, form }) => miniButton(documentRef, `${monster.name}${form.cr ? ` · GS ${form.cr}` : ""} (${monster.source})`,
          "Mostra l'anteprima della forma", () => {
            values.formPreview = transformationFormFromFiveTools(monster, archive.pool);
            rerender();
          }, off))
        : [element(documentRef, "span", "feature-field-hint", "Nessuna forma ammessa con questo nome.")]));
    };
    query.addEventListener("input", () => { values.formQuery = query.value; void fillResults(); });
    panel.append(query, results);
    void fillResults();

    // A monster's token in the room (G37, a GM's source): its record in the archive when its card names one, else the
    // card's own numbers, with the type and the challenge rating to fill in as for a pasted text.
    const tokens = transformationTokenSources(creatures, item?.id || "");
    if (tokens.length) {
      const pick = element(documentRef, "select", "inline-select");
      pick.setAttribute("aria-label", "Forma da un token nella stanza");
      pick.replaceChildren(...[{ id: "", name: "Da un token nella stanza…" }, ...tokens].map((entry) => {
        const option = element(documentRef, "option", "", entry.fromArchive ? `${entry.name} (5eTools)` : entry.name);
        option.value = entry.id;
        return option;
      }));
      pick.value = values.formTokenId || "";
      pick.disabled = off;
      pick.addEventListener("change", async () => {
        values.formTokenId = pick.value;
        const token = (Array.isArray(creatures) ? creatures : []).find((entry) => entry?.id === pick.value);
        if (!token) return;
        const [archive, { transformationFormFromToken }] = await Promise.all([loadArchive(), import("./transformationCore.js")]);
        values.formPreview = transformationFormFromToken(token, archive);
        rerender();
      });
      const tokenRow = element(documentRef, "div", "feature-transformation-row");
      tokenRow.append(pick);
      panel.append(tokenRow);
    }

    // A monster's JSON, or a stat block as text.
    const paste = element(documentRef, "textarea", "field");
    paste.rows = 4;
    paste.placeholder = "Oppure incolla il JSON di un mostro di 5eTools, o il testo dello statblock";
    paste.value = values.formText || "";
    paste.disabled = off;
    paste.addEventListener("input", () => { values.formText = paste.value; });
    const pasteRow = element(documentRef, "div", "feature-transformation-row");
    pasteRow.append(miniButton(documentRef, "Leggi", "Legge la forma incollata", async () => {
      const { transformationFormFromImport } = await import("./transformationCore.js");
      values.formPreview = transformationFormFromImport(values.formText);
      rerender();
    }, off));
    panel.append(paste, pasteRow);

    const preview = values.formPreview;
    if (preview?.error) panel.append(element(documentRef, "p", "hint", preview.error));
    if (preview?.form) panel.append(...previewNodes(preview));
    return panel;
  }

  function previewNodes(preview) {
    const form = preview.form;
    const nodes = [element(documentRef, "span", "feature-field-hint", transformationFormSummary(form))];
    // What a pasted text may leave out: the type and the challenge rating, which the limits need.
    const missing = element(documentRef, "div", "feature-transformation-row");
    if (!form.type) {
      const type = element(documentRef, "select", "inline-select");
      type.replaceChildren(...[["", "Tipo…"], ...Object.entries(CREATURE_TYPES)].map(([value, label]) => {
        const node = element(documentRef, "option", "", label);
        node.value = value;
        return node;
      }));
      type.disabled = off;
      type.addEventListener("change", () => { preview.form = sanitizeTransformationForm({ ...form, type: type.value }); rerender(); });
      missing.append(type);
    }
    if (!form.cr) {
      const cr = element(documentRef, "input", "field");
      cr.type = "text";
      cr.placeholder = "GS (es. 1/4)";
      cr.size = 8;
      cr.disabled = off;
      cr.addEventListener("change", () => { preview.form = sanitizeTransformationForm({ ...form, cr: cr.value.trim() }); rerender(); });
      missing.append(cr);
    }
    if (missing.children.length) nodes.push(missing);
    const verdict = check(form);
    for (const reason of verdict.reasons) nodes.push(element(documentRef, "p", "hint", reason));
    const key = transformationFormKey(form);
    const full = quick.length >= MAX_TRANSFORMATION_FORMS && !quick.some((entry) => transformationFormKey(entry) === key);
    const buttons = element(documentRef, "div", "feature-transformation-row");
    if (full) {
      const replace = element(documentRef, "select", "inline-select");
      replace.replaceChildren(...[["", "Al posto di…"], ...quick.map((entry) => [transformationFormKey(entry), entry.name])].map(([value, label]) => {
        const node = element(documentRef, "option", "", label);
        node.value = value;
        return node;
      }));
      replace.value = values.formReplaceKey || "";
      replace.disabled = off;
      replace.addEventListener("change", () => { values.formReplaceKey = replace.value; });
      buttons.append(replace);
    }
    const take = () => {
      values.form = form;
      values.formPanel = false;
      values.formPreview = null;
      values.formReplaceKey = "";
    };
    buttons.append(
      miniButton(documentRef, "Usa", "Usa questa forma solo ora: resta sulla pill, non tra le forme rapide", () => { take(); rerender(); },
        off || !verdict.allowed),
      miniButton(documentRef, "Usa e salva", "Usa questa forma e tienila tra le forme rapide della scheda", async () => {
        const result = transformationFormsWith(quick, form, { replaceKey: values.formReplaceKey });
        if (result.error) { setStatus(result.error, "warn"); return; }
        if (await saveForms(result.forms, `${form.name}: salvata tra le forme rapide.`)) { take(); rerender(); }
      }, off || !verdict.allowed || !item?.id),
    );
    nodes.push(buttons);
    return nodes;
  }
}

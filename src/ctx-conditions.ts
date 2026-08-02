// /ctx-conditions.js
import OBR from "@owlbear-rodeo/sdk";
import { ID } from "./constants.js";
import {
  CONDITION_LIST,
  APPLICABLE_CONDITION_LIST,
  getConditionInstances
} from "./conditions.js";
import {
  conditionMutationOperations,
  requireAppliedEffectsMutation,
  runEffectsMutation,
} from "./effectsMutations.js";

const META_KEY = `${ID}/meta`;

// --- UI helpers -----------------------------------------------------------
function makeChip(name) {
  const chip = document.createElement("div");
  chip.className = "chip";
  const dot = document.createElement("div");
  dot.className = "dot";
  const label = document.createElement("span");
  label.textContent = name;
  chip.append(dot, label);
  chip.dataset.name = name;
  return chip;
}

function paintChip(chip: HTMLElement, state: "on" | "off" | "mixed") {
  const dot = chip.querySelector<HTMLDivElement>(".dot");
  if (!dot) return;
  dot.classList.remove("on", "mixed"); // reset
  if (state === "on") dot.classList.add("on");
  else if (state === "mixed") dot.classList.add("mixed");
}

let __REFRESH_TIMER: any = null;
let __CURRENT_IDS: string[] = [];

function readDuration(input: HTMLInputElement | null): number | null {
  const n = Math.floor(Number(input?.value || 0));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function durationOpts(input: HTMLInputElement | null) {
  const turns = readDuration(input);
  return turns ? { turns } : {};
}

function queueRefresh(grid: HTMLElement) {
  clearTimeout(__REFRESH_TIMER);
  __REFRESH_TIMER = setTimeout(async () => {
    const ids = __CURRENT_IDS.length ? __CURRENT_IDS : await getSelectedIdsSafe({ robust: false });
    await refreshChipsState(grid, ids);
  }, 5);
}


// Piccolo helper
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
/**
 * Tenta di leggere gli ID dal context menu (robusto), poi fallback alla selection.
 * - robust=true: fino a 6 retry ogni 40ms (≈240ms worst-case)
 * - robust=false: 1 tentativo solo (velocissimo)
 */
async function getSelectedIdsSafe(opts: { robust?: boolean } = {}): Promise<string[]> {
  const robust = !!opts.robust;
  const tries = robust ? 6 : 1;
  for (let i = 0; i < tries; i++) {
    try {
      if (OBR?.contextMenu?.getContext) {
        const ctx = await OBR.contextMenu.getContext();
        const ids = (ctx?.items || []).map(i => i.id).filter(Boolean);
        if (ids.length) return ids;
      }
    } catch {}
    if (robust) await sleep(40);
  }
  try {
    const sel = await OBR.player.getSelection();
    return Array.isArray(sel) ? sel : [];
  } catch {
    return [];
  }
}


async function readFlagsFor(ids) {
  if (!ids.length) return { byCond: new Map(), anyCustom: false };
  const idset = new Set(ids.filter(Boolean));
  const items = await OBR.scene.items.getItems(i => idset.has(i.id));
  const byCond = new Map();
  const allNames = [...CONDITION_LIST];
  let anyCustom = false;

  for (const it of items) {
    const instances = getConditionInstances(it?.metadata?.[META_KEY]?.conditions || {});
    const names = new Set(instances.map((instance) => String(instance.condition || "").toLocaleLowerCase()));
    if (instances.some((instance) => !CONDITION_LIST.includes(String(instance.condition || "")))) {
      anyCustom = true;
    }

    for (const name of allNames) {
      const active = names.has(name.toLocaleLowerCase());
      if (!byCond.has(name)) byCond.set(name, { all: true, some: false });
      const state = byCond.get(name);
      state.all = state.all && active;
      state.some = state.some || active;
    }
  }
  return { byCond, anyCustom };
}
async function refreshChipsState(grid, ids) {
  const { byCond } = await readFlagsFor(ids);
  grid.querySelectorAll(".chip").forEach(chip => {
    const name = chip.dataset.name;
    const s = byCond.get(name) || { all: false, some: false };
    const state = s.all ? "on" : (s.some ? "mixed" : "off");
    paintChip(chip, state);
  });
}

// --- Theme ---------------------------------------------------------------
async function applyTheme() {
  try {
    const t = await OBR.theme.getTheme();
    document.documentElement.style.setProperty("--obrt-text", t?.text ?? "#fff");
    // hover: se hai un colore di pannello, puoi calcolarlo qui
  } catch {}
}

// --- MOUNT ---------------------------------------------------------------
async function mount() {
  await OBR.onReady();

  await applyTheme();

  const wrap = document.getElementById("wrap");
  if (!wrap) return;

  // griglia: inseriamo i chip PRIMA della row custom
  const grid = document.createElement("div");
  grid.style.display = "contents"; // sfrutta la grid del parent
  wrap.insertBefore(grid, wrap.firstElementChild);

  const turnsInput = document.getElementById("conditionTurns") as HTMLInputElement | null;

  // crea chip per ogni condizione
APPLICABLE_CONDITION_LIST.forEach((name) => {
  const chip = makeChip(name);

chip.addEventListener("click", () => {
  // 1) UI ottimistica immediata
  const wasOn = chip.querySelector(".dot")?.classList.contains("on");
  paintChip(chip, wasOn ? "off" : "on");

  // 2) prendi gli ID dalla cache (istantaneo); fallback leggero se vuota
  const run = async () => {
    let ids = __CURRENT_IDS.length ? __CURRENT_IDS : await getSelectedIdsSafe({ robust: false });
    if (!ids.length) {
      // nessun target reale → revert visivo e stop
      paintChip(chip, wasOn ? "on" : "off");
      return;
    }

    // 3) fire‑and‑forget: non bloccare il listener
    const mutation = await runEffectsMutation(conditionMutationOperations({
      targetIds: ids,
      conditionName: name,
      options: wasOn ? {} : durationOpts(turnsInput),
      mode: "toggle",
    }), {
      kind: "condition",
      label: `${wasOn ? "Rimossa" : "Applicata"}: ${name}`,
      targetIds: ids,
      history: {
        kind: "condition",
        label: `${wasOn ? "Rimossa" : "Applicata"}: ${name}`,
      },
    });
    requireAppliedEffectsMutation(mutation);
    queueRefresh(grid);
  };
  run().catch(() => {
    // in caso di errore: ripristina lo stato visivo precedente
    paintChip(chip, wasOn ? "on" : "off");
    queueRefresh(grid);
  });
  };
  // lancia senza attendere
  run();
});

  grid.appendChild(chip);
});

  // controlli extra (custom + clear)
  const input = document.getElementById("customText") as HTMLInputElement | null;
  const btnAdd = document.getElementById("btnAdd");
  const btnClear = document.getElementById("btnClear");

  btnAdd?.addEventListener("click", async () => {
    const text = (input?.value || "").trim();
    if (!text) return;
    const ids = await getSelectedIdsSafe();
    if (!ids.length) return;
    const mutation = await runEffectsMutation(conditionMutationOperations({
      targetIds: ids,
      conditionName: text,
      options: durationOpts(turnsInput),
      mode: "custom",
    }), {
      kind: "condition",
      label: `Applicata: ${text}`,
      targetIds: ids,
      history: { kind: "condition", label: `Applicata: ${text}` },
    });
    requireAppliedEffectsMutation(mutation);
    input.value = "";
    await refreshChipsState(grid, ids);
  });

  btnClear?.addEventListener("click", async () => {
    const ids = await getSelectedIdsSafe();
    if (!ids.length) return;
    const mutation = await runEffectsMutation([{
      type: "condition:clear",
      targetIds: ids,
    }], {
      kind: "condition",
      label: "Rimosse tutte le condizioni",
      targetIds: ids,
      history: { kind: "condition", label: "Rimosse tutte le condizioni" },
    });
    requireAppliedEffectsMutation(mutation);
    await refreshChipsState(grid, ids);
  });

// Prima verniciata: prendi gli ID in modo ROBUSTO
__CURRENT_IDS = await getSelectedIdsSafe({ robust: true });
await refreshChipsState(grid, __CURRENT_IDS);

// Quando il popup riprende focus, riallinea gli ID e lo stato
window.addEventListener("focus", async () => {
  __CURRENT_IDS = await getSelectedIdsSafe({ robust: true });
  await refreshChipsState(grid, __CURRENT_IDS);
});

  // aggiorna i dot se cambiano i metadata dei selezionati (best-effort)
  OBR.scene.items.onChange(() => {
  queueRefresh(grid);
});

  // aggiorna il tema live
  OBR.theme.onChange(applyTheme);
}

mount().catch((e) => {
  console.error("[ctx-conditions] mount error:", e);
});

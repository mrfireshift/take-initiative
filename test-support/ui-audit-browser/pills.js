// The compact card's effect pills, built by the production functions and shown at 2x, to check text overflow and the
// "+N" button before and after a change. The popover pills are rebuilt here with the same payload format.
import { __buildCompactEffectPill, buildCompactCardStatus } from "/src/initiativeCardCompact.js";

const root = document.getElementById("root");
const section = (title) => {
  const heading = document.createElement("h2");
  heading.textContent = title;
  root.append(heading);
  const row = document.createElement("div");
  row.className = "row";
  root.append(row);
  return row;
};
const card = (row, effects, options = {}) => {
  const box = document.createElement("div");
  box.className = "card";
  box.append(buildCompactCardStatus(effects, options).status);
  row.append(box);
};

const oath = { kind: "debuff", label: "Giuramento di Inimicizia (9)", title: "Giuramento di Inimicizia | 9 round" };
const inspiration = { kind: "buff", label: "Ispirazione Bardica (d10)" };
const prone = { kind: "debuff", label: "⬇️ Prono" };
const short = { kind: "buff", label: "Ira" };
const rage = { kind: "class-feature", label: "🔥 Ira del Berserker", classFeatureInstance: { type: "class-feature" },
  theme: { background: "#7f1d1d", accent: "#f97316", text: "#fff7ed" } };

let row = section("Pill della card (preview): testo lungo e corto");
card(row, [oath], { hasExpandableEffects: false });
card(row, [inspiration], { hasExpandableEffects: false });
card(row, [short], { hasExpandableEffects: false });

row = section("Pill con effetti nascosti: 1, 3 e 12 in più");
card(row, [prone, oath]);
card(row, [prone, oath, inspiration, short]);
card(row, [prone, ...Array.from({ length: 12 }, () => short)]);

row = section("Capacità di classe con ×, preview ed espansa");
const featureBox = document.createElement("div");
featureBox.className = "card";
featureBox.append(__buildCompactEffectPill(rage, true, { onTerminateClassFeature: () => {} }));
row.append(featureBox);
const featureExpanded = document.createElement("div");
featureExpanded.append(__buildCompactEffectPill(rage, false, { onTerminateClassFeature: () => {} }));
row.append(featureExpanded);

// The "+N" popover is its own page and reads its pills from localStorage.
row = section("Popover degli altri effetti, con summary");
localStorage.setItem("com.thebigpicture.initiative/compact-effects-payload", JSON.stringify({ effects: [
  oath, inspiration, prone,
  { kind: "spell", key: "lentezza", label: "Lentezza (10)", summaryParts: [{ id: "speed", label: "Velocità dimezzata" }, { id: "ac", label: "CA −2 / TS Des −2" }] },
] }));
const popover = document.createElement("iframe");
popover.src = "/compact-effects.html";
Object.assign(popover.style, { width: "92px", height: "90px", border: "0", background: "transparent" });
row.append(popover);

// JB2A library browser: one card per animation shape, its variants played on demand (extracted by the dev server).
const $ = (id) => document.getElementById(id);
const HIDDEN = /^Generic\/(Weapon_Attacks|Traps|UI|Token_Stage)|SciFi|Laser|^2nd_Level\/Spiritual_Weapon/;
const STORE = "jb2a-library-starred";
let shapes = [];
let starred = new Set();
try { starred = new Set(JSON.parse(localStorage.getItem(STORE) || "[]")); } catch {}
const save = () => { try { localStorage.setItem(STORE, JSON.stringify([...starred])); } catch {} };
const label = (key) => key.split("/").pop().replace(/_<c>/g, "").replace(/_/g, " ");
const node = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; };

function render() {
  const query = $("search").value.trim().toLowerCase();
  const family = $("family").value;
  const visible = shapes.filter((shape) => (!$("hide").checked || !HIDDEN.test(shape.key))
    && (!family || shape.family === family)
    && (!$("only-starred").checked || starred.has(shape.key))
    && (!query || shape.key.toLowerCase().includes(query)));
  $("count").textContent = `${visible.length} forme · ${visible.reduce((sum, shape) => sum + shape.variants.length, 0)} file`;
  const groups = new Map();
  for (const shape of visible) (groups.get(shape.family) || groups.set(shape.family, []).get(shape.family)).push(shape);
  const list = $("list");
  list.replaceChildren(...[...groups.entries()].map(([name, items]) => {
    const section = node("section");
    const title = node("h2", "", name);
    title.append(node("small", "", ` · ${items.length}`));
    const grid = node("div", "grid");
    for (const shape of items) {
      const card = node("div", `card${starred.has(shape.key) ? " starred" : ""}`);
      const thumb = node("div", "thumb");
      if (shape.thumb) { const img = node("img"); img.loading = "lazy"; img.src = `/jb2a/${shape.thumb}`; img.alt = ""; thumb.append(img); }
      else {
        // No thumbnail in the pack: the lightest clip plays in the card while the pointer is on it.
        thumb.append(node("span", "", "▶ passa il mouse per l'anteprima"));
        card.addEventListener("mouseenter", () => {
          const video = node("video");
          Object.assign(video, { src: `/jb2a/${shape.variants[0].path}`, autoplay: true, loop: true, muted: true, playsInline: true });
          video.style.cssText = "max-width:100%;max-height:100%";
          thumb.replaceChildren(video);
        }, { once: true });
      }
      const text = node("div", "label", label(shape.key));
      text.append(node("small", "", `${shape.variants.length} variant${shape.variants.length === 1 ? "e" : "i"}`));
      card.append(thumb, text, node("span", "star", "★"));
      card.addEventListener("click", () => open(shape));
      grid.append(card);
    }
    section.append(title, grid);
    return section;
  }));
}

let current = null;
function play(variant) {
  $("video").src = `/jb2a/${variant.path}`;
  $("meta").textContent = `${variant.path} · ${(variant.size / 1e6).toFixed(2)} MB`;
  for (const button of $("variants").children) button.setAttribute("aria-pressed", String(button.dataset.path === variant.path));
}
function updateStar() {
  $("star").textContent = starred.has(current.key) ? "★ Segnato" : "☆ Segna";
  $("picked").textContent = [...starred].join("\n") || "—";
}
function open(shape) {
  current = shape;
  $("title").textContent = label(shape.key);
  $("variants").replaceChildren(...shape.variants.map((variant) => {
    const button = node("button", "", variant.path.split("/").pop());
    button.type = "button";
    button.dataset.path = variant.path;
    button.addEventListener("click", () => play(variant));
    return button;
  }));
  play(shape.variants[0]);
  updateStar();
  $("viewer").showModal();
}
$("star").addEventListener("click", () => {
  if (starred.has(current.key)) starred.delete(current.key); else starred.add(current.key);
  save(); updateStar(); render();
});
$("close").addEventListener("click", () => $("viewer").close());
$("viewer").addEventListener("close", () => { $("video").removeAttribute("src"); $("video").load(); });
$("copy").addEventListener("click", async () => {
  const text = [...starred].join("\n");
  try { await navigator.clipboard.writeText(text); $("copy").textContent = "Copiati!"; }
  catch { $("copy").textContent = "Copia non riuscita"; }
  setTimeout(() => { $("copy").textContent = "Copia segnati"; }, 1500);
});
for (const id of ["search", "family", "hide", "only-starred"]) $(id).addEventListener("input", render);

shapes = await (await fetch("/jb2a-shapes.json")).json();
shapes.sort((a, b) => a.family.localeCompare(b.family) || a.key.localeCompare(b.key));
for (const family of [...new Set(shapes.map((shape) => shape.family))]) {
  const option = node("option", "", family);
  option.value = family;
  $("family").append(option);
}
render();
window.library = { shapes: () => shapes, open, starred: () => [...starred] };

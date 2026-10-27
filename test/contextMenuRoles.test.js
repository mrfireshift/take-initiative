// The token menu on a player's client: the GM's tools stay the GM's, the height of a token is the players' too.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/contextMenu.js", import.meta.url), "utf8");
// One registration per OBR.contextMenu.create block: its labels and whether it is the GM's alone.
const menus = source.split("OBR.contextMenu.create(").slice(1).map((block) => ({
  labels: [...block.matchAll(/label: "([^"]+)"/gu)].map((match) => match[1]),
  gmOnly: /roles: \["GM"\]/u.test(block.split("OBR.contextMenu.create(")[0].split(/\n\s*(?:onClick|async onClick|embed)\b/u)[0]),
}));
const menuFor = (label) => menus.find((menu) => menu.labels.includes(label));

test("on a player's client the initiative and boss entries never show", () => {
  for (const label of ["Boss Actions", "Segna come…", "Rimuovi dall’iniziativa", "Aggiungi all’iniziativa…",
    "Abilita Azioni Leggendarie", "Disabilita Azioni Leggendarie", "Abilita Epic Boss", "Disabilita Epic Boss",
    "Abilita Paragon Boss", "Disabilita Paragon Boss", "Condizioni…", "HP condivisi"]) {
    assert.ok(menuFor(label), `${label} is registered`);
    assert.equal(menuFor(label).gmOnly, true, `${label} is for the GM only`);
  }
});

test("a player sets the height of a player character only; the GM that of any creature", () => {
  const block = source.split("OBR.contextMenu.create(").find((entry) => entry.includes("/token-elevation`"));
  const icons = block.split(/\n\s*embed\b/u)[0].split("icon: ICON_ELEVATION").slice(1);
  assert.equal(icons.length, 2);
  assert.match(icons[0], /roles: \["GM"\],\s*every: \[isCharacter\(\)\]/u);
  assert.match(icons[1], /roles: \["PLAYER"\]/u);
  assert.match(icons[1], /key: \["metadata", META_KEY, "attitude"\], value: "pc"/u);
});

test("Boss Actions shows only on an Epic boss", () => {
  const block = source.split("OBR.contextMenu.create(").find((entry) => entry.includes('label: "Boss Actions"'));
  assert.match(block, /key: \["metadata", META_KEY, "epic"\], operator: "!=", value: undefined/u);
});

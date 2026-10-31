import assert from "node:assert/strict";
import test from "node:test";

import { calculateQuickHPChange } from "../src/quickHpCore.js";
import { previewReactionHp } from "../src/reactionHpCore.js";

// Lot U3a of the system UX audit: the Effetti console previewed only its own arithmetic, so a creature under Death
// Ward showed 0 HP where the command writes 1, and the caster of a Warding Bond did not show the damage it shares.
const META_KEY = "com.thebigpicture.initiative/meta";
const creature = (id, name, hp, hpMax, instances = [], extra = {}) => ({
  id, name, metadata: { [META_KEY]: { hp, hpMax, conditions: { instances }, ...extra } },
});
const deathWard = { id: "ward-1", condition: "Interdizione alla morte", mechanics: { deathWard: true } };
const bondFrom = (casterId) => ({ id: "bond-1", condition: "Vincolo di interdizione", sourceId: casterId, mechanics: { wardingBond: true } });
const damage = (item, value) => ({
  item,
  change: calculateQuickHPChange({ mode: "damage", value, hp: item.metadata[META_KEY].hp, hpMax: item.metadata[META_KEY].hpMax,
    tempHp: item.metadata[META_KEY].tempHp }),
});

test("U3a: Interdizione alla morte, l'anteprima mostra 1 PF dove il calcolo semplice dice 0", () => {
  const kios = creature("kios", "Kios", 6, 40, [deathWard]);
  const { byId, notes } = previewReactionHp({ entries: [damage(kios, 15)], items: [kios] });
  assert.equal(byId.get("kios").hp, 1);
  assert.equal(byId.get("kios").ward, true);
  assert.deepEqual(notes, ["Interdizione alla morte: Kios resta a 1 PF e l'interdizione termina."]);
});

test("U3a: Vincolo di interdizione, il caster fuori dai bersagli compare con i suoi danni e una nota", () => {
  const omar = creature("omar", "Omar", 30, 40);
  const kios = creature("kios", "Kios", 20, 40, [bondFrom("omar")]);
  const { byId, notes } = previewReactionHp({ entries: [damage(kios, 7)], items: [omar, kios] });
  assert.equal(byId.get("kios").hp, 13);
  assert.deepEqual(byId.get("omar"), { hp: 23, tempHp: 0, bondDamage: 7, ward: false });
  assert.deepEqual(notes, ["Vincolo di interdizione: Omar subisce 7 danni con Kios."]);
});

test("U3a: il caster tra i bersagli somma il proprio danno e quello del vincolo, i suoi PF temporanei per primi", () => {
  const omar = creature("omar", "Omar", 30, 40, [], { tempHp: 4 });
  const kios = creature("kios", "Kios", 20, 40, [bondFrom("omar")]);
  const { byId } = previewReactionHp({ entries: [damage(omar, 5), damage(kios, 7)], items: [omar, kios] });
  // Omar: 5 on 4 temporary HP leaves 29 HP and 0 temporary; then 7 from the bond leaves 22.
  assert.equal(byId.get("omar").hp, 22);
  assert.equal(byId.get("omar").tempHp, 0);
  assert.equal(byId.get("omar").bondDamage, 7);
});

test("U3a: il vincolo che porta il caster a 0 PF passa anche dalla sua Interdizione alla morte", () => {
  const omar = creature("omar", "Omar", 5, 40, [deathWard]);
  const kios = creature("kios", "Kios", 20, 40, [bondFrom("omar")]);
  const { byId, notes } = previewReactionHp({ entries: [damage(kios, 9)], items: [omar, kios] });
  assert.equal(byId.get("omar").hp, 1);
  assert.equal(byId.get("omar").ward, true);
  assert.equal(notes.length, 3, "the shared damage, the bond ending at 0 HP and the ward");
});

test("U3a: senza reazioni l'anteprima resta quella del calcolo semplice, e una cura non tocca il vincolo", () => {
  const omar = creature("omar", "Omar", 30, 40);
  const kios = creature("kios", "Kios", 20, 40, [bondFrom("omar")]);
  const plain = previewReactionHp({ entries: [damage(omar, 5)], items: [omar] });
  assert.equal(plain.byId.get("omar").hp, 25);
  assert.deepEqual(plain.notes, []);
  const heal = { item: kios, change: calculateQuickHPChange({ mode: "heal", value: 5, hp: 20, hpMax: 40 }) };
  const healed = previewReactionHp({ entries: [heal], items: [omar, kios] });
  assert.equal(healed.byId.has("omar"), false);
  assert.deepEqual(healed.notes, []);
});

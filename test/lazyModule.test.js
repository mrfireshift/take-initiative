import test from "node:test";
import assert from "node:assert/strict";
import { lazyModule } from "../src/lazyModule.js";

test("un modulo caricato al clic si carica una volta sola, anche con due clic in volo", async () => {
  let loads = 0;
  const get = lazyModule(async () => { loads += 1; return { value: 42 }; });
  assert.equal(loads, 0, "nothing loads before the first call outside a browser page");
  const [first, second] = await Promise.all([get(), get()]);
  assert.equal(first.value, 42);
  assert.equal(first, second);
  assert.equal(loads, 1);
});

test("un caricamento fallito arriva al chiamante e il clic successivo riprova", async () => {
  let attempts = 0;
  const get = lazyModule(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("chunk non raggiungibile");
    return { ok: true };
  });
  await assert.rejects(get(), /chunk non raggiungibile/);
  assert.deepEqual(await get(), { ok: true });
  assert.equal(attempts, 2);
});

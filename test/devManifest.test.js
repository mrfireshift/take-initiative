// The local dev server serves «Take Initiative! (LOCALE)» with amber icons; the online manifest stays as it is.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createDevManifest, devManifestPlugin } from "../scripts/dev-manifest.mjs";

const manifest = JSON.parse(await readFile(new URL("../public/manifest.json", import.meta.url), "utf8"));

test("the online manifest: version 1.4.0 and the plugin icon", async () => {
  assert.equal(manifest.version, "1.4.0");
  assert.equal(manifest.icon, "/plugin-icon.svg");
  assert.equal(manifest.action.icon, "/icon.svg");
  for (const file of ["plugin-icon.svg", "plugin-icon-dev.svg", "icon-dev.svg"]) {
    assert.match(await readFile(new URL(`../public/${file}`, import.meta.url), "utf8"), /<svg/, file);
  }
  assert.match(await readFile(new URL("../public/plugin-icon-dev.svg", import.meta.url), "utf8"), /#fbbf24/);
});

test("the local manifest: another name and amber icons; version and description exactly the online ones", () => {
  const local = createDevManifest(manifest);
  assert.equal(local.name, "Take Initiative! (LOCALE)");
  assert.equal(local.version, manifest.version, "kept identical to the online manifest");
  assert.equal(local.description, manifest.description);
  assert.equal(local.icon, "/plugin-icon-dev.svg");
  assert.deepEqual([local.action.title, local.action.icon, local.action.popover], ["Take Initiative! (LOCALE)", "/icon-dev.svg", "/action-launcher.html"]);
  assert.equal(local.background_url, manifest.background_url);
  assert.equal(manifest.name, "Take Initiative!", "the source manifest is not changed");
});

test("the dev server answers /manifest.json, everything else goes on; the plugin never runs in a build", () => {
  const plugin = devManifestPlugin({ readManifest: () => manifest, env: {} });
  assert.equal(plugin.apply, "serve");
  let middleware;
  plugin.configureServer({ middlewares: { use: (handler) => { middleware = handler; } } });
  const headers = {};
  let body = "";
  middleware({ url: "/manifest.json?v=2" }, { setHeader: (key, value) => { headers[key] = value; }, end: (text) => { body = text; } }, () => assert.fail("handled"));
  assert.equal(JSON.parse(body).name, "Take Initiative! (LOCALE)");
  assert.equal(headers["Access-Control-Allow-Origin"], "https://www.owlbear.rodeo");
  assert.equal(headers["Cache-Control"], "no-store");
  let passed = false;
  middleware({ url: "/icon.svg" }, {}, () => { passed = true; });
  assert.equal(passed, true);
  // TAKE_INITIATIVE_PLAIN_MANIFEST=1: the public manifest is served as it is.
  let mounted = false;
  devManifestPlugin({ readManifest: () => manifest, env: { TAKE_INITIATIVE_PLAIN_MANIFEST: "1" } })
    .configureServer({ middlewares: { use: () => { mounted = true; } } });
  assert.equal(mounted, false);
});

// The manifest served by the local dev server (`npm run dev`): another name and amber icons, so the local build is
// told apart from the online one in OBR's extension list and toolbar. Version and description stay exactly those of
// public/manifest.json: OBR stopped accepting the local manifest when they changed too ("-dev", a longer text). The production
// build keeps public/manifest.json unchanged; TAKE_INITIATIVE_PLAIN_MANIFEST=1 serves it unchanged in dev too.
export const DEV_MANIFEST_SUFFIX = " (LOCALE)";

export function createDevManifest(manifest) {
  const base = manifest && typeof manifest === "object" ? manifest : {};
  return {
    ...base,
    name: `${base.name || "Take Initiative!"}${DEV_MANIFEST_SUFFIX}`,
    icon: "/plugin-icon-dev.svg",
    ...(base.action ? { action: { ...base.action, title: `${base.action.title || base.name || "Take Initiative!"}${DEV_MANIFEST_SUFFIX}`, icon: "/icon-dev.svg" } } : {}),
  };
}

// Vite plugin, dev server only: answers /manifest.json before the static public folder.
export function devManifestPlugin({ readManifest, allowedOrigin = "https://www.owlbear.rodeo", env = process.env } = {}) {
  return {
    name: "take-initiative-dev-manifest",
    apply: "serve",
    configureServer(server) {
      if (["1", "true", "yes"].includes(String(env.TAKE_INITIATIVE_PLAIN_MANIFEST || "").trim().toLowerCase())) return;
      server.middlewares.use((request, response, next) => {
        if (String(request.url || "").split("?")[0] !== "/manifest.json") return next();
        try {
          const manifest = createDevManifest(readManifest());
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.setHeader("Cache-Control", "no-store");
          response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
          response.end(`${JSON.stringify(manifest, null, 2)}\n`);
        } catch (error) {
          next(error);
        }
      });
    },
  };
}

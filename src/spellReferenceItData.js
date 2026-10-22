// The full Italian spell reference, behind a module of its own: spellbookCatalog.js imports it on demand (a JSON
// file cannot be imported dynamically both by Vite and by Node).
import reference from "./spell-reference-it.json" with { type: "json" };

export default reference;

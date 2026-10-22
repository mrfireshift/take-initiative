// The rules text of the class features, behind a module of its own: classFeatureDescriptions.js imports it on
// demand (a JSON file cannot be imported dynamically both by Vite and by Node).
import descriptions from "./class-features-descriptions.json" with { type: "json" };

export default descriptions;

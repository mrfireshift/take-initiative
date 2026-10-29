// A class resource's maximum as the card shows it (lot L18): the catalog's formula ("max(1, modificatore_carisma)")
// in words ("mod. Carisma (minimo 1)"). An expression it does not recognise keeps its own text.
const ABILITIES = Object.freeze({
  forza: "Forza",
  destrezza: "Destrezza",
  costituzione: "Costituzione",
  intelligenza: "Intelligenza",
  saggezza: "Saggezza",
  carisma: "Carisma",
});

function words(expression) {
  return expression
    .replace(/\bbonus_competenza\b/g, "bonus di competenza")
    .replace(/\bmodificatore_([a-z]+)\b/g, (match, ability) => ABILITIES[ability] ? `mod. ${ABILITIES[ability]}` : match)
    .replace(/\blivello_([a-z]+)\b/g, (match, className) => `livello di ${className}`)
    .replace(/\s*\*\s*/g, " × ");
}

export function readableResourceExpression(expression) {
  let text = words(String(expression || "").trim());
  // The innermost max() first, so a nested one reads too.
  for (let guard = 0; guard < 8 && /max\(([^()]*)\)/.test(text); guard += 1) {
    text = text.replace(/max\(([^()]*)\)/g, (match, inner) => {
      const parts = inner.split(",").map((part) => part.trim()).filter(Boolean);
      if (parts.length !== 2) return match;
      if (/^\d+$/.test(parts[0])) return `${parts[1]} (minimo ${parts[0]})`;
      return `il più alto tra ${parts[0]} e ${parts[1]}`;
    });
  }
  return text;
}

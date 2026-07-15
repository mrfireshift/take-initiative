import fs from "node:fs";

const API_BASE = "https://www.dnd5eapi.co";
const EXPECTED_SPELLS = 319;
const OUTPUT_PATH = "src/spells-srd-5.1.json";

const indexResponse = await fetch(`${API_BASE}/api/2014/spells`);
if (!indexResponse.ok) throw new Error(`Index HTTP ${indexResponse.status}`);

const index = await indexResponse.json();
const spells = [];

for (let offset = 0; offset < index.results.length; offset += 20) {
  const batch = index.results.slice(offset, offset + 20);
  const rows = await Promise.all(batch.map(async (entry) => {
    const response = await fetch(`${API_BASE}${entry.url}`);
    if (!response.ok) throw new Error(`${entry.index} HTTP ${response.status}`);
    return response.json();
  }));
  spells.push(...rows);
}

const compact = spells
  .map((spell) => ({
    id: spell.index,
    name: spell.name,
    level: Number(spell.level) || 0,
    duration: String(spell.duration || ""),
    concentration: !!spell.concentration,
    range: String(spell.range || ""),
    area: spell.area_of_effect
      ? { type: spell.area_of_effect.type, size: spell.area_of_effect.size }
      : null,
  }))
  .sort((a, b) => a.name.localeCompare(b.name, "en"));

if (compact.length !== EXPECTED_SPELLS) {
  throw new Error(`Expected ${EXPECTED_SPELLS} spells, received ${compact.length}`);
}

const payload = {
  schemaVersion: 1,
  ruleset: "D&D 5e SRD 5.1 (2014)",
  source: `${API_BASE}/api/2014/spells`,
  upstream: "https://github.com/5e-bits/5e-database",
  license: "CC-BY-4.0",
  generatedAt: new Date().toISOString().slice(0, 10),
  spells: compact,
};

fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Wrote ${compact.length} SRD 5.1 spells to ${OUTPUT_PATH}`);

// The online archive of 5eTools' bestiaries (attacchi dei mostri, fase 3, lotto 1): the addresses of its index and its
// files from the base the GM configured, the books it lists with their names, and the checks on what is downloaded.
// Pure: no network, no storage. The plugin ships no address of an archive (decision D1): the GM writes it once.
// The books of the 2024 rules are marked: they stay off unless the 2024 stat blocks are turned on (lotto 6).
export const FIVE_TOOLS_ARCHIVE_INDEX = "bestiary/index.json";
export const FIVE_TOOLS_ARCHIVE_RECORD_VERSION = 1;

// The books of the index with a name: [code, title, year], and those of the 2024 rules (the 2024 core books and what was
// published for them from September 2024). An unknown code is shown with its code.
const BOOKS = [
  ["AATM", "Adventure Atlas: The Mortuary", 2023], ["ABH", "Astarion's Book of Hungers", 2025], ["AI", "Acquisitions Incorporated", 2019],
  ["AitFR-DN", "Adventures in the Forgotten Realms: Deepest Night", 2021], ["AitFR-FCD", "Adventures in the Forgotten Realms: From Cyan Depths", 2021],
  ["AitFR-ISF", "Adventures in the Forgotten Realms: In Scarlet Flames", 2021], ["AitFR-THP", "Adventures in the Forgotten Realms: The Hidden Page", 2021],
  ["AU", "Arcana Unleashed", 2026], ["AUD", "Arcana Unleashed: Deadfall", 2026], ["AWM", "Adventure with Muk", 2019], ["BAM", "Boo's Astral Menagerie", 2022],
  ["BGDIA", "Baldur's Gate: Descent Into Avernus", 2019], ["BGG", "Bigby Presents: Glory of the Giants", 2023], ["BMT", "The Book of Many Things", 2023],
  ["CM", "Candlekeep Mysteries", 2021], ["CoA", "Chains of Asmodeus", 2023], ["CoS", "Curse of Strahd", 2016], ["CRCotN", "Critical Role: Call of the Netherdeep", 2022],
  ["DC", "Essentials Kit: Divine Contention", 2019], ["DIP", "Essentials Kit: Dragon of Icespire Peak", 2019], ["DitLCoT", "Descent into the Lost Caverns of Tsojcanth", 2024],
  ["DMG", "Dungeon Master's Guide (2014)", 2014], ["DoD", "Domains of Delight", 2021], ["DoSI", "Dragons of Stormwreck Isle", 2022],
  ["DrDe-BD", "Dragon Delves: Baker's Doesn't", 2025], ["DSotDQ", "Dragonlance: Shadow of the Dragon Queen", 2022], ["EFA", "Eberron: Forge of the Artificer", 2025],
  ["EGW", "Explorer's Guide to Wildemount", 2020], ["ERLW", "Eberron: Rising from the Last War", 2019], ["FRAiF", "Forgotten Realms: Adventures in Faerûn", 2025],
  ["FTD", "Fizban's Treasury of Dragons", 2021], ["GGR", "Guildmasters' Guide to Ravnica", 2018], ["GoS", "Ghosts of Saltmarsh", 2019],
  ["GotSF", "Giants of the Star Forge", 2023], ["HAT-TG", "Thieves' Gallery", 2023], ["HftT", "Hunt for the Thessalhydra", 2019], ["HoL", "Ravenloft: The House of Lament", 2021],
  ["HotB", "Heroes of the Borderlands", 2025], ["HotDQ", "Hoard of the Dragon Queen", 2014], ["IDRotF", "Icewind Dale: Rime of the Frostmaiden", 2020],
  ["IMR", "Infernal Machine Rebuild", 2019], ["JttRC", "Journeys through the Radiant Citadel", 2022], ["KftGV", "Keys from the Golden Vault", 2023],
  ["KKW", "Krenko's Way", 2018], ["LFL", "Lorwyn: First Light", 2025], ["LLK", "Lost Laboratory of Kwalish", 2018], ["LMoP", "Lost Mine of Phandelver", 2014],
  ["LoX", "Light of Xaryxis", 2022], ["LR", "Locathah Rising", 2019], ["LRDT", "Red Dragon's Tale: A LEGO Adventure", 2024], ["MaBJoV", "Minsc and Boo's Journal of Villainy", 2021],
  ["MCV1SC", "Monstrous Compendium Volume 1: Spelljammer Creatures", 2022], ["MCV4EC", "Monstrous Compendium Volume 4: Eldraine Creatures", 2023],
  ["MGELFT", "Muk's Guide to Everything He Learned From Tasha", 2020], ["MM", "Monster Manual (2014)", 2014], ["MOT", "Mythic Odysseys of Theros", 2020],
  ["MPMM", "Mordenkainen Presents: Monsters of the Multiverse", 2022], ["MPP", "Morte's Planar Parade", 2023], ["MTF", "Mordenkainen's Tome of Foes", 2018],
  ["NF", "Netheril's Fall", 2025], ["NRH-ASS", "NERDS Restoring Harmony: A Sticky Situation", 2021], ["NRH-AT", "NERDS Restoring Harmony: Adventure Together", 2021],
  ["NRH-AVitW", "NERDS Restoring Harmony: A Voice in the Wilderness", 2021], ["NRH-AWoL", "NERDS Restoring Harmony: A Web of Lies", 2021],
  ["NRH-CoI", "NERDS Restoring Harmony: Circus of Illusion", 2021], ["NRH-TCMC", "NERDS Restoring Harmony: The Candy Mountain Caper", 2021],
  ["NRH-TLT", "NERDS Restoring Harmony: The Lost Tomb", 2021], ["OotA", "Out of the Abyss", 2015], ["OoW", "The Orrery of the Wanderer", 2019],
  ["PaBTSO", "Phandelver and Below: The Shattered Obelisk", 2023], ["PHB", "Player's Handbook (2014)", 2014], ["PL", "Project Lamordia", 2026],
  ["PotA", "Princes of the Apocalypse", 2015], ["QftIS", "Quests from the Infinite Staircase", 2024], ["RHW", "Ravenloft: The Horrors Within", 2026],
  ["RMBRE", "The Lost Dungeon of Rickedness: Big Rick Energy", 2019], ["RoT", "Rise of Tiamat", 2014], ["RtG", "Return to the Glory", 2021],
  ["RWG", "Red Wizards' Gambit", 2026], ["SCC", "Strixhaven: A Curriculum of Chaos", 2021], ["SDW", "Essentials Kit: Sleeping Dragon's Wake", 2019],
  ["SKT", "Storm King's Thunder", 2016], ["SLW", "Essentials Kit: Storm Lord's Wrath", 2019], ["TCE", "Tasha's Cauldron of Everything", 2020],
  ["TftYP", "Tales from the Yawning Portal", 2017], ["ToA", "Tomb of Annihilation", 2017], ["ToFW", "Turn of Fortune's Wheel", 2023], ["TTP", "The Tortle Package", 2017],
  ["VEoR", "Vecna: Eve of Ruin", 2024], ["VGM", "Volo's Guide to Monsters", 2016], ["VRGR", "Van Richten's Guide to Ravenloft", 2021],
  ["WBtW", "The Wild Beyond the Witchlight", 2021], ["WDH", "Waterdeep: Dragon Heist", 2018], ["WDMM", "Waterdeep: Dungeon of the Mad Mage", 2018],
  ["WttHC", "Stranger Things: Welcome to the Hellfire Club", 2025], ["XDMG", "Dungeon Master's Guide (2024)", 2024], ["XGE", "Xanathar's Guide to Everything", 2017],
  ["XMM", "Monster Manual (2025)", 2025], ["XPHB", "Player's Handbook (2024)", 2024],
];
const RULES_2024 = new Set(["XPHB", "XDMG", "XMM", "ABH", "AU", "AUD", "DrDe-BD", "EFA", "FRAiF", "HotB", "LFL", "NF", "PL", "RHW", "RWG", "WttHC"]);
const BOOK_BY_CODE = new Map(BOOKS.map(([code, name, year]) => [code.toLowerCase(), { code, name, year }]));
const FILE_PATTERN = /^bestiary-[a-z0-9-]+\.json$/;

export function fiveToolsBook(code) {
  const known = BOOK_BY_CODE.get(String(code || "").toLowerCase());
  const resolved = known?.code || String(code || "");
  return { code: resolved, name: known?.name || resolved, year: known?.year || null, rules2024: RULES_2024.has(resolved) };
}

export function fiveToolsBookLabel(book) {
  const info = book?.name ? book : fiveToolsBook(book?.code ?? book);
  return `${info.name}${info.name !== info.code ? ` (${info.code})` : ""}${info.rules2024 ? " · regole 2024" : ""}`;
}

// The base the GM wrote, as the folder of the data: "…/data/" from "…/data", "…/data/" or "…/data/bestiary/index.json".
// https only (http just for a local server), never credentials in the address; "" when it is not one.
export function normalizeFiveToolsArchiveBase(value) {
  let url;
  try { url = new URL(String(value || "").trim()); } catch { return ""; }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!(url.protocol === "https:" || (url.protocol === "http:" && local)) || url.username || url.password) return "";
  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(/\/bestiary\/(?:index\.json|bestiary-[a-z0-9-]+\.json)?$/i, "/").replace(/\/?$/, "/");
  return url.href;
}

export function fiveToolsArchiveIndexUrl(base) {
  const normalized = normalizeFiveToolsArchiveBase(base);
  return normalized ? new URL(FIVE_TOOLS_ARCHIVE_INDEX, normalized).href : "";
}

export function fiveToolsArchiveBookUrl(base, file) {
  const normalized = normalizeFiveToolsArchiveBase(base);
  return normalized && FILE_PATTERN.test(String(file || "")) ? new URL(`bestiary/${file}`, normalized).href : "";
}

/**
 * The archive's index ({ "MM": "bestiary-mm.json", … }) as books: { code, file, name, year, rules2024 }, sorted by
 * name; an entry that is not a book code with a bestiary file is left out. allow2024: the 2024 books stay listed but
 * marked `disabled` unless the 2024 stat blocks are on.
 */
export function parseFiveToolsArchiveIndex(value, { allow2024 = false } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value)
    .filter(([code, file]) => /^[A-Za-z0-9-]{1,24}$/.test(code) && FILE_PATTERN.test(String(file)))
    .map(([code, file]) => {
      const book = fiveToolsBook(code);
      return { ...book, code, file, disabled: book.rules2024 && !allow2024 };
    })
    .sort((left, right) => left.name.localeCompare(right.name, "en"));
}

// A downloaded file is the book asked for: a bestiary with monsters, at least one of them of that book.
export function validateFiveToolsArchiveBook(value, code) {
  const monsters = Array.isArray(value?.monster) ? value.monster.filter((monster) => monster && typeof monster.name === "string") : null;
  if (!monsters) return { ok: false, monsters: 0, error: "Il file scaricato non è un bestiario di 5eTools." };
  if (!monsters.some((monster) => String(monster.source || "").toLowerCase() === String(code || "").toLowerCase())) {
    return { ok: false, monsters: monsters.length, error: `Il file scaricato non contiene mostri di ${code}.` };
  }
  return { ok: true, monsters: monsters.length, error: "" };
}

// What the cache keeps of a book: the file as downloaded and what the panel shows (date, size, monsters).
export function fiveToolsArchiveRecord({ code, file, url, text, data, fetchedAt = Date.now() } = {}) {
  const check = validateFiveToolsArchiveBook(data, code);
  if (!check.ok) throw new Error(check.error);
  const bytes = typeof text === "string" ? (typeof TextEncoder === "function" ? new TextEncoder().encode(text).length : text.length) : 0;
  return { version: FIVE_TOOLS_ARCHIVE_RECORD_VERSION, code: fiveToolsBook(code).code, file, url, fetchedAt, bytes, monsters: check.monsters, data };
}

// The book that holds a monster's source (the base of a derived monster, decision D2): its index entry, or null.
export function fiveToolsArchiveBookForSource(books = [], source = "") {
  return books.find((book) => book.code.toLowerCase() === String(source || "").toLowerCase()) || null;
}

// "1,5 MB", "160 KB" for the panel.
export function fiveToolsArchiveSizeLabel(bytes) {
  const value = Number(bytes) || 0;
  return value >= 1024 * 1024 ? `${String(Math.round(value / 1024 / 1024 * 10) / 10).replace(".", ",")} MB` : `${Math.max(1, Math.round(value / 1024))} KB`;
}

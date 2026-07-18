export const CLOCK_SEGMENT_OPTIONS = Object.freeze([4, 6, 8, 12]);
export const CLOCK_COLOR_OPTIONS = Object.freeze([
  "#ef4444",
  "#f59e0b",
  "#22c55e",
  "#38bdf8",
  "#8b5cf6",
  "#ec4899",
]);

function finiteInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

export function normalizeClock(clock, index = 0) {
  const requestedSegments = finiteInteger(clock?.segments, 6);
  const segments = CLOCK_SEGMENT_OPTIONS.includes(requestedSegments) ? requestedSegments : 6;
  const value = Math.max(0, Math.min(segments, finiteInteger(clock?.value, 0)));
  const color = CLOCK_COLOR_OPTIONS.includes(clock?.color) ? clock.color : CLOCK_COLOR_OPTIONS[0];
  const fallbackId = `clock-${index + 1}`;
  return {
    id: String(clock?.id || fallbackId),
    name: String(clock?.name || "Nuovo clock").trim().slice(0, 60) || "Nuovo clock",
    segments,
    value,
    color,
    visible: clock?.visible !== false,
    createdAt: finiteInteger(clock?.createdAt, 0),
    updatedAt: finiteInteger(clock?.updatedAt, 0),
  };
}

export function normalizeClocksState(raw) {
  const source = Array.isArray(raw?.clocks) ? raw.clocks : [];
  const seen = new Set();
  const clocks = [];
  source.forEach((entry, index) => {
    const clock = normalizeClock(entry, index);
    if (!clock.id || seen.has(clock.id)) return;
    seen.add(clock.id);
    clocks.push(clock);
  });
  return { version: 1, clocks };
}

export function moveClock(clocks, id, direction) {
  const next = clocks.slice();
  const from = next.findIndex((clock) => clock.id === id);
  if (from < 0) return next;
  const to = Math.max(0, Math.min(next.length - 1, from + direction));
  if (to === from) return next;
  const [clock] = next.splice(from, 1);
  next.splice(to, 0, clock);
  return next;
}

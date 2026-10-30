// Plays the dice's impact sounds with Web Audio (docs/PIANO_DADI_ONLINE.md, lot D-5). The sounds come from Owlbear
// Rodeo Dice (public/dice/sounds, GPLv3) and load the first time a die of that weight hits that surface. The
// browser keeps the audio silent until the page has been clicked: a window that opened by itself may stay quiet.
import assets from "./diceAssets.json";

function assetUrl(base, file) {
  return `${String(base || "/").replace(/\/?$/, "/")}${file}`;
}

export function createDiceSound({ base = "/" } = {}) {
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  let context = null;
  const buffers = new Map();
  const next = new Map();

  const ensureContext = () => {
    if (!context && AudioContextClass) {
      try { context = new AudioContextClass(); } catch { context = null; }
    }
    return context;
  };

  function load(weight, surface) {
    const key = `${weight}/${surface}`;
    if (!buffers.has(key)) {
      const files = assets.sounds?.[weight]?.[surface] || [];
      const audio = ensureContext();
      buffers.set(key, audio
        ? Promise.all(files.map((file) => fetch(assetUrl(base, file))
          .then((response) => response.arrayBuffer())
          .then((data) => audio.decodeAudioData(data))
          .catch(() => null))).then((list) => list.filter(Boolean))
        : Promise.resolve([]));
    }
    return buffers.get(key);
  }

  // The sounds a throw will need, before it starts: the first impacts come within a few frames.
  function prepare(groups) {
    return Promise.all(groups.map(({ weight, surface }) => load(weight, surface)));
  }

  // A click on the page lets the browser play the audio.
  function unlock() {
    const audio = ensureContext();
    if (audio?.state === "suspended") void audio.resume().catch(() => {});
  }

  async function play({ weight, surface, volume = 1, pan = 0 }) {
    const audio = ensureContext();
    if (!audio || audio.state !== "running") return;
    const list = await load(weight, surface);
    if (!list.length) return;
    // In turn, as the Dice's getNextBuffer: two impacts in a row never sound the same.
    const key = `${weight}/${surface}`;
    const index = next.get(key) || 0;
    next.set(key, (index + 1) % list.length);
    const source = audio.createBufferSource();
    source.buffer = list[index % list.length];
    const gain = audio.createGain();
    gain.gain.value = Math.max(0, Math.min(1, volume));
    let tail = gain;
    if (typeof audio.createStereoPanner === "function") {
      const panner = audio.createStereoPanner();
      panner.pan.value = pan;
      gain.connect(panner);
      tail = panner;
    }
    tail.connect(audio.destination);
    source.connect(gain);
    source.start();
  }

  function dispose() {
    void context?.close?.().catch(() => {});
    context = null;
    buffers.clear();
  }

  return { prepare, unlock, play, dispose };
}

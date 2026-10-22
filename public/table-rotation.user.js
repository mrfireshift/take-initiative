// ==UserScript==
// @name         Take Initiative! — schermo del tavolo
// @namespace    com.thebigpicture.initiative
// @version      1.0.0
// @description  Ruota l'intera pagina di Owlbear Rodeo verso il giocatore di turno, per uno schermo steso sul tavolo.
// @match        https://www.owlbear.rodeo/*
// @match        https://owlbear.rodeo/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

// Pensato per la finestra dei giocatori sullo schermo del tavolo (client di sola visione): con la pagina ruotata,
// clic e trascinamenti su quella finestra non corrispondono più a ciò che si vede.
// Il background di Take Initiative! risponde all'«hello» di questo script con il lato del giocatore di turno
// (tracker del GM: menu contestuale della card → «Lato del tavolo»), e risponde solo ai client PLAYER: la finestra del GM nello
// stesso browser non ruota mai. Per una finestra in incognito, abilita Tampermonkey in incognito.
(function takeInitiativeTableRotation() {
  "use strict";

  const CONFIG = {
    // Gradi quando il turno non ha un lato (mostri, voci virtuali, nessun combattimento): 0, 90, 180 o 270.
    defaultDegrees: 0,
    // 90/270 (giocatori sui lati corti) scambiano larghezza e altezza della pagina: sperimentale.
    allowQuarterTurns: true,
    animationMs: 700,
    // Origini ammesse per il plugin (es. "https://tuo-host.example"); vuoto = l'iframe che risponde al protocollo.
    pluginOrigins: [],
    // Alt+Shift+R sospende o riprende la rotazione su questo schermo.
    pauseShortcut: { altKey: true, shiftKey: true, code: "KeyR" },
  };

  const NS = "com.thebigpicture.initiative/table-orientation";
  const STYLE_ID = "take-initiative-table-rotation";
  const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  const descriptorOf = (name) => Object.getOwnPropertyDescriptor(window, name)
    || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window), name)
    || null;
  const ownInner = {
    innerWidth: Object.getOwnPropertyDescriptor(window, "innerWidth") || null,
    innerHeight: Object.getOwnPropertyDescriptor(window, "innerHeight") || null,
  };
  const readInner = {
    innerWidth: descriptorOf("innerWidth")?.get?.bind(window) || (() => document.documentElement.clientWidth),
    innerHeight: descriptorOf("innerHeight")?.get?.bind(window) || (() => document.documentElement.clientHeight),
  };

  let trustedSource = null;
  let requestedDegrees = CONFIG.defaultDegrees;
  let appliedDegrees = 0;
  let paused = false;
  let fadeTimer = null;

  function normalizeDegrees(value) {
    const degrees = ((Math.round(Number(value) / 90) * 90) % 360 + 360) % 360;
    if (!Number.isFinite(degrees)) return 0;
    if (!CONFIG.allowQuarterTurns && degrees % 180 !== 0) return 0;
    return degrees;
  }

  function isQuarter(degrees) {
    return degrees === 90 || degrees === 270;
  }

  function styleElement() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }
    return style;
  }

  // With a quarter turn the page lays out in a portrait box: JS that reads innerWidth/innerHeight (canvas size,
  // popover placement) must see the swapped sizes too.
  function setSwappedViewport(swapped) {
    for (const [name, other] of [["innerWidth", "innerHeight"], ["innerHeight", "innerWidth"]]) {
      try {
        if (swapped) Object.defineProperty(window, name, { configurable: true, get: readInner[other] });
        else if (ownInner[name]) Object.defineProperty(window, name, ownInner[name]);
        else delete window[name];
      } catch (error) {
        console.warn("[Take Initiative!] viewport:", error?.message || error);
      }
    }
  }

  function css(degrees, animate) {
    const quarter = isQuarter(degrees);
    const width = quarter ? "100vh" : "100vw";
    const height = quarter ? "100vw" : "100vh";
    const transition = animate && !reducedMotion
      ? `transition: transform ${CONFIG.animationMs}ms cubic-bezier(.4,0,.2,1), opacity 160ms ease;`
      : "transition: opacity 160ms ease;";
    return `
      html { overflow: hidden !important; background: #000; }
      body {
        position: fixed !important;
        width: ${width} !important;
        height: ${height} !important;
        left: calc(50vw - ${width} / 2) !important;
        top: calc(50vh - ${height} / 2) !important;
        margin: 0 !important;
        transform-origin: 50% 50% !important;
        transform: rotate(${degrees}deg) !important;
        ${transition}
      }
    `;
  }

  function render(degrees) {
    const target = paused ? 0 : normalizeDegrees(degrees);
    // Nothing is injected until the first turn away from 0: Owlbear stays untouched otherwise.
    if (target === appliedDegrees) return;
    const sameShape = isQuarter(target) === isQuarter(appliedDegrees);
    const firstTime = !document.getElementById(STYLE_ID);
    const style = styleElement();
    if (firstTime) {
      // Start from the current turn so that the first rotation animates too.
      style.textContent = css(appliedDegrees, true);
      void document.body.offsetWidth;
    }
    clearTimeout(fadeTimer);
    if (sameShape) {
      // 0 <-> 180 or 90 <-> 270: one animated turn, the layout does not change.
      style.textContent = css(target, true);
      appliedDegrees = target;
      return;
    }
    // The page changes shape: fade out, swap, let Owlbear re-layout, fade in.
    document.body.style.opacity = "0";
    fadeTimer = setTimeout(() => {
      style.textContent = css(target, false);
      setSwappedViewport(isQuarter(target));
      appliedDegrees = target;
      window.dispatchEvent(new Event("resize"));
      fadeTimer = setTimeout(() => { document.body.style.opacity = ""; }, 220);
    }, 170);
  }

  function fromOwnIframe(source) {
    if (!source) return false;
    for (const frame of document.querySelectorAll("iframe")) {
      if (frame.contentWindow === source) return true;
    }
    return false;
  }

  function onMessage(event) {
    const data = event.data;
    if (!data || typeof data !== "object" || data.ns !== NS || data.type !== "orientation") return;
    if (CONFIG.pluginOrigins.length && !CONFIG.pluginOrigins.includes(event.origin)) return;
    if (!fromOwnIframe(event.source)) return;
    if (data.nonce === nonce) trustedSource = event.source;
    else if (data.nonce || event.source !== trustedSource) return;
    requestedDegrees = Number.isFinite(data.degrees) ? data.degrees : CONFIG.defaultDegrees;
    render(requestedDegrees);
  }

  function hello() {
    const message = { ns: NS, type: "hello", v: 1, nonce };
    for (const frame of document.querySelectorAll("iframe")) {
      try { frame.contentWindow?.postMessage(message, "*"); } catch {}
    }
  }

  function onKeyDown(event) {
    const shortcut = CONFIG.pauseShortcut;
    if (!shortcut || event.code !== shortcut.code) return;
    if (!!event.altKey !== !!shortcut.altKey || !!event.shiftKey !== !!shortcut.shiftKey) return;
    paused = !paused;
    console.info(`[Take Initiative!] rotazione del tavolo ${paused ? "sospesa" : "attiva"}`);
    render(requestedDegrees);
  }

  window.addEventListener("message", onMessage);
  window.addEventListener("keydown", onKeyDown, true);
  render(CONFIG.defaultDegrees);
  // The plugin's background iframe may appear (or reload) at any time: say hello often at first, then slowly.
  let helloCount = 0;
  const fastHello = setInterval(() => {
    hello();
    if (++helloCount >= 15) clearInterval(fastHello);
  }, 1000);
  setInterval(hello, 5000);
})();

function bossDocument(documentRef) {
  if (!documentRef?.createElement) {
    throw new TypeError("A document with createElement is required");
  }
  return documentRef;
}

export function buildLegendaryResourcePips(
  resource,
  onSet,
  {
    isGM = false,
    attitude = "enemy",
    kind = "action",
    config = {},
    documentRef = globalThis.document,
  } = {},
) {
  const document = bossDocument(documentRef);
  const wrap = document.createElement("div");
  Object.assign(wrap.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: `${Number(config.gap) || 0}px`,
    flexDirection: "row",
  });

  const max = Math.max(0, Number(resource?.max) || 0);
  const current = Math.max(0, Math.min(max, Number(resource?.current) || 0));
  const isResistance = kind === "resistance";
  const activeStyle = (() => {
    if (isResistance) {
      return {
        background: "#3b82f6",
        glow: "drop-shadow(0 0 4px rgba(96,165,250,.88))",
      };
    }
    if (attitude === "enemy") {
      return {
        background: "#ff0000",
        glow: "0 0 8px rgba(255, 61, 61, 0.7)",
      };
    }
    if (attitude === "neutral") {
      return {
        background: "#a16207",
        glow: "0 0 7px rgba(161,98,7,.60)",
      };
    }
    return {
      background: "#7f1d1d",
      glow: "0 0 6px rgba(127,29,29,.55)",
    };
  })();

  for (let index = 1; index <= max; index += 1) {
    const pip = document.createElement("button");
    pip.type = "button";
    const baseSize = Number(config.size) || 0;
    const size = isResistance ? baseSize + 1 : baseSize;
    const baseTransform = isResistance ? "none" : "rotate(45deg)";
    Object.assign(pip.style, {
      width: `${size}px`,
      minWidth: `${size}px`,
      height: `${size}px`,
      minHeight: `${size}px`,
      padding: "0",
      transform: baseTransform,
      clipPath: isResistance
        ? "polygon(50% 0, 94% 18%, 82% 72%, 50% 100%, 18% 72%, 6% 18%)"
        : "none",
      borderRadius: isResistance ? "0" : "1px",
      border: isResistance ? "none" : "1px solid rgba(255,255,255,.28)",
      background: isResistance ? "rgba(15,23,42,.92)" : "rgba(0,0,0,.58)",
      boxShadow: isResistance ? "none" : "inset 0 0 0 1px rgba(0,0,0,.5)",
      filter: isResistance
        ? "drop-shadow(0 0 1px rgba(147,197,253,.85))"
        : "none",
      opacity: "1",
      cursor: isGM ? "pointer" : "default",
      transition: "transform .12s ease, opacity .12s ease, box-shadow .12s ease, filter .12s ease, background-color .12s ease",
    });
    if (index <= current) {
      pip.style.background = activeStyle.background;
      if (isResistance) pip.style.filter = activeStyle.glow;
      else {
        pip.style.boxShadow =
          `${activeStyle.glow}, inset 0 0 1px rgba(0,0,0,.6)`;
      }
    }
    const label = isResistance
      ? "Resistenza leggendaria"
      : "Azione leggendaria";
    pip.title = `${label}: ${current}/${max}`;
    pip.setAttribute("aria-label", `${label} ${index} di ${max}`);
    pip.setAttribute("aria-pressed", index <= current ? "true" : "false");
    pip.addEventListener("mouseenter", () => {
      const rotation = baseTransform === "none" ? "" : `${baseTransform} `;
      pip.style.transform = `${rotation}scale(1.12)`;
      pip.style.opacity = "1";
    });
    pip.addEventListener("mouseleave", () => {
      pip.style.transform = baseTransform;
      pip.style.opacity = ".9";
    });
    pip.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!isGM) return;
      onSet(index <= current ? index - 1 : index);
    });
    wrap.appendChild(pip);
  }

  return wrap;
}

export function buildClassicBossChrome({
  isBoss,
  hasLegendary,
  groupCollapsed,
  isGM,
  playerBossVerticalOffset,
  avatarSize,
  avatarLeft,
  mainCardHeight,
  contentLeft,
  badgeRight,
  badgeSize,
  portraitFrameSrc,
  portraitFrameScale,
  documentRef = globalThis.document,
}) {
  const document = bossDocument(documentRef);
  const bossHPRowTop = hasLegendary ? 49 : 43;
  const bossHPBarBottom = hasLegendary ? 8 : 14;
  let portraitFrame = null;
  if (isBoss) {
    const frameSize = Math.round(avatarSize * portraitFrameScale);
    const frameOutset = Math.round((frameSize - avatarSize) / 2);
    portraitFrame = document.createElement("img");
    portraitFrame.src = portraitFrameSrc;
    portraitFrame.alt = "";
    portraitFrame.setAttribute("aria-hidden", "true");
    portraitFrame.draggable = false;
    Object.assign(portraitFrame.style, {
      position: "absolute",
      left: `${avatarLeft - frameOutset}px`,
      top: "50%",
      width: `${frameSize}px`,
      height: `${frameSize}px`,
      objectFit: "contain",
      transform: "translateY(-50%)",
      pointerEvents: "none",
      filter: "drop-shadow(0 2px 5px rgba(0,0,0,.78))",
      zIndex: "7",
    });
  }

  const createRow = (top) => {
    if (!isBoss || groupCollapsed) return null;
    const row = document.createElement("div");
    Object.assign(row.style, {
      position: "absolute",
      top,
      left: `${contentLeft}px`,
      right: `${badgeRight + badgeSize + 10}px`,
      height: "20px",
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-start",
      gap: "3px",
      minWidth: "0",
      zIndex: "5",
    });
    return row;
  };

  const topRow = createRow(hasLegendary
    ? `${8 + playerBossVerticalOffset}px`
    : `${isGM
      ? 21
      : Math.round((mainCardHeight - 20) / 2) - 7 +
        playerBossVerticalOffset}px`);
  if (topRow) topRow.style.overflow = "hidden";
  const hpRow = createRow(`${bossHPRowTop}px`);

  return {
    portraitFrame,
    topRow,
    hpRow,
    bossHPRowTop,
    bossHPBarBottom,
  };
}

function bossControlRight(config, badgeRight, badgeSize) {
  if (Number.isFinite(config?.right)) return Number(config.right);
  return badgeRight + badgeSize + Number(config?.rightFromBadge || 0);
}

function buildBossTag(config, document) {
  const tag = document.createElement("span");
  tag.textContent = config?.label || "";
  const letterSpacing = Number.isFinite(config?.letterSpacing)
    ? `${config.letterSpacing}px`
    : "0.5px";
  Object.assign(tag.style, {
    fontSize: `${config?.fontSize ?? 11}px`,
    fontWeight: String(config?.fontWeight ?? 700),
    padding: `${config?.padY ?? 2}px ${config?.padX ?? 6}px`,
    borderRadius: `${config?.radius ?? 999}px`,
    background: config?.bg || "rgba(147,112,219,.35)",
    color: config?.color || "#fff",
    border: config?.border || "1px solid rgba(255,255,255,.18)",
    letterSpacing,
    whiteSpace: "nowrap",
    userSelect: "none",
    pointerEvents: "none",
  });
  return tag;
}

export function appendClassicEpicTags(
  header,
  entry,
  {
    isEpic,
    config,
    badgeRight,
    badgeSize,
    documentRef = globalThis.document,
  },
) {
  if (entry?.__groupCollapsed) return [];
  const document = bossDocument(documentRef);
  const docks = [];
  const appendTag = (position, tagConfig) => {
    const dock = document.createElement("div");
    Object.assign(dock.style, {
      position: "absolute",
      top: `${position.top}px`,
      right: `${bossControlRight(position, badgeRight, badgeSize)}px`,
      display: "flex",
      alignItems: "center",
      gap: `${position.gap || 6}px`,
      zIndex: "5",
      pointerEvents: "none",
    });
    dock.appendChild(buildBossTag(tagConfig, document));
    header.appendChild(dock);
    docks.push(dock);
  };

  if (isEpic) appendTag(config.posBoss, config.epic);
  if (entry?.isEpicAction) appendTag(config.posAction, config.action);
  return docks;
}

export function buildClassicLegendaryResourceDock(
  entry,
  {
    isGM,
    playerBossVerticalOffset,
    contentLeft,
    badgeRight,
    badgeSize,
    resourceConfig,
    pipsConfig,
    defaultResistances,
    onActionCurrent,
    onActionMax,
    onResistanceCurrent,
    onResistanceMax,
    documentRef = globalThis.document,
  },
) {
  if (entry?.__groupCollapsed || !(Number(entry?.legendary?.max) > 0)) {
    return null;
  }
  const document = bossDocument(documentRef);
  const resourceDock = document.createElement("div");
  Object.assign(resourceDock.style, {
    position: "absolute",
    top: `${(isGM ? 29 : resourceConfig.top) +
      playerBossVerticalOffset}px`,
    left: `${contentLeft}px`,
    right: `${badgeRight + badgeSize + 8}px`,
    minHeight: "18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: `${resourceConfig.clusterGap}px`,
    overflow: "hidden",
    zIndex: "5",
    pointerEvents: "auto",
  });

  const makeResourceLabel = (text, title) => {
    const label = document.createElement("span");
    label.textContent = text;
    label.title = title;
    Object.assign(label.style, {
      flex: "0 0 auto",
      color: "rgba(255,255,255,.74)",
      fontSize: "7px",
      fontWeight: "700",
      lineHeight: "1",
      letterSpacing: ".04em",
    });
    return label;
  };
  const makeCluster = () => {
    const cluster = document.createElement("div");
    Object.assign(cluster.style, {
      display: "flex",
      alignItems: "center",
      gap: "3px",
      minWidth: "0",
      flex: "0 0 auto",
    });
    return cluster;
  };
  const makeMaxControls = (resourceName, currentMax, onChange) => {
    const controls = document.createElement("div");
    Object.assign(controls.style, {
      display: "grid",
      gridTemplateRows:
        `repeat(2, ${resourceConfig.controlHeight}px)`,
      alignItems: "center",
      gap: "0",
      width: `${resourceConfig.controlWidth}px`,
      height: `${resourceConfig.controlHeight * 2}px`,
      flex: "0 0 auto",
    });
    const makeButton = (text, delta) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = text;
      button.title = delta < 0
        ? `Riduci ${resourceName} massime`
        : `Aumenta ${resourceName} massime`;
      Object.assign(button.style, {
        width: `${resourceConfig.controlWidth}px`,
        minWidth: `${resourceConfig.controlWidth}px`,
        height: `${resourceConfig.controlHeight}px`,
        minHeight: `${resourceConfig.controlHeight}px`,
        padding: "0",
        borderRadius: delta < 0
          ? "4px 4px 1px 1px"
          : "1px 1px 4px 4px",
        border: "1px solid rgba(255,255,255,.18)",
        background: "rgba(0,0,0,.68)",
        color: "#fff",
        fontSize: "9px",
        fontWeight: "700",
        lineHeight: "1",
        cursor: "pointer",
      });
      button.addEventListener("click", async (event) => {
        event.stopPropagation();
        const nextMax = Math.max(
          1,
          Math.min(5, Number(currentMax) + delta),
        );
        try { await onChange(nextMax); } catch {}
      });
      return button;
    };
    controls.append(makeButton("+", 1), makeButton("−", -1));
    return controls;
  };

  const actionCluster = makeCluster();
  actionCluster.append(
    makeResourceLabel("A", "Azioni leggendarie"),
    buildLegendaryResourcePips(entry.legendary, onActionCurrent, {
      isGM,
      attitude: entry.attitude || "enemy",
      kind: "action",
      config: pipsConfig,
      documentRef,
    }),
  );
  if (isGM) {
    actionCluster.appendChild(makeMaxControls(
      "azioni leggendarie",
      entry.legendary.max,
      onActionMax,
    ));
  }

  const divider = document.createElement("span");
  Object.assign(divider.style, {
    width: "1px",
    height: "12px",
    flex: "0 0 1px",
    background: "rgba(255,255,255,.18)",
  });

  const resistances = entry.legendaryResistances || {
    max: defaultResistances,
    current: defaultResistances,
  };
  const resistanceCluster = makeCluster();
  resistanceCluster.append(
    makeResourceLabel("R", "Resistenze leggendarie"),
    buildLegendaryResourcePips(resistances, onResistanceCurrent, {
      isGM,
      attitude: "enemy",
      kind: "resistance",
      config: pipsConfig,
      documentRef,
    }),
  );
  if (isGM) {
    resistanceCluster.appendChild(makeMaxControls(
      "resistenze leggendarie",
      resistances.max,
      onResistanceMax,
    ));
  }

  resourceDock.append(actionCluster, divider, resistanceCluster);
  return resourceDock;
}

export function buildClassicParagonDock(
  entry,
  {
    isGM,
    config,
    badgeRight,
    badgeSize,
    onSetActions,
    onError = () => {},
    documentRef = globalThis.document,
  },
) {
  if (entry?.__groupCollapsed ||
      !isGM ||
      !(Number(entry?.paragonActions) > 0) ||
      Number(entry?.legendary?.max) > 0) {
    return null;
  }
  const document = bossDocument(documentRef);
  const dock = document.createElement("div");
  Object.assign(dock.style, {
    position: "absolute",
    top: `${config.top}px`,
    right: `${bossControlRight(config, badgeRight, badgeSize)}px`,
    display: "flex",
    alignItems: "center",
    gap: `${config.gap}px`,
    padding: `${config.paddingY}px ${config.paddingX}px`,
    borderRadius: `${config.dockRadius || 0}px`,
    background: config.dockBg || "transparent",
    border: config.dockBorder || "none",
    zIndex: "5",
    pointerEvents: "auto",
  });

  const makeButton = (text, delta) => {
    const button = document.createElement("button");
    button.type = "button";
    Object.assign(button.style, {
      width: `${config.btnSize}px`,
      height: `${config.btnSize}px`,
      borderRadius: `${config.btnRadius}px`,
      border: "1px solid rgba(255,255,255,.18)",
      background: "rgba(0, 0, 0, 0.72)",
      color: "#fff",
      fontSize: "12px",
      fontWeight: "700",
      lineHeight: "1",
      padding: "0",
      cursor: "pointer",
      boxShadow: "0 1px 3px rgba(0,0,0,.4)",
      transition: "transform .12s ease, background-color .12s ease, border-color .12s ease",
    });
    button.textContent = text;
    button.addEventListener("mouseenter", () => {
      button.style.transform = "translateY(-1px)";
    });
    button.addEventListener("mouseleave", () => {
      button.style.transform = "translateY(0)";
    });
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const baseId = entry.__paragonBaseId || entry.id;
      const current = Math.max(
        1,
        Math.floor(Number(entry.paragonActions) || 1),
      );
      const next = Math.max(1, Math.min(10, current + delta));
      try {
        await onSetActions(baseId, next);
      } catch (error) {
        onError(error);
      }
    });
    return button;
  };

  const label = document.createElement("div");
  label.textContent = String(entry.paragonActions);
  Object.assign(label.style, {
    width: `${config.btnSize}px`,
    height: `${config.btnSize}px`,
    minWidth: `${config.btnSize}px`,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    borderRadius: `${config.btnRadius}px`,
    border: "1px solid rgba(255,255,255,.18)",
    background: "rgba(0, 0, 0, 0.72)",
    color: "#fff",
    fontSize: "12px",
    fontWeight: "700",
    lineHeight: "1",
    userSelect: "none",
  });

  dock.append(makeButton("−", -1), makeButton("+", 1), label);
  return dock;
}

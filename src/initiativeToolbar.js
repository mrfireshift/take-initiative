function toolbarDocument(documentRef) {
  if (!documentRef?.createElement) {
    throw new TypeError("A document with createElement is required");
  }
  return documentRef;
}

export function buildToolbarButton(
  text,
  { documentRef = globalThis.document } = {},
) {
  const button = toolbarDocument(documentRef).createElement("button");
  button.textContent = text;
  button.style.width = "100%";
  button.style.height = "28px";
  button.style.padding = "0 6px";
  button.style.border = "none";
  button.style.borderRadius = "6px";
  button.style.cursor = "pointer";
  button.style.background = "transparent";
  button.style.color = "white";
  button.style.fontSize = "18px";
  button.style.userSelect = "none";
  button.type = "button";
  button.tabIndex = -1;
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.style.outline = "none";
  button.onmouseenter = () => (button.style.background = "rgba(255,255,255,0.08)");
  button.onmouseleave = () => (button.style.background = "transparent");
  return button;
}

export function buildToolbarSection(
  title,
  content,
  { documentRef = globalThis.document } = {},
) {
  const document = toolbarDocument(documentRef);
  const section = document.createElement("section");
  const heading = document.createElement("div");
  heading.textContent = title;
  heading.dataset.toolbarHeading = "1";
  Object.assign(section.style, {
    minWidth: "0",
    display: "flex",
    alignItems: "center",
  });
  Object.assign(heading.style, {
    display: "none",
    color: "rgba(255,255,255,.58)",
    fontSize: "9px",
    fontWeight: "700",
    letterSpacing: ".08em",
    textTransform: "uppercase",
  });
  section.append(heading, content);
  return { section, heading };
}

export function decorateToolbarControl(
  control,
  label,
  { documentRef = globalThis.document } = {},
) {
  control.dataset.toolbarControl = "1";
  const caption = toolbarDocument(documentRef).createElement("span");
  caption.dataset.toolbarCaption = "1";
  caption.textContent = label;
  Object.assign(caption.style, {
    display: "none",
    maxWidth: "100%",
    overflow: "hidden",
    color: "rgba(255,255,255,.88)",
    fontSize: "10px",
    fontWeight: "600",
    lineHeight: "1.1",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    pointerEvents: "none",
  });
  control.appendChild(caption);
  return control;
}

export function setToolbarToggleVisual(wrap, active, { compact }) {
  const classic = !compact;
  wrap.setAttribute("aria-pressed", active ? "true" : "false");
  wrap.style.background = active
    ? "linear-gradient(180deg, rgba(37,99,235,.88), rgba(30,64,175,.72))"
    : classic
      ? "linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.025))"
      : "transparent";
  wrap.style.borderColor = active
    ? "rgba(147,197,253,.8)"
    : classic ? "rgba(148,163,184,.24)" : "transparent";
  wrap.style.boxShadow = active
    ? "inset 0 1px 0 rgba(255,255,255,.2), 0 5px 14px rgba(30,64,175,.26)"
    : classic ? "inset 0 1px 0 rgba(255,255,255,.04)" : "none";
}

export function buildGlobalPanelButton(
  title,
  iconPath,
  {
    invert = false,
    baseUrl = "/",
    documentRef = globalThis.document,
  } = {},
) {
  const document = toolbarDocument(documentRef);
  const button = document.createElement("button");
  button.type = "button";
  button.title = title;
  button.setAttribute("aria-label", title);
  Object.assign(button.style, {
    width: "28px",
    minWidth: "28px",
    height: "28px",
    padding: "0",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "8px",
    border: "1px solid transparent",
    background: "transparent",
    boxShadow: "none",
    cursor: "pointer",
  });
  const icon = document.createElement("img");
  icon.src = `${baseUrl}${iconPath}`;
  icon.alt = "";
  Object.assign(icon.style, {
    width: "15px",
    height: "15px",
    display: "block",
    objectFit: "contain",
    filter: invert ? "brightness(0) invert(1)" : "none",
    pointerEvents: "none",
  });
  button.appendChild(icon);
  decorateToolbarControl(button, title, { documentRef });
  return button;
}

export function applyToolbarLayoutPresentation(
  compact,
  {
    isGM,
    viewOptionsRow,
    encounterToolbar,
    trackersToolbar,
    sceneOptionsGroup,
    toolOptionsGroup,
    globalPanelsWrap,
  },
) {
  if (!isGM) {
    viewOptionsRow.style.display = "none";
    return;
  }
  const classic = !compact;

  Object.assign(viewOptionsRow.style, classic ? {
    display: "grid",
    flex: "0 0 auto",
    width: "100%",
    maxWidth: "none",
    height: "auto",
    minHeight: "68px",
    gridTemplateColumns: "minmax(88px, 2fr) minmax(0, 4fr)",
    gridAutoRows: "auto",
    alignItems: "stretch",
    justifyItems: "stretch",
    alignContent: "normal",
    justifyContent: "stretch",
    gap: "6px",
    padding: "5px",
    overflow: "hidden",
    boxSizing: "border-box",
    border: "1px solid rgba(148,163,184,.22)",
    borderRadius: "14px",
    background: "linear-gradient(180deg, rgba(16,21,31,.78), rgba(7,11,18,.72))",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.05)",
  } : {
    display: "grid",
    flex: "0 0 98px",
    width: "98px",
    maxWidth: "98px",
    height: "100%",
    minHeight: "0",
    gridTemplateColumns: "repeat(2, 40px)",
    gridAutoRows: "38px",
    alignItems: "center",
    justifyItems: "center",
    alignContent: "center",
    justifyContent: "center",
    gap: "4px",
    padding: "5px",
    overflow: "hidden",
    boxSizing: "border-box",
    border: "1px solid rgba(148,163,184,.24)",
    borderRadius: "14px",
    background: "linear-gradient(180deg, rgba(31,39,51,.82), rgba(18,24,34,.78))",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.07), 0 8px 20px rgba(0,0,0,.22)",
  });

  for (const toolbar of [encounterToolbar, trackersToolbar]) {
    Object.assign(toolbar.section.style, {
      display: classic ? "flex" : "contents",
      flex: classic ? "1 1 0" : "0 0 auto",
      width: classic ? "100%" : "auto",
      minWidth: "0",
      flexDirection: "column",
      alignItems: "stretch",
      gap: classic ? "4px" : "0",
      overflow: classic ? "hidden" : "visible",
    });
    toolbar.heading.style.display = classic ? "block" : "none";
    toolbar.heading.style.textAlign = "center";
  }

  Object.assign(sceneOptionsGroup.style, {
    width: classic ? "100%" : "auto",
    minWidth: "0",
    display: classic ? "grid" : "contents",
    gridTemplateColumns: classic ? "repeat(2, minmax(0, 1fr))" : "none",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: classic ? "3px" : "0",
  });
  Object.assign(toolOptionsGroup.style, {
    width: classic ? "100%" : "auto",
    minWidth: "0",
    display: classic ? "grid" : "contents",
    gridTemplateColumns: classic ? "repeat(4, minmax(0, 1fr))" : "none",
    alignItems: "center",
    justifyContent: "center",
    gap: classic ? "3px" : "0",
    paddingLeft: classic ? "7px" : "0",
    paddingTop: "0",
    boxSizing: "border-box",
    borderLeft: classic ? "1px solid rgba(148,163,184,.24)" : "none",
    borderTop: "none",
  });
  Object.assign(globalPanelsWrap.style, {
    display: "contents",
    width: "auto",
    minWidth: "0",
    alignItems: "center",
    flexDirection: "row",
    gap: "0",
  });

  viewOptionsRow.querySelectorAll("[data-toolbar-control='1']").forEach((control) => {
    const active = control.getAttribute("aria-pressed") === "true";
    Object.assign(control.style, {
      width: classic ? "100%" : "40px",
      minWidth: "0",
      maxWidth: classic ? "100%" : "40px",
      boxSizing: "border-box",
      height: classic ? "46px" : "36px",
      minHeight: classic ? "46px" : "36px",
      flexDirection: classic ? "column" : "row",
      justifyContent: "center",
      gap: classic ? "3px" : "0",
      padding: "0 2px",
      overflow: "hidden",
      borderRadius: classic ? "10px" : "9px",
      border: active
        ? "1px solid rgba(147,197,253,.8)"
        : "1px solid rgba(148,163,184,.24)",
      background: active
        ? "linear-gradient(180deg, rgba(37,99,235,.88), rgba(30,64,175,.72))"
        : "linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.025))",
      boxShadow: active
        ? "inset 0 1px 0 rgba(255,255,255,.2), 0 5px 14px rgba(30,64,175,.26)"
        : "inset 0 1px 0 rgba(255,255,255,.04)",
    });
    const icon = control.querySelector("img");
    if (icon) {
      icon.style.width = "18px";
      icon.style.height = "18px";
      icon.style.flex = "0 0 auto";
    }
    const caption = control.querySelector("[data-toolbar-caption='1']");
    if (caption) {
      caption.style.display = classic ? "block" : "none";
      caption.style.width = "100%";
      caption.style.maxWidth = "100%";
      caption.style.fontSize = "8px";
      caption.style.lineHeight = "1";
      caption.style.letterSpacing = "-.01em";
      caption.style.whiteSpace = "nowrap";
      caption.style.overflow = "hidden";
      caption.style.textOverflow = "clip";
      caption.style.textAlign = "center";
    }
  });
}

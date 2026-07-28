export function makeReferenceButton(title, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.title = title;
  button.setAttribute("aria-label", title);
  const icon = document.createElement("img");
  icon.src = "/info.svg";
  icon.alt = "";
  icon.setAttribute("aria-hidden", "true");
  Object.assign(icon.style, {
    display: "block",
    width: "14px",
    height: "14px",
    pointerEvents: "none",
  });
  button.appendChild(icon);
  Object.assign(button.style, {
    display: "inline-grid",
    placeItems: "center",
    flex: "0 0 28px",
    width: "28px",
    minWidth: "28px",
    height: "28px",
    minHeight: "28px",
    padding: "0",
    borderRadius: "8px",
    background: "rgba(37,99,235,.18)",
    border: "1px solid rgba(96,165,250,.36)",
    color: "#fff",
    fontSize: "15px",
    lineHeight: "1",
    cursor: "pointer",
  });
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void onClick?.(event);
  });
  return button;
}

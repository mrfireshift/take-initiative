export function makeReferenceButton(title, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "ⓘ";
  button.title = title;
  button.setAttribute("aria-label", title);
  Object.assign(button.style, {
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

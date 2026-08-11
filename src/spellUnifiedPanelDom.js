export function createNode(documentRef, tagName, {
  className = "",
  id = "",
  text = "",
  attributes = {},
  children = [],
} = {}) {
  const node = documentRef.createElement(tagName);
  if (className) node.className = className;
  if (id) node.id = id;
  if (text !== "") node.textContent = String(text);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === null || value === undefined) continue;
    node.setAttribute(name, String(value));
  }
  for (const child of children) {
    if (child) node.append(child);
  }
  return node;
}

export function appendText(documentRef, parent, text) {
  parent.append(documentRef.createTextNode(String(text ?? "")));
  return parent;
}

export function clearNode(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function createButton(documentRef, {
  label,
  className = "",
  value = "",
  ariaLabel = "",
  pressed,
  disabled = false,
  attributes = {},
} = {}) {
  const button = createNode(documentRef, "button", {
    className,
    text: label,
    attributes: {
      type: "button",
      ...(value ? { "data-value": value } : {}),
      ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
      ...(pressed === undefined ? {} : { "aria-pressed": pressed }),
      ...attributes,
    },
  });
  button.disabled = disabled;
  return button;
}

export function createField(documentRef, {
  id,
  label,
  control,
  hint = "",
  invalid = false,
  className = "unified-field",
} = {}) {
  const field = createNode(documentRef, "div", { className });
  const labelNode = createNode(documentRef, "label", {
    className: "unified-field__label",
    text: label,
    attributes: { for: id },
  });
  field.append(labelNode, control);
  if (hint) {
    field.append(createNode(documentRef, "div", {
      className: "unified-field__hint",
      text: hint,
    }));
  }
  if (invalid) {
    field.dataset.invalid = "true";
  }
  return field;
}

export function createSelect(documentRef, {
  id,
  options = [],
  value = "",
  disabled = false,
  invalid = false,
  attributes = {},
} = {}) {
  const select = createNode(documentRef, "select", {
    id,
    attributes: {
      ...(invalid ? { "aria-invalid": "true" } : {}),
      ...attributes,
    },
  });
  for (const option of options) {
    const optionNode = createNode(documentRef, "option", {
      text: option.label,
      attributes: { value: option.value },
    });
    optionNode.selected = String(option.value) === String(value);
    select.append(optionNode);
  }
  select.disabled = disabled;
  return select;
}

export function createStatusChip(documentRef, label, value, className = "") {
  return createNode(documentRef, "span", {
    className: `unified-chip ${className}`.trim(),
    children: [
      createNode(documentRef, "span", {
        className: "unified-chip__label",
        text: label,
      }),
      createNode(documentRef, "strong", {
        className: "unified-chip__value",
        text: value,
      }),
    ],
  });
}
